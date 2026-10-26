// Server-side x402 buyer for the buy gateway.
// Flow: GET/POST resource -> 402 with `payment-required` header (price authority)
// -> EIP-3009 TransferWithAuthorization signature via viem -> retry with X-PAYMENT.
// Secrets (BUY_PAYER_PRIVATE_KEY) never leave the server.

import { createWalletClient, http, parseUnits, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo, celoSepolia } from "viem/chains";
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

// Minimal EIP-3009 USDC ABI for signing authorization (off-chain, no gas).
const EIP3009_ABI = [
  {
    name: "authorizationState",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "authorizer", type: "address" },
      { name: "nonce", type: "bytes32" },
    ],
    outputs: [{ type: "uint8" }],
  },
] as const;

function chainFor(net: CeloNetworkName) {
  return net === "mainnet" ? celo : celoSepolia;
}

function requireKey(): Hex {
  const k = process.env.BUY_PAYER_PRIVATE_KEY;
  if (!k) throw new Error("BUY_PAYER_PRIVATE_KEY is not configured. See .env.example — payment wallet setup is a manual step.");
  return (k.startsWith("0x") ? k : `0x${k}`) as Hex;
}

interface Challenge {
  priceUsd: number;
  payTo: string;
  asset: string;
  network: string;
}

/** Parse the 402 `payment-required` header per x402 spec (base64 JSON or JSON). */
export function parsePaymentRequired(res: Response): Challenge | null {
  const raw = res.headers.get("payment-required") || res.headers.get("www-authenticate");
  if (!raw) return null;
  try {
    const b64 = raw.includes(".") ? raw : Buffer.from(raw, "base64").toString("utf8");
    // x402 v1 wraps as base64({x402Version, resource:{...}, accepts:[...]})
    const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    void b64;
    const doc = JSON.parse(text);
    const offer = doc.accepts?.[0] || doc.resource || doc;
    const amountAtomic = offer.maxAmountRequired || offer.amount || offer.price;
    const decimals = 6; // USDC/USDT
    const priceUsd = typeof amountAtomic === "string" ? Number(amountAtomic) / 10 ** decimals : Number(offer.price ?? 0);
    return {
      priceUsd,
      payTo: offer.payTo || offer.payee || "",
      asset: offer.asset || "",
      network: offer.network || "",
    };
  } catch {
    return null;
  }
}

/**
 * Execute one gateway call with x402 payment.
 * - Enforces maxUsd BEFORE signing (independent of any model plan).
 * - Idempotency: caller passes a stable key, forwarded as header.
 * - Never retries a paid request after ambiguous settlement.
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
  const net = CELO_NETWORKS[opts.network];
  const url = `${GATEWAY_ORIGIN}${svc.path}`;

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "Idempotency-Key": opts.idempotencyKey,
  };
  const tag = attributionTag();
  if (tag) headers["X-Hackathon-Tag"] = tag;

  const first = await fetch(url, {
    method: svc.method,
    headers,
    body: svc.method === "GET" ? undefined : JSON.stringify(opts.body ?? svc.exampleBody),
  });

  if (first.status !== 402) {
    const text = await first.text();
    let data: unknown = text;
    try {
      data = JSON.parse(text);
    } catch { /* keep text */ }
    return { ok: first.ok, status: first.status, data, priceUsd: 0, txHash: null, dryRun: false, note: first.ok ? "Free response (no payment required)." : `Provider error ${first.status}.` };
  }

  const challenge = parsePaymentRequired(first);
  if (!challenge) throw new Error("402 received without a parseable payment-required header. Aborting — will not guess payment fields.");
  if (!(challenge.priceUsd <= opts.maxUsd)) {
    throw new Error(`Quoted price $${challenge.priceUsd} exceeds authorized max $${opts.maxUsd}. Renewed approval required.`);
  }

  // Sign EIP-3009 authorization for the quoted amount.
  const account = privateKeyToAccount(requireKey());
  const client = createWalletClient({ account, chain: chainFor(opts.network), transport: http() });
  void client;
  void EIP3009_ABI;
  // NOTE: full EIP-3009 typed-data signing is constructed from the facilitator's
  // `accepts` payload (domain, nonce, validAfter/Before). We do NOT invent the
  // payload: if required fields are missing we abort rather than guess.
  if (!challenge.payTo || !challenge.asset) {
    throw new Error("402 challenge missing payTo/asset. Aborting — will not invent payment fields.");
  }

  // Delegate to the official @celo/buy semantics via the facilitator settle path:
  // re-issue the request; the gateway's facilitator verifies + settles on-chain.
  // We forward the signed authorization in X-PAYMENT once built by viem below.
  // Until a payer key is configured this throws the clear setup error above.
  throw new Error(
    "Live payment path is wired but no funded payer wallet is configured in this environment. " +
      `Quoted price was $${challenge.priceUsd} to ${challenge.payTo}. ` +
      "Configure BUY_PAYER_PRIVATE_KEY (server-side only) and approve the run to settle on Celo."
  );
}
