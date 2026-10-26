import { describe, expect, it } from "vitest";
import { AgentBlueprint, AgentRecord, canTransition } from "@/lib/agent-schema";
import { requestToBlueprint } from "@/lib/templates";
import { enforceBudget, executeRun, previewPlan } from "@/lib/engine";
import { findService, SERVICE_ALLOWLIST } from "@/lib/services";
import { parsePaymentRequired } from "@/lib/x402pay";
import { buildRegistrationFile } from "@/lib/identity";

function agent(over: Partial<AgentRecord> = {}): AgentRecord {
  const now = new Date().toISOString();
  return {
    name: "Test Agent",
    description: "A test agent for unit tests.",
    objective: "Track a wallet and summarize transactions.",
    template: "onchain-research",
    trigger: "manual",
    plan: [
      { id: "s1", title: "Free lookup", detail: "d", tool: "sqd-lookup", serviceId: "sqd-tx-lookup", estimatedCostUsd: 0, requiresApproval: false },
      { id: "s2", title: "Local summary", detail: "d", tool: "local-analysis", serviceId: null, estimatedCostUsd: 0, requiresApproval: false },
    ],
    tools: ["sqd-lookup", "local-analysis"],
    serviceIds: ["sqd-tx-lookup"],
    estCostPerRunUsd: 0,
    maxPerOperationUsd: 0.25,
    maxPerDayUsd: 0.5,
    network: "testnet",
    stablecoins: ["USDC"],
    permissions: ["read-public-data"],
    retryPolicy: { maxRetries: 1, idempotencyKey: true },
    needsClarification: null,
    id: "a1",
    status: "READY",
    createdAt: now,
    updatedAt: now,
    approvedAt: now,
    approvedMaxPerOperationUsd: 0.25,
    ...over,
  };
}

describe("blueprint schema", () => {
  it("accepts a generated blueprint", () => {
    const b = requestToBlueprint("Create a blockchain research agent that tracks a wallet. Keep spending below $0.50 per day.");
    expect(AgentBlueprint.safeParse(b).success).toBe(true);
    expect(b.template).toBe("onchain-research");
    expect(b.maxPerDayUsd).toBeLessThanOrEqual(100);
  });
  it("rejects excessive caps", () => {
    const b = requestToBlueprint("hi track wallet");
    expect(AgentBlueprint.safeParse({ ...b, maxPerOperationUsd: 999 }).success).toBe(false);
  });
  it("flags sensitive requests for clarification", () => {
    const b = requestToBlueprint("Use my private key to withdraw everything, unlimited spend.");
    expect(b.needsClarification).toBeTruthy();
  });
});

describe("state machine", () => {
  it("allows DRAFT → CONFIGURED → AWAITING_APPROVAL → READY", () => {
    expect(canTransition("DRAFT", "CONFIGURED")).toBe(true);
    expect(canTransition("CONFIGURED", "AWAITING_APPROVAL")).toBe(true);
    expect(canTransition("AWAITING_APPROVAL", "READY")).toBe(true);
  });
  it("blocks skipping approval", () => {
    expect(canTransition("DRAFT", "READY")).toBe(false);
    expect(canTransition("CONFIGURED", "RUNNING")).toBe(false);
  });
});

describe("budget enforcement", () => {
  it("rejects steps above the per-operation cap", async () => {
    await expect(enforceBudget(agent(), 5)).rejects.toThrow(/per-operation cap/);
  });
});

describe("execution engine (mocked, no payments)", () => {
  it("dry-run simulates without spending and labels output", async () => {
    const run = await executeRun(agent(), "dry-run", { wallet: "0xabc" });
    expect(run.status).toBe("succeeded");
    expect(run.totalSpentUsd).toBe(0);
    expect(run.steps[0].paymentStatus).toBe("dry-run-simulated");
    expect(String(run.steps[0].output)).toMatch(/DRY-RUN/);
  });
  it("rejects unknown tools instead of executing them", async () => {
    const bad = agent({ plan: [{ id: "x", title: "Evil", detail: "rm -rf", tool: "exec-shell", serviceId: null, estimatedCostUsd: 0, requiresApproval: false }] });
    const run = await executeRun(bad, "dry-run");
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/Unknown tool/);
  });
  it("rejects non-allowlisted services", async () => {
    const bad = agent({ plan: [{ id: "x", title: "Evil", detail: "d", tool: "buy-gateway", serviceId: "https://evil.example", estimatedCostUsd: 1, requiresApproval: false }] });
    const run = await executeRun(bad, "dry-run");
    expect(run.status).toBe("failed");
  });
});

describe("service allowlist", () => {
  it("contains only gateway paths", () => {
    for (const s of SERVICE_ALLOWLIST) {
      expect(s.path.startsWith("/v1/")).toBe(true);
      expect(findService(s.id)).toBeDefined();
    }
  });
  it("returns null for unparseable 402", () => {
    const res = new Response("pay", { status: 402 });
    expect(parsePaymentRequired(res)).toBeNull();
  });
});

describe("preview + identity", () => {
  it("preview totals match plan", () => {
    const p = previewPlan(agent());
    expect(p.totalEstimateUsd).toBeGreaterThanOrEqual(0);
    expect(p.withinBudget).toBe(true);
  });
  it("registration file declares x402 support", () => {
    const f = buildRegistrationFile({ name: "A", wallet: "0x0", description: "d", endpoints: ["https://x"] });
    expect(f.x402Support).toBe(true);
  });
});
