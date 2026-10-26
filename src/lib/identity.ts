import { z } from "zod";

export const IdentityState = z.object({
  wallet: z.string().nullable().default(null),
  agentName: z.string().default(""),
  metadataUri: z.string().default(""),
  status: z.enum(["pending", "prepared", "registered"]).default("pending"),
  agentId: z.string().nullable().default(null),
  registry: z.string().nullable().default(null),
  txHash: z.string().nullable().default(null),
  attributionTag: z.string().default(""),
});
export type IdentityState = z.infer<typeof IdentityState>;

/** ERC-8004 registration metadata file (served by the app for the registry). */
export function buildRegistrationFile(opts: { name: string; wallet: string; description: string; endpoints: string[] }) {
  return {
    "@context": "https://erc8004.org/contexts/identity-v1.jsonld",
    name: opts.name,
    description: opts.description,
    owner: opts.wallet,
    x402Support: true,
    endpoints: opts.endpoints,
    trust: { hiredThrough: "buy", rails: "x402", network: "celo" },
  };
}
