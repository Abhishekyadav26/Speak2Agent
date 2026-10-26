import { NextResponse } from "next/server";
import { GATEWAY_ORIGIN, SERVICE_ALLOWLIST } from "@/lib/services";

/** Proxy the live buy catalog; fall back to the local allowlist on failure. */
export async function GET() {
  try {
    const r = await fetch(`${GATEWAY_ORIGIN}/v1/catalog`, { signal: AbortSignal.timeout(10000) });
    if (r.ok) {
      const data = await r.json();
      return NextResponse.json({ live: true, catalog: data });
    }
  } catch { /* fall through */ }
  return NextResponse.json({
    live: false,
    note: "Live catalog unreachable — showing verified local allowlist. The 402 challenge remains the price authority.",
    catalog: SERVICE_ALLOWLIST,
  });
}
