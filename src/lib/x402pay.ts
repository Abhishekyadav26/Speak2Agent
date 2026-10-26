// Server-side x402 buyer for the buy gateway, delegating payment to the
// OFFICIAL @celo/buy client (pinned version). No invented signing payloads:
// price discovery via the live 402 challenge, settlement via `buy curl`,
// budget enforced twice (here AND via the CLI's --max-amount flag).

import { spawn } from "node:child_process";
import { CELO_NETWORKS, attributionTag, type CeloNetworkName } from "./celo";
import { GATEWAY_ORIGIN, findService } from "./services";

export interface PayResult {
  ok: boolean;
  status: number;
  data: unknown;
  priceUsd: number | null;
  txHash: string | null;
  dryRun: boolean;
  note: string;
}

const BUY_PKG = process.env.BUY_CLI || "@celo/buy@0.8.4";

interface Challenge {
  priceUsd: number;
  payTo: string;
  asset: string;
  network: string;
}

/** Parse the x402 v1 challenge. The gateway returns it as a JSON BODY
 * ({x402Version, accepts:[{scheme, network, maxAmountRequired, payTo, asset, ...}]})
 * and may also echo it in headers. Body is authoritative. */
export function parsePaymentRequired(res: Response, bodyText?: string): Challenge | null {
  if (bodyText) {
    try {
      const doc = JSON.parse(bodyText) as {
        accepts?: { maxAmountRequired?: string; payTo?: string; asset?: string; network?: string }[];
      };
      const offer = doc.accepts?.[0];
      if (offer?.maxAmountRequired) {
        const priceUsd = Number(offer.maxAmountRequired) / 1e6; // Celo stablecoins: 6 decimals
        if (Number.isFinite(priceUsd)) {
          return { priceUsd, payTo: offer.payTo || "", asset: offer.asset || "", network: offer.network || "" };
        }
      }
    } catch { /* fall through to headers */ }
  }
  const raw = res.headers.get("payment-required") || res.headers.get("www-authenticate");
  if (!raw) return null;
  try {
    const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const doc = JSON.parse(text) as { accepts?: { maxAmountRequired?: string; payTo?: string; asset?: string; network?: string }[] };
    const offer = doc.accepts?.[0];
    if (!offer?.maxAmountRequired) return null;
    return {
      priceUsd: Number(offer.maxAmountRequired) / 1e6,
      payTo: offer.payTo || "",
      asset: offer.asset || "",
      network: offer.network || "",
    };
  } catch {
    return null;
  }
}

function runBuy(args: string[], extraEnv: Record<string, string>): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["--yes", BUY_PKG, ...args], {
      env: { ...process.env, ...extraEnv },
      timeout: 150000,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += String(d);
      if (stdout.length > 500000) child.kill();
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
      if (stderr.length > 200000) child.kill();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, stderr, code: code ?? 1 }));
  });
}

function childEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  if (process.env.BUY_HOME) env.BUY_HOME = process.env.BUY_HOME;
  if (process.env.BUY_KEYSTORE_BACKEND) env.BUY_KEYSTORE_BACKEND = process.env.BUY_KEYSTORE_BACKEND;
  return env;
}

function extractJsonLine(stdout: string): { data: unknown; txHash: string | null; priceUsd: number | null } {
  // `buy curl` prints the provider JSON to stdout; find the first {…} document.
  const start = stdout.indexOf("{");
  if (start < 0) return { data: stdout.slice(0, 2000), txHash: null, priceUsd: null };
  try {
    const data = JSON.parse(stdout.slice(start)) as { transaction?: string; payment?: { usd?: string } };
    return {
      data,
      txHash: typeof data.transaction === "string" ? data.transaction : null,
      priceUsd: data.payment?.usd ? Number(data.payment.usd) : null,
    };
  } catch {
    return { data: stdout.slice(start, start + 2000), txHash: null, priceUsd: null };
  }
}

/**
 * Execute one gateway call with x402 payment via the official client.
 * - 402 challenge is fetched first: the price authority.
 * - maxUsd enforced here AND via `buy curl --max-amount`.
 * - Idempotency-Key header forwarded on the paid request.
 * - Exactly one attempt — never retried after ambiguous settlement.
 */
export async function buyGatewayCall(opts: {
  serviceId: string;
  body?: Record<string, unknown>;
  maxUsd: number;
  idempotencyKey: string;
  network: CeloNetworkName;
}): Promise<PayResult> {
  const svc = findService(opts.serviceId);
  if (!svc) throw new Error(`Unknown service: ${opts.serviceId}. Only allowlisted services may be purchased.`);
  void CELO_NETWORKS;
  const url = `${GATEWAY_ORIGIN}${svc.path}`;
  const sandbox = opts.network !== "mainnet";
  const account = process.env.BUY_ACCOUNT || "speak2agent";
  const globalFlags = [...(sandbox ? ["--sandbox"] : []), "--account", account];

  // 1. Price discovery (never pays): direct 402 read.
  const tag = attributionTag();
  const headers: Record<string, string> = { "content-type": "application/json", "Idempotency-Key": opts.idempotencyKey };
  if (tag) headers["X-Hackathon-Tag"] = tag;
  const first = await fetch(url, {
    method: svc.method,
    headers,
    body: svc.method === "GET" ? undefined : JSON.stringify(opts.body ?? svc.exampleBody),
  });
  const firstText = await first.text();
  if (first.status !== 402) {
    let data: unknown = firstText;
    try {
      data = JSON.parse(firstText);
    } catch { /* keep text */ }
    return { ok: first.ok, status: first.status, data, priceUsd: 0, txHash: null, dryRun: false, note: first.ok ? "Free response (no payment required)." : `Provider error ${first.status}.` };
  }
  const challenge = parsePaymentRequired(first, firstText);
  if (!challenge) throw new Error("402 without a parseable x402 challenge. Aborting — will not guess payment fields.");
  if (!(challenge.priceUsd <= opts.maxUsd)) {
    throw new Error(`Quoted price $${challenge.priceUsd} exceeds authorized max $${opts.maxUsd}. Renewed approval required.`);
  }

  // 2. Paid execution via the official client (single attempt, capped).
  const curlArgs = [
    ...globalFlags,
    "curl",
    "--max-amount",
    String(opts.maxUsd),
    "--token",
    "USDC",
    url,
    "-X",
    svc.method,
    "-H",
    "content-type: application/json",
    "-H",
    `Idempotency-Key: ${opts.idempotencyKey}`,
    ...(tag ? ["-H", `X-Hackathon-Tag: ${tag}`] : []),
    ...(svc.method === "GET" ? [] : ["-d", JSON.stringify(opts.body ?? svc.exampleBody)]),
  ];
  const { stdout, stderr, code } = await runBuy(curlArgs, childEnv());
  const parsed = extractJsonLine(stdout);
  const funded = [...stderr.matchAll(/funded \S+ with [\d.]+ \w+ \(tx (0x[0-9a-fA-F]+)\)/g)].map((m) => m[1]);

  if (code !== 0 || !parsed.txHash) {
    const errJson = (() => {
      try {
        const s = stderr.indexOf("{");
        return s >= 0 ? (JSON.parse(stderr.slice(s)) as { error?: { code?: string; message?: string; details?: { paid?: boolean } } }) : null;
      } catch {
        return null;
      }
    })();
    const msg = errJson?.error?.message || stderr.slice(0, 500) || `buy exited ${code}`;
    // paid:true with doNotRetry means money moved but output was lost — surface, never retry.
    throw new Error(
      `Paid request did not complete cleanly: ${msg.slice(0, 300)}` +
        (funded.length ? ` Funding txs observed: ${funded.join(", ")}.` : "") +
        " Not retried (duplicate-charge protection)."
    );
  }

  return {
    ok: true,
    status: 200,
    data: parsed.data,
    priceUsd: parsed.priceUsd ?? challenge.priceUsd,
    txHash: parsed.txHash,
    dryRun: false,
    note: `Settled via buy/x402 on ${sandbox ? "Celo Sepolia (testnet)" : "Celo Mainnet"}.` + (funded.length ? ` Faucet funding: ${funded.join(", ")}.` : ""),
  };
}
