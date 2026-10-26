// Web Worker: compiles Solidity with solc 0.8.24 loaded from the official solc-bin CDN.
// Kept separate so compilation never blocks the UI thread.
const SOLC_URL = "https://binaries.soliditylang.org/bin/soljson-v0.8.24+commit.e695f178.js";

let solcReady = null;

async function loadSolc() {
  if (!solcReady) {
    solcReady = (async () => {
      importScripts(SOLC_URL);
      // @ts-ignore — solc exposes Module at top level
      const mod = self.Module;
      return mod;
    })();
  }
  return solcReady;
}

self.onmessage = async (e) => {
  const source = String(e.data?.source ?? "");
  try {
    const Module = await loadSolc();
    const input = {
      language: "Solidity",
      sources: { "Agent.sol": { content: source } },
      settings: { outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
    };
    // @ts-ignore
    const compile = Module.cwrap("solidity_compile", "string", ["string", "number"]);
    const out = JSON.parse(compile(JSON.stringify(input), 0));
    if (out.errors?.some((x) => x.severity === "error")) {
      const errs = out.errors.filter((x) => x.severity === "error").map((x) => x.formattedMessage).join("\n");
      self.postMessage(`COMPILATION FAILED\n\n${errs}`);
      return;
    }
    const contracts = out.contracts?.["Agent.sol"] ?? {};
    const names = Object.keys(contracts);
    const warn = (out.errors ?? []).map((x) => x.formattedMessage).join("\n");
    self.postMessage(
      `COMPILED OK — solc 0.8.24\nContracts: ${names.join(", ") || "(none)"}\n` +
      names.map((n) => `${n}: bytecode ${(contracts[n].evm?.bytecode?.object?.length ?? 0) / 2} bytes`).join("\n") +
      (warn ? `\n\nWarnings:\n${warn}` : "")
    );
  } catch (err) {
    self.postMessage(`COMPILATION FAILED\n\n${err instanceof Error ? err.message : String(err)}`);
  }
};
