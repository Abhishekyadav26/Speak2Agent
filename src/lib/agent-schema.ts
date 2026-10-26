import { z } from "zod";

export const AgentStatus = z.enum([
  "DRAFT",
  "CONFIGURED",
  "AWAITING_APPROVAL",
  "READY",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
]);
export type AgentStatus = z.infer<typeof AgentStatus>;

export const AgentStep = z.object({
  id: z.string(),
  title: z.string(),
  detail: z.string(),
  tool: z.string(),
  serviceId: z.string().nullable().default(null),
  estimatedCostUsd: z.number().nonnegative().default(0),
  requiresApproval: z.boolean().default(false),
});
export type AgentStep = z.infer<typeof AgentStep>;

export const AgentBlueprint = z.object({
  name: z.string().min(2).max(80),
  description: z.string().min(10).max(2000),
  objective: z.string().min(10).max(2000),
  template: z.enum(["onchain-research", "contract-assistant", "web-research"]),
  trigger: z.enum(["manual", "daily", "weekly"]).default("manual"),
  plan: z.array(AgentStep).min(2).max(12),
  tools: z.array(z.string()).default([]),
  serviceIds: z.array(z.string()).default([]),
  estCostPerRunUsd: z.number().nonnegative(),
  maxPerOperationUsd: z.number().positive().max(25),
  maxPerDayUsd: z.number().positive().max(100),
  network: z.enum(["mainnet", "testnet"]).default("testnet"),
  stablecoins: z.array(z.string()).default(["USDC"]),
  permissions: z.array(z.string()).default([]),
  retryPolicy: z
    .object({
      maxRetries: z.number().int().min(0).max(3).default(1),
      idempotencyKey: z.boolean().default(true),
    })
    .default({ maxRetries: 1, idempotencyKey: true }),
  needsClarification: z.string().nullable().default(null),
});
export type AgentBlueprint = z.infer<typeof AgentBlueprint>;

export const AgentRecord = AgentBlueprint.extend({
  id: z.string(),
  status: AgentStatus,
  createdAt: z.string(),
  updatedAt: z.string(),
  approvedAt: z.string().nullable().default(null),
  approvedMaxPerOperationUsd: z.number().nullable().default(null),
});
export type AgentRecord = z.infer<typeof AgentRecord>;

export const RunStepResult = z.object({
  stepId: z.string(),
  title: z.string(),
  startedAt: z.string().nullable().default(null),
  finishedAt: z.string().nullable().default(null),
  status: z.enum(["pending", "running", "ok", "error", "skipped"]),
  input: z.unknown().nullable().default(null),
  output: z.unknown().nullable().default(null),
  serviceId: z.string().nullable().default(null),
  priceUsd: z.number().nullable().default(null),
  paymentStatus: z.string().nullable().default(null),
  txHash: z.string().nullable().default(null),
  error: z.string().nullable().default(null),
});
export type RunStepResult = z.infer<typeof RunStepResult>;

export const RunRecord = z.object({
  id: z.string(),
  agentId: z.string(),
  mode: z.enum(["dry-run", "live"]),
  status: z.enum(["pending", "running", "succeeded", "failed", "awaiting-approval"]),
  createdAt: z.string(),
  finishedAt: z.string().nullable().default(null),
  idempotencyKey: z.string(),
  steps: z.array(RunStepResult),
  totalSpentUsd: z.number().default(0),
  txHashes: z.array(z.string()).default([]),
  result: z.string().nullable().default(null),
  error: z.string().nullable().default(null),
});
export type RunRecord = z.infer<typeof RunRecord>;

export const ALLOWED_TRANSITIONS: Record<AgentStatus, AgentStatus[]> = {
  DRAFT: ["CONFIGURED"],
  CONFIGURED: ["AWAITING_APPROVAL", "DRAFT"],
  AWAITING_APPROVAL: ["READY", "CONFIGURED"],
  READY: ["RUNNING"],
  RUNNING: ["SUCCEEDED", "FAILED", "READY"],
  SUCCEEDED: ["READY"],
  FAILED: ["READY", "CONFIGURED"],
};

export function canTransition(from: AgentStatus, to: AgentStatus): boolean {
  return (ALLOWED_TRANSITIONS[from] || []).includes(to);
}
