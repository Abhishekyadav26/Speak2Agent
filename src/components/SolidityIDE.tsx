"use client";
import { useState } from "react";

const DEFAULT_CONTRACT = `// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract Counter {
    uint256 public count;
    function inc() external {
        count += 1;
    }
}
`;

export default function SolidityIDE() {
  const [code, setCode] = useState(DEFAULT_CONTRACT);
  const [output, setOutput] = useState("Worker idle. Compile with solc 0.8.24.");
  const [account, setAccount] = useState<string | null>(null);

  async function compile() {
    setOutput("Compiling in Web Worker (solc 0.8.24)…");
    try {
      const worker = new Worker("/solc-worker.js");
      const result: string = await new Promise((resolve, reject) => {
        const t = setTimeout(() => { worker.terminate(); reject(new Error("Compile timed out (20s).")); }, 20000);
        worker.onmessage = (e) => { clearTimeout(t); worker.terminate(); resolve(String(e.data)); };
        worker.onerror = (e) => { clearTimeout(t); worker.terminate(); reject(new Error(e.message || "Worker error")); };
        worker.postMessage({ source: code });
      });
      setOutput(result);
    } catch (e) {
      setOutput(`Compile failed: ${e instanceof Error ? e.message : e}\n(The worker loads solc 0.8.24 from the solc-bin CDN — network required.)`);
    }
  }

  async function connect() {
    const eth = (window as unknown as { ethereum?: { request: (a: { method: string; params?: unknown }) => Promise<string[]> } }).ethereum;
    if (!eth) { setOutput("No EVM wallet found. Install MetaMask to deploy to Base Sepolia."); return; }
    try {
      const accounts = await eth.request({ method: "eth_requestAccounts" });
      setAccount(accounts[0] ?? null);
      setOutput(`Connected ${accounts[0]}. Deploy target: Base Sepolia (chain 84532) — switch network in your wallet before deploying.`);
    } catch (e) {
      setOutput(`Wallet connection rejected: ${e instanceof Error ? e.message : e}`);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Solidity 0.8.24 editor</h3>
          <div className="flex gap-2">
            <button onClick={compile} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs hover:bg-zinc-700">Compile</button>
            <button onClick={connect} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs hover:bg-zinc-700">
              {account ? `${account.slice(0, 6)}…${account.slice(-4)}` : "Connect wallet"}
            </button>
          </div>
        </div>
        <textarea value={code} onChange={(e) => setCode(e.target.value)} rows={18} spellCheck={false}
          aria-label="Solidity source"
          className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs leading-5" />
        <p className="mt-1 text-xs text-zinc-500">Base Sepolia remains the Solidity deploy target. Celo is used only for x402 payment settlement.</p>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Compiler output</h3>
        <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs">{output}</pre>
      </div>
    </div>
  );
}
