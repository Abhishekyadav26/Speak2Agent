"use client";
import type { AgentBlueprint } from "@/lib/agent-schema";
import { findService } from "@/lib/services";

export default function BlueprintEditor({
  blueprint, onChange,
}: { blueprint: AgentBlueprint; onChange: (b: AgentBlueprint) => void }) {
  const set = (patch: Partial<AgentBlueprint>) => onChange({ ...blueprint, ...patch });
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="block">
        <span className="text-xs text-zinc-400">Agent name</span>
        <input value={blueprint.name} onChange={(e) => set({ name: e.target.value })}
          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm" />
      </label>
      <label className="block">
        <span className="text-xs text-zinc-400">Template</span>
        <select value={blueprint.template}
          onChange={(e) => set({ template: e.target.value as AgentBlueprint["template"] })}
          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm">
          <option value="onchain-research">Onchain Research Agent</option>
          <option value="contract-assistant">Smart Contract Assistant</option>
          <option value="web-research">Web Research Agent</option>
        </select>
      </label>
      <label className="block md:col-span-2">
        <span className="text-xs text-zinc-400">Objective</span>
        <textarea value={blueprint.objective} onChange={(e) => set({ objective: e.target.value })} rows={2}
          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm" />
      </label>
      <div className="md:col-span-2">
        <h3 className="text-xs font-semibold text-zinc-400">Plan &amp; paid services</h3>
        <ul className="mt-2 space-y-2">
          {blueprint.plan.map((s, i) => {
            const svc = s.serviceId ? findService(s.serviceId) : undefined;
            return (
              <li key={s.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <strong>{i + 1}. {s.title}</strong>
                  <span className="text-xs text-zinc-400">
                    {svc ? `${svc.name} · ~$${svc.indicativePriceUsd}` : "local · free"}
                    {s.requiresApproval && <span className="ml-2 rounded bg-amber-900 px-1.5 py-0.5 text-amber-200">approval</span>}
                  </span>
                </div>
                <p className="mt-1 text-zinc-400">{s.detail}</p>
              </li>
            );
          })}
        </ul>
      </div>
      <label className="block">
        <span className="text-xs text-zinc-400">Max per operation (USD, ≤ 25)</span>
        <input type="number" step="0.01" min="0.01" max="25" value={blueprint.maxPerOperationUsd}
          onChange={(e) => set({ maxPerOperationUsd: Math.min(25, Math.max(0.01, Number(e.target.value) || 0.01)) })}
          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm" />
      </label>
      <label className="block">
        <span className="text-xs text-zinc-400">Max per day (USD, ≤ 100)</span>
        <input type="number" step="0.01" min="0.05" max="100" value={blueprint.maxPerDayUsd}
          onChange={(e) => set({ maxPerDayUsd: Math.min(100, Math.max(0.05, Number(e.target.value) || 0.05)) })}
          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm" />
      </label>
      <label className="block">
        <span className="text-xs text-zinc-400">Trigger</span>
        <select value={blueprint.trigger} onChange={(e) => set({ trigger: e.target.value as AgentBlueprint["trigger"] })}
          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm">
          <option value="manual">Manual</option>
          <option value="daily">Daily (manual run in MVP)</option>
          <option value="weekly">Weekly (manual run in MVP)</option>
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-zinc-400">Network</span>
        <select value={blueprint.network} onChange={(e) => set({ network: e.target.value as "mainnet" | "testnet" })}
          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm">
          <option value="testnet">Celo Sepolia (testnet)</option>
          <option value="mainnet">Celo Mainnet (real funds — warning shown)</option>
        </select>
      </label>
      {blueprint.network === "mainnet" && (
        <p className="rounded-lg border border-red-900 bg-red-950 p-2 text-xs text-red-200 md:col-span-2">
          ⚠ Mainnet uses real stablecoins. Fund only a dedicated agent wallet with a small float.
        </p>
      )}
      {blueprint.needsClarification && (
        <p className="rounded-lg border border-amber-900 bg-amber-950 p-2 text-xs text-amber-200 md:col-span-2">
          {blueprint.needsClarification}
        </p>
      )}
      <p className="text-xs text-zinc-500 md:col-span-2">
        Est. cost per run: <strong className="text-zinc-200">${blueprint.estCostPerRunUsd.toFixed(3)}</strong> ·
        Stablecoin: USDC · Settlement: Celo x402 via buy gateway (402 challenge is the price authority).
      </p>
    </div>
  );
}
