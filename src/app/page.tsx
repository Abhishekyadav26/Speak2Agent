"use client";
import { useCallback, useEffect, useState } from "react";
import CommandBar from "@/components/CommandBar";
import BlueprintEditor from "@/components/BlueprintEditor";
import SolidityIDE from "@/components/SolidityIDE";
import IdentityPanel from "@/components/IdentityPanel";
import type { AgentBlueprint, AgentRecord, RunRecord } from "@/lib/agent-schema";
import { TEMPLATES } from "@/lib/templates";

type Tab = "build" | "solidity" | "runs" | "identity";

export default function Home() {
  const [tab, setTab] = useState<Tab>("build");
  const [busy, setBusy] = useState(false);
  const [blueprint, setBlueprint] = useState<AgentBlueprint | null>(null);
  const [agent, setAgent] = useState<AgentRecord | null>(null);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [network] = useState(() => process.env.NEXT_PUBLIC_CELO_NETWORK || "testnet");
  const [attribution] = useState(() => process.env.NEXT_PUBLIC_HACKATHON_ATTRIBUTION_TAG || "");

  const refresh = useCallback(async () => {
    const [a, r] = await Promise.all([
      fetch("/api/agents").then((x) => x.json()).catch(() => ({ agents: [] })),
      fetch("/api/runs").then((x) => x.json()).catch(() => ({ runs: [] })),
    ]);
    setAgents(a.agents || []);
    setRuns(r.runs || []);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function generate(request: string) {
    setBusy(true);
    setNotice(null);
    try {
      const r = await fetch("/api/blueprint", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ request }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Blueprint failed.");
      setBlueprint(j.blueprint);
      const now = new Date().toISOString();
      setAgent({
        ...j.blueprint,
        id: crypto.randomUUID(),
        status: "DRAFT",
        createdAt: now,
        updatedAt: now,
        approvedAt: null,
        approvedMaxPerOperationUsd: null,
      });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function persist(next: AgentRecord) {
    const r = await fetch("/api/agents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(next) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "Save failed.");
    setAgent(j.agent);
    refresh();
  }

  async function transition(to: AgentRecord["status"]) {
    if (!agent) return;
    if (to === "CONFIGURED" && blueprint) await persist({ ...agent, ...blueprint, status: "DRAFT" });
    const r = await fetch("/api/agents", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: agent.id, to }) });
    const j = await r.json();
    if (!r.ok) { setNotice(j.error || "Transition failed."); return; }
    setAgent(j.agent);
    refresh();
  }

  async function run(mode: "dry-run" | "live", approved = false) {
    if (!agent) return;
    if (mode === "live" && !approved) {
      if (!confirm(`Approve a LIVE run spending up to $${agent.maxPerOperationUsd} per operation (cap $${agent.maxPerDayUsd}/day) on ${agent.network}?`)) return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId: agent.id, mode, input: { request: agent.objective } }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Run failed.");
      setNotice(mode === "dry-run" ? "Dry-run complete — simulated, no payment made." : `Live run ${j.run.status}. Spent $${j.run.totalSpentUsd}.`);
      refresh();
      setTab("runs");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const totalSpent = runs.filter((r) => r.mode === "live" && r.status === "succeeded").reduce((a, r) => a + r.totalSpentUsd, 0);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 text-zinc-100">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Speak2Agent</h1>
          <p className="text-xs text-zinc-400">Voice-to-AI-agent builder · buys services via Celo x402 · Solidity IDE on Base Sepolia</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full border border-zinc-700 px-2 py-1 text-zinc-300">
            {network === "mainnet" ? "● Celo Mainnet" : "○ Celo Sepolia (testnet)"}
          </span>
          <span className="rounded-full border border-zinc-700 px-2 py-1 text-zinc-400">USDC</span>
        </div>
      </header>

      <nav className="mt-4 flex gap-2" aria-label="Sections">
        {(["build", "solidity", "runs", "identity"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm capitalize ${tab === t ? "bg-zinc-100 text-zinc-900" : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"}`}>
            {t === "build" ? "Agent builder" : t === "solidity" ? "Solidity IDE" : t === "runs" ? "Runs & payments" : "Identity"}
          </button>
        ))}
      </nav>

      {notice && <p role="status" className="mt-3 rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-xs">{notice}</p>}

      {tab === "build" && (
        <section className="mt-4 space-y-4">
          <CommandBar onSubmit={generate} busy={busy} />
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((t) => (
              <div key={t.id} className="flex-1 min-w-52 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                <h3 className="text-sm font-semibold">{t.name}</h3>
                <p className="text-xs text-zinc-500">{t.blurb}</p>
                <button onClick={() => generate(t.prompts[0])} className="mt-2 rounded-lg bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700">
                  Try: “{t.prompts[0].slice(0, 48)}…”
                </button>
              </div>
            ))}
          </div>

          {blueprint && agent && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Blueprint — status: {agent.status}</h2>
                <span className="text-xs text-zinc-500">DRAFT → CONFIGURED → AWAITING_APPROVAL → READY → RUNNING</span>
              </div>
              <BlueprintEditor blueprint={blueprint} onChange={(b) => { setBlueprint(b); setAgent({ ...agent, ...b }); }} />
              <div className="mt-3 flex flex-wrap gap-2">
                {agent.status === "DRAFT" && <button onClick={() => transition("CONFIGURED")} className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-900">Save configuration</button>}
                {agent.status === "CONFIGURED" && <button onClick={() => transition("AWAITING_APPROVAL")} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white">Request approval</button>}
                {agent.status === "AWAITING_APPROVAL" && <button onClick={() => transition("READY")} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">Approve plan + budget</button>}
                {(agent.status === "READY" || agent.status === "SUCCEEDED" || agent.status === "FAILED") && (
                  <>
                    <button onClick={() => run("dry-run")} disabled={busy} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs hover:bg-zinc-700">Dry-run (free, simulated)</button>
                    <button onClick={() => run("live")} disabled={busy} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">Live run (paid, capped)</button>
                  </>
                )}
              </div>
            </div>
          )}

          {agents.length > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <h2 className="text-sm font-semibold">Recent agents</h2>
              <ul className="mt-2 space-y-1 text-xs">
                {agents.slice(0, 8).map((a) => (
                  <li key={a.id} className="flex justify-between gap-2 rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5">
                    <span>{a.name} · {a.template} · <span className="text-zinc-400">{a.status}</span></span>
                    <button onClick={() => { setAgent(a); setBlueprint(a); }} className="text-emerald-300 hover:underline">Open</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {tab === "solidity" && (
        <section className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <SolidityIDE />
        </section>
      )}

      {tab === "runs" && (
        <section className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm">Total spent (live, settled)<div className="text-xl font-bold">${totalSpent.toFixed(4)}</div></div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm">Runs<div className="text-xl font-bold">{runs.length}</div></div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm">Network<div className="text-xl font-bold">{network}</div></div>
          </div>
          {runs.length === 0 && <p className="text-sm text-zinc-500">No runs yet. Build an agent, dry-run it, then execute a small live operation.</p>}
          {runs.map((r) => (
            <article key={r.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="flex flex-wrap justify-between gap-2 text-xs">
                <span><strong>{r.mode}</strong> · {r.status} · {new Date(r.createdAt).toLocaleString()}</span>
                <span className="text-zinc-500">idempotency {r.idempotencyKey.slice(0, 8)}…</span>
              </div>
              {r.mode === "dry-run" && <p className="mt-1 text-xs text-amber-300">Simulated — not an onchain payment.</p>}
              <ol className="mt-2 space-y-1 text-xs">
                {r.steps.map((s) => (
                  <li key={s.stepId} className="rounded border border-zinc-800 bg-zinc-900 p-2">
                    <span className={s.status === "ok" ? "text-emerald-300" : s.status === "error" ? "text-red-300" : "text-zinc-300"}>
                      [{s.status}]
                    </span> {s.title}
                    {s.priceUsd != null && <span className="text-zinc-400"> · ${s.priceUsd}</span>}
                    {s.paymentStatus && <span className="text-zinc-400"> · {s.paymentStatus}</span>}
                    {s.txHash && <span className="text-emerald-300"> · tx {s.txHash}</span>}
                    {typeof s.output === "string" && <span className="block text-zinc-400">{s.output.slice(0, 300)}</span>}
                    {s.error && <span className="block text-red-300">{s.error}</span>}
                  </li>
                ))}
              </ol>
              {r.result && <p className="mt-2 text-xs text-zinc-300">{r.result}</p>}
              {r.error && <p className="mt-2 text-xs text-red-300">{r.error}</p>}
            </article>
          ))}
        </section>
      )}

      {tab === "identity" && (
        <section className="mt-4">
          <IdentityPanel network={network} attribution={attribution} />
        </section>
      )}
    </main>
  );
}
