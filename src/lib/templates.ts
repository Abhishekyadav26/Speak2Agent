import type { AgentBlueprint } from "./agent-schema";

export type TemplateId = "onchain-research" | "contract-assistant" | "web-research";

export const TEMPLATES: { id: TemplateId; name: string; blurb: string; prompts: string[] }[] = [
  {
    id: "onchain-research",
    name: "Onchain Research Agent",
    blurb: "Retrieves blockchain data, analyzes transactions, produces reports.",
    prompts: [
      "Create a blockchain research agent that tracks a wallet and summarizes its transactions.",
      "Make an agent that checks a token's activity, analyzes unusual transactions, and sends alerts.",
    ],
  },
  {
    id: "contract-assistant",
    name: "Smart Contract Assistant",
    blurb: "Uses the Solidity editor and can buy external analysis when needed.",
    prompts: [
      "Build a smart contract assistant that reviews my Solidity code and buys additional analysis when needed.",
    ],
  },
  {
    id: "web-research",
    name: "Web Research Agent",
    blurb: "Uses paid data services to research a topic and summarize findings.",
    prompts: [
      "Create a research agent that monitors competitors and prepares weekly reports.",
    ],
  },
];

function detectTemplate(request: string): TemplateId {
  const r = request.toLowerCase();
  if (r.includes("solidity") || r.includes("smart contract") || r.includes("audit") || r.includes("code review"))
    return "contract-assistant";
  if (r.includes("competitor") || r.includes("weekly report") || r.includes("linkedin") || r.includes(" x ") || r.includes("twitter"))
    return "web-research";
  return "onchain-research";
}

function detectBudget(request: string): { perOp: number; perDay: number } {
  const m = request.match(/\$?\s?(\d+(?:\.\d+)?)\s*(?:per day|\/day|daily)/i);
  const perDay = m ? Math.min(parseFloat(m[1]), 100) : 0.5;
  return { perOp: Math.min(0.25, perDay), perDay };
}

let counter = 0;

/** Deterministic NL → blueprint. Treat as untrusted plan input (never executed directly). */
export function requestToBlueprint(request: string): AgentBlueprint {
  const template = detectTemplate(request);
  const { perOp, perDay } = detectBudget(request);
  counter += 1;
  const short = request.trim().slice(0, 120);

  const plans: Record<TemplateId, AgentBlueprint["plan"]> = {
    "onchain-research": [
      { id: "s1", title: "Fetch live gateway catalog (free)", detail: "GET the verified buy catalog to confirm which onchain/social capabilities are available right now.", tool: "catalog-fetch", serviceId: "gateway-catalog", estimatedCostUsd: 0, requiresApproval: false },
      { id: "s2", title: "Buy enrichment data", detail: "If free data is insufficient, purchase one bounded gateway call (e.g. X posts search, live-quoted ~$0.005) within budget.", tool: "buy-gateway", serviceId: "x-posts-search", estimatedCostUsd: 0.005, requiresApproval: true },
      { id: "s3", title: "Analyze & report", detail: "Summarize suspicious patterns and produce a daily report.", tool: "local-analysis", serviceId: null, estimatedCostUsd: 0, requiresApproval: false },
    ],
    "contract-assistant": [
      { id: "s1", title: "Compile & review locally", detail: "Compile Solidity 0.8.24 in the worker and run static checks.", tool: "solc-worker", serviceId: null, estimatedCostUsd: 0, requiresApproval: false },
      { id: "s2", title: "Buy external analysis", detail: "Purchase one bounded external call (1-min browser session) when local checks are inconclusive.", tool: "buy-gateway", serviceId: "browser-session-1min", estimatedCostUsd: 0.004, requiresApproval: true },
      { id: "s3", title: "Report findings", detail: "Return findings with references to code locations.", tool: "local-analysis", serviceId: null, estimatedCostUsd: 0, requiresApproval: false },
    ],
    "web-research": [
      { id: "s1", title: "Fetch live gateway catalog (free)", detail: "GET the verified buy catalog to confirm which research capabilities are available right now.", tool: "catalog-fetch", serviceId: "gateway-catalog", estimatedCostUsd: 0, requiresApproval: false },
      { id: "s2", title: "Buy data call", detail: "Execute one paid gateway search (LinkedIn company posts) within budget.", tool: "buy-gateway", serviceId: "linkedin-company-posts", estimatedCostUsd: 0.02, requiresApproval: true },
      { id: "s3", title: "Summarize", detail: "Summarize findings with sources and timestamps.", tool: "local-analysis", serviceId: null, estimatedCostUsd: 0, requiresApproval: false },
    ],
  };

  const plan = plans[template];
  const est = plan.reduce((a, s) => a + s.estimatedCostUsd, 0);
  const sensitive = /private key|seed|mainnet fund|unlimited|withdraw/i.test(request);

  return {
    name: template === "onchain-research" ? "Celo Watch Agent" : template === "contract-assistant" ? "Solidity Copilot" : "Signal Researcher",
    description: `Agent requested: "${short}". Built from template ${template}.`,
    objective: short,
    template,
    trigger: /daily/i.test(request) ? "daily" : /weekly/i.test(request) ? "weekly" : "manual",
    plan,
    tools: [...new Set(plan.map((p) => p.tool))],
    serviceIds: [...new Set(plan.map((p) => p.serviceId).filter(Boolean) as string[])],
    estCostPerRunUsd: est,
    maxPerOperationUsd: perOp,
    maxPerDayUsd: perDay,
    network: "testnet",
    stablecoins: ["USDC"],
    permissions: sensitive ? ["requires-explicit-approval"] : ["read-public-data", "paid-gateway-within-budget"],
    retryPolicy: { maxRetries: 1, idempotencyKey: true },
    needsClarification: sensitive
      ? "This request touches sensitive permissions. Please confirm the spending cap and that no private keys will be shared."
      : null,
  };
}
