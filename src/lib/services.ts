// Verified 2026-10-26 from the LIVE gateway catalog (https://gateway.usebuy.ai/v1/catalog).
// Only these exact method+path combos may trigger a paid request.
// Indicative prices come from the catalog's priceOptions where published;
// the HTTP 402 challenge is always the price authority at execution time.

export interface GatewayService {
  id: string;
  name: string;
  description: string;
  method: "GET" | "POST";
  path: string; // relative to https://gateway.usebuy.ai
  indicativePriceUsd: number;
  freeTier?: boolean;
  exampleBody: Record<string, unknown>;
}

export const GATEWAY_ORIGIN = "https://gateway.usebuy.ai";

export const SERVICE_ALLOWLIST: GatewayService[] = [
  {
    id: "gateway-catalog",
    name: "Buy gateway catalog (free)",
    description: "Free live service catalogue. The discovery entry point — always fetched before selecting a paid capability.",
    method: "GET",
    path: "/v1/catalog",
    indicativePriceUsd: 0,
    freeTier: true,
    exampleBody: {},
  },
  {
    id: "x-posts-search",
    name: "X Posts Search (paid)",
    description: "Search public X posts by keyword. Request example verified in the official @celo/buy README.",
    method: "POST",
    path: "/v1/social/x/posts/search",
    indicativePriceUsd: 0.05,
    exampleBody: { query: "celo" },
  },
  {
    id: "browser-session-1min",
    name: "Agent browser, 1 min (paid)",
    description: "Rent a disposable agent-browser session. Cheapest verified paid call (~$0.0036) — ideal first live payment.",
    method: "POST",
    path: "/v1/browser/sessions",
    indicativePriceUsd: 0.004,
    exampleBody: { durationMinutes: 1 },
  },
  {
    id: "linkedin-company-posts",
    name: "LinkedIn Company Posts (paid)",
    description: "Recent public posts for a LinkedIn company. Used by the web-research template.",
    method: "POST",
    path: "/v1/social/linkedin/company/posts",
    indicativePriceUsd: 0.05,
    exampleBody: { slug: "celo" },
  },
];

export function findService(id: string): GatewayService | undefined {
  return SERVICE_ALLOWLIST.find((s) => s.id === id);
}
