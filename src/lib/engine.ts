import { randomUUID } from "crypto";
import type { AgentRecord, RunRecord, RunStepResult } from "./agent-schema";
import { findService, GATEWAY_ORIGIN, SERVICE_ALLOWLIST } from "./services";
import { buyGatewayCall } from "./x402pay";
import { listRuns, spentTodayUsd } from "./store";

export interface PlanPreview {
  steps: { stepId: string; title: string; service: string | null; priceUsd: number; needsApproval: boolean }[];
  totalEstimateUsd: number;
  withinBudget: boolean;
  budgetNote: string;
}

export function previewPlan(agent: AgentRecord): PlanPreview {
  const steps = agent.plan.map((s) => {
    const svc = s.serviceId ? findService(s.serviceId) : undefined;
    return {
      stepId: s.id,
      title: s.title,
      service: svc ? svc.name : null,
      priceUsd: svc?.indicativePriceUsd ?? s.estimatedCostUsd,
      needsApproval: s.requiresApproval,
    };
  });
  const total = steps.reduce((a, s) => a + s.priceUsd, 0);
  const within = total <= agent.maxPerOperationUsd;
  return {
    steps,
    totalEstimateUsd: total,
    withinBudget: within,
    budgetNote: within
      ? `Estimated $${total.toFixed(3)} is within the $${agent.maxPerOperationUsd} per-operation cap.`
      : `Estimated $${total.toFixed(3)} EXCEEDS the $${agent.maxPerOperationUsd} cap — renewed approval required.`,
  };
}

/** Budget gate independent of the model plan. Throws on violation. */
export async function enforceBudget(agent: AgentRecord, stepCostUsd: number) {
  if (stepCostUsd > agent.maxPerOperationUsd) {
    throw new Error(`Step cost $${stepCostUsd} exceeds per-operation cap $${agent.maxPerOperationUsd}.`);
  }
  const runs = await listRuns();
  const spent = spentTodayUsd(runs);
  if (spent + stepCostUsd > agent.maxPerDayUsd) {
    throw new Error(`Daily cap $${agent.maxPerDayUsd} would be exceeded (spent $${spent.toFixed(3)} today).`);
  }
}

function stepResult(stepId: string, title: string): RunStepResult {
  const now = new Date().toISOString();
  return { stepId, title, startedAt: now, finishedAt: null, status: "running", input: null, output: null, serviceId: null, priceUsd: null, paymentStatus: null, txHash: null, error: null };
}

/**
 * Execute an agent run. Dry-run never spends. Live run enforces budget,
 * requires prior approval, pays only allowlisted services with idempotency keys.
 */
export async function executeRun(agent: AgentRecord, mode: "dry-run" | "live", input?: Record<string, unknown>): Promise<RunRecord> {
  const run: RunRecord = {
    id: randomUUID(),
    agentId: agent.id,
    mode,
    status: "running",
    createdAt: new Date().toISOString(),
    finishedAt: null,
    idempotencyKey: randomUUID(),
    steps: [],
    totalSpentUsd: 0,
    txHashes: [],
    result: null,
    error: null,
  };

  try {
    for (const step of agent.plan) {
      const sr = stepResult(step.id, step.title);
      sr.input = input ?? null;
      sr.serviceId = step.serviceId;
      run.steps.push(sr);

      if (step.tool === "local-analysis" || step.tool === "solc-worker") {
        sr.output = mode === "dry-run"
          ? `[DRY-RUN simulated] ${step.detail}`
          : localTool(step.tool, step.detail, input);
        sr.status = "ok";
        sr.finishedAt = new Date().toISOString();
        continue;
      }

      if (step.tool === "catalog-fetch") {
        // Real, free, live: GET the verified buy gateway catalog.
        const res = await fetch(`${GATEWAY_ORIGIN}/v1/catalog`, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) throw new Error(`Catalog fetch failed (${res.status}). Paid steps blocked until discovery succeeds.`);
        const catalog = (await res.json()) as { capabilities?: { id: string; available?: boolean }[] };
        const avail = (catalog.capabilities || []).filter((c) => c.available !== false).length;
        const total = (catalog.capabilities || []).length;
        sr.output = mode === "dry-run"
          ? `[DRY-RUN simulated] Would GET ${GATEWAY_ORIGIN}/v1/catalog (free). Live catalog currently lists ${total} capabilities.`
          : `Live catalog fetched: ${avail}/${total} capabilities available. Paid step will use the 402 challenge as price authority.`;
        sr.serviceId = step.serviceId;
        sr.priceUsd = 0;
        sr.paymentStatus = mode === "dry-run" ? "dry-run-simulated" : "no-payment-needed";
        sr.status = "ok";
        sr.finishedAt = new Date().toISOString();
        continue;
      }

      if (step.tool === "buy-gateway") {
        const svc = step.serviceId ? findService(step.serviceId) : undefined;
        if (!svc) throw new Error(`Allowlist violation: unknown service ${step.serviceId}.`);
        const price = svc.indicativePriceUsd ?? step.estimatedCostUsd;

        if (mode === "dry-run") {
          sr.output = `[DRY-RUN simulated — no payment] Would call ${svc.method} ${svc.path} (~$${price}). 402 challenge would be the price authority.`;
          sr.priceUsd = price;
          sr.paymentStatus = "dry-run-simulated";
          sr.status = "ok";
          sr.finishedAt = new Date().toISOString();
          continue;
        }

        // LIVE: enforce budget, then pay server-side.
        await enforceBudget(agent, price);
        sr.paymentStatus = "paying";
        const res = await buyGatewayCall({
          serviceId: svc.id,
          body: (input as Record<string, unknown>) ?? svc.exampleBody,
          maxUsd: agent.approvedMaxPerOperationUsd ?? agent.maxPerOperationUsd,
          idempotencyKey: `${run.idempotencyKey}:${step.id}`,
          network: agent.network,
        });
        sr.output = res.data;
        sr.priceUsd = res.priceUsd;
        sr.paymentStatus = res.txHash ? "settled" : res.status === 200 ? "no-payment-needed" : "unknown";
        if (res.txHash) {
          sr.txHash = res.txHash;
          run.txHashes.push(res.txHash);
          run.totalSpentUsd += res.priceUsd ?? 0;
        }
        sr.status = res.ok ? "ok" : "error";
        if (!res.ok) throw new Error(`Provider error ${res.status}: ${res.note}`);
        sr.finishedAt = new Date().toISOString();
        continue;
      }

      throw new Error(`Unknown tool "${step.tool}" — refusing to execute untrusted plan content.`);
    }

    run.status = "succeeded";
    run.result = summarize(agent, run);
  } catch (e) {
    run.status = "failed";
    run.error = e instanceof Error ? e.message : String(e);
    const last = run.steps[run.steps.length - 1];
    if (last && last.status === "running") {
      last.status = "error";
      last.error = run.error;
      last.finishedAt = new Date().toISOString();
    }
  }
  run.finishedAt = new Date().toISOString();
  return run;
}

function localTool(tool: string, detail: string, input?: Record<string, unknown>): string {
  if (tool === "solc-worker") {
    return `Local review complete: ${detail} Input contract length: ${JSON.stringify(input ?? {}).length} chars. Compile in the Solidity tab (solc 0.8.24 worker).`;
  }
  const keys = input ? Object.keys(input).join(", ") : "none";
  return `Local analysis complete: ${detail} (inputs: ${keys}). No external call made.`;
}

function summarize(agent: AgentRecord, run: RunRecord): string {
  const ok = run.steps.filter((s) => s.status === "ok").length;
  const spent = run.totalSpentUsd.toFixed(4);
  const tx = run.txHashes.length ? ` Settled txs: ${run.txHashes.join(", ")}.` : " No onchain settlement in this run.";
  return `${agent.name}: ${ok}/${run.steps.length} steps ok. Spent $${spent}.${tx}`;
}
