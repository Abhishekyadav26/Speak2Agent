"use client";
import { useState } from "react";
import { buildRegistrationFile } from "@/lib/identity";

export default function IdentityPanel({ network, attribution }: { network: string; attribution: string }) {
  const [wallet, setWallet] = useState("");
  const [name, setName] = useState("Speak2Agent");
  const [agentId, setAgentId] = useState<string | null>(null);
  const registry = process.env.NEXT_PUBLIC_ERC8004_IDENTITY_REGISTRY || "";

  async function connect() {
    const eth = (window as unknown as { ethereum?: { request: (a: { method: string; params?: unknown }) => Promise<string[]> } }).ethereum;
    if (!eth) { alert("No EVM wallet found."); return; }
    const accounts = await eth.request({ method: "eth_requestAccounts" });
    setWallet(accounts[0] || "");
  }

  function prepare() {
    if (!wallet) { alert("Connect the agent wallet first."); return; }
    // Deterministic local agent ID preview (not a chain registration).
    const id = `agent-${wallet.slice(2, 8).toLowerCase()}-${Date.now().toString(36)}`;
    setAgentId(id);
    const file = buildRegistrationFile({
      name, wallet,
      description: `${name} — voice-built AI agent paying for services via buy/x402 on Celo.`,
      endpoints: [`${window.location.origin}/api/runs`],
    });
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "erc8004-registration.json";
    a.click();
  }

  const done = [
    { label: "Payment wallet configured (server-side)", ok: false, hint: "Manual: set BUY_PAYER_PRIVATE_KEY on the server. Never paste keys in the browser." },
    { label: `Attribution tag configured`, ok: Boolean(attribution), hint: attribution || "Manual: set HACKATHON_ATTRIBUTION_TAG from loops.house enrollment." },
    { label: "ERC-8004 registry address known", ok: Boolean(registry), hint: registry || "Pending: registry deployment for the chosen chain not yet configured (env)." },
    { label: "Agent identity registered onchain", ok: false, hint: agentId ? `Prepared locally: ${agentId}. Onchain registration is a manual wallet step.` : "Pending: connect wallet and prepare metadata." },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <h3 className="text-sm font-semibold">Agent wallet</h3>
        <p className="mt-1 text-xs text-zinc-500">ERC-8004 registration and payment attribution must reference the same agent wallet.</p>
        <div className="mt-3 flex gap-2">
          <button onClick={connect} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs hover:bg-zinc-700">
            {wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : "Connect wallet"}
          </button>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Agent name"
            aria-label="Agent name"
            className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs" />
          <button onClick={prepare} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">
            Prepare metadata
          </button>
        </div>
        {agentId && <p className="mt-2 text-xs text-emerald-300">Prepared {agentId} — metadata JSON downloaded.</p>}
        <p className="mt-2 text-xs text-zinc-500">Network: <strong className="text-zinc-200">{network}</strong> (testnet activity is never shown as mainnet).</p>
      </div>
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <h3 className="text-sm font-semibold">Hackathon checklist</h3>
        <ul className="mt-2 space-y-2 text-xs">
          {done.map((d) => (
            <li key={d.label} className="rounded-lg border border-zinc-800 bg-zinc-900 p-2">
              <span className={d.ok ? "text-emerald-300" : "text-amber-300"}>{d.ok ? "✓ " : "○ "}</span>
              {d.label}
              <span className="block text-zinc-500">{d.hint}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
