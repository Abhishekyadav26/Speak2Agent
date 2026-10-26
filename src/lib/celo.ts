// Speak2Agent — Celo network + x402 configuration.
// Corrected/verified against LIVE chain data on 2026-10-26:
// - celo-mcp get_network_status → Celo Mainnet, chain 42220, Forno RPC,
//   explorer https://explorer.celo.org, latest block 81138707.
// - celo-mcp get_token_balance → USDC 0xcebA…18C has 6 decimals; gateway
//   payTo 0x20fa…333B holds 8.44 USDC on mainnet (active gateway wallet).
// - eth_getCode (Forno) → both ERC-8004 registries + both USDC contracts
//   have contract code; provider registration files reference
//   eip155:42220:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 with x402Support:true.
// - Sepolia settlement txs verified via Forno receipts (status 0x1) and
//   celo-sepolia.blockscout.com (indexing lags a few minutes).

export const CELO_NETWORKS = {
  mainnet: {
    label: "Celo Mainnet",
    chainId: 42220,
    usdc: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
    facilitator: "https://api.x402.celo.org",
    explorer: "https://explorer.celo.org", // celo-mcp get_network_status block_explorer_url
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

// ERC-8004 registries. Celo mainnet (42220) addresses VERIFIED 2026-10-26 from
// the live buy gateway catalog trust block (https://gateway.usebuy.ai/v1/catalog).
// Celo Sepolia registry is not published in the catalog — env override only.
export function erc8004Registries() {
  return {
    identityRegistry:
      process.env.NEXT_PUBLIC_ERC8004_IDENTITY_REGISTRY || "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    reputationRegistry:
      process.env.NEXT_PUBLIC_ERC8004_REPUTATION_REGISTRY || "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
  };
}
