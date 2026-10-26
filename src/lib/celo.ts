// Speak2Agent — Celo network + x402 configuration.
// Values follow official docs: https://x402.celo.org and the @celo/buy README.
// Never hardcode guessed contracts; registry addresses stay configurable.

export const CELO_NETWORKS = {
  mainnet: {
    label: "Celo Mainnet",
    chainId: 42220,
    usdc: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
    facilitator: "https://api.x402.celo.org",
    explorer: "https://celoscan.io",
    gateway: "https://gateway.usebuy.ai",
  },
  testnet: {
    label: "Celo Sepolia",
    chainId: 11142220,
    usdc: "0x01C5C0122039549AD1493B8220cABEdD739BC44E",
    facilitator: "https://api.x402.sepolia.celo.org",
    explorer: "https://celo-sepolia.blockscout.com",
    gateway: "https://gateway.usebuy.ai",
  },
} as const;

export type CeloNetworkName = keyof typeof CELO_NETWORKS;

export function selectedNetwork(): CeloNetworkName {
  const v = (process.env.NEXT_PUBLIC_CELO_NETWORK || process.env.CELO_NETWORK || "testnet").toLowerCase();
  return v.startsWith("main") ? "mainnet" : "testnet";
}

export function attributionTag(): string {
  return process.env.HACKATHON_ATTRIBUTION_TAG || process.env.NEXT_PUBLIC_HACKATHON_ATTRIBUTION_TAG || "";
}

// ERC-8004 registry addresses are chain-specific and NOT guessed here.
// Fill via env once the official deployment for the chosen chain is confirmed.
export function erc8004Registries() {
  return {
    identityRegistry: process.env.NEXT_PUBLIC_ERC8004_IDENTITY_REGISTRY || "",
    reputationRegistry: process.env.NEXT_PUBLIC_ERC8004_REPUTATION_REGISTRY || "",
  };
}
