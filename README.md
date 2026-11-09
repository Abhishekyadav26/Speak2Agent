# Speak2Agent — Voice-to-AI-Agent Builder Powered by Celo x402

> **Live demo:** `https://speak2agent.vercel.app` _(placeholder — deploy with `vercel --prod` and replace this line; the app starts cleanly with no secrets configured, paid paths stay disabled until `BUY_*`/`CELO_NETWORK` are set)_
> **Onchain activity (Celo Sepolia testnet):** no custom contracts deployed — settlement happens through the buy gateway in USDC via x402. Sample settled payments with explorer links are listed under [Onchain activity](#onchain-activity-celo-sepolia-testnet) below.

Describe an AI agent in natural language (voice-dictated via Wispr Flow or typed).
Speak2Agent turns it into a structured, budget-guarded blueprint, dry-runs it,
then executes a **real paid task**: the agent buys an external service through the
**buy marketplace** with **x402 stablecoin settlement on Celo**.

Verified end-to-end on 2026-10-26: live run settled **$0.005 USDC on Celo Sepolia**
(tx `0xc89fc14c8bb8c01c7b9791830328dd4fc9da39fabac64f4ed6a6cdfe90f0a649`,
receipt `status: 0x1`), plus an earlier $0.005 settlement
(`0xe139a1fb76ea28ea50474766f5889216ef8336652751c10675e07cd347ab324c`).

## Quickstart

```bash
npm install
cp .env.example .env   # then fill the sandbox lines below
npm run dev            # http://localhost:3000
```

Demo walkthrough (5 minutes, no real money):

1. **Workspace → Agent builder.** Type or dictate (Wispr Flow, or 🎙 Dictate):
   `Create a blockchain research agent that tracks a wallet and summarizes its
   transactions. Keep spending below $0.50 per day.`
2. Press **Generate** → an editable blueprint appears (template, plan, services,
   prices, budget caps). Try the three quick-create templates.
3. **Save configuration → Request approval → Approve plan + budget.**
   The lifecycle `DRAFT → CONFIGURED → AWAITING_APPROVAL → READY` is enforced;
   skipping stages is rejected (409).
4. **Dry-run (free, simulated)** → inspect steps; the free step really fetches the
   live gateway catalog (170 capabilities at time of writing). Dry runs are always
   labeled simulated and never claim payment.
5. **Live run (paid, capped)** → needs a sandbox wallet (below). The agent pays
   $0.005 for an X-posts search, settles on Celo Sepolia, and displays the result
   plus the settlement tx. **Runs & payments** tab shows spend, receipts, errors.
6. **Solidity IDE** tab: edit, compile (solc 0.8.24 Web Worker), connect wallet,
   deploy target stays **Base Sepolia**. **Identity** tab: ERC-8004 status +
   hackathon checklist.

```bash
npm test    # 14 unit tests (schemas, state machine, budgets, 402 parsing) — fully offline, no network or secrets
npm run build
```

## Onchain activity (Celo Sepolia, testnet)

Speak2Agent deploys **no custom contracts**. All value moves as USDC through the
buy gateway's x402 settlement on Celo Sepolia (chain 11142220). Explorer root:
`https://celo-sepolia.blockscout.com`.

Settled sandbox payments ($0.005 USDC each, receipt `status: 0x1`):

- `0xc89fc14c8bb8c01c7b9791830328dd4fc9da39fabac64f4ed6a6cdfe90f0a649`
  → https://celo-sepolia.blockscout.com/tx/0xc89fc14c8bb8c01c7b9791830328dd4fc9da39fabac64f4ed6a6cdfe90f0a649
- `0xe139a1fb76ea28ea50474766f5889216ef8336652751c10675e07cd347ab324c`
  → https://celo-sepolia.blockscout.com/tx/0xe139a1fb76ea28ea50474766f5889216ef8336652751c10675e07cd347ab324c

Referenced contract addresses (nothing deployed by this repo — all pre-existing):

| What | Chain | Address |
| --- | --- | --- |
| USDC (settlement token) | Celo Sepolia | `0x01C5C0122039549AD1493B8220cABEdD739BC44E` |
| USDC | Celo Mainnet | `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` |
| Buy gateway payTo wallet | Celo | `0x20faAca5F980E29639A0FCC6dcA6988E18ed333B` |
| ERC-8004 identity registry | Celo Mainnet (from live gateway catalog) | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| ERC-8004 reputation registry | Celo Mainnet (from live gateway catalog) | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |

The real payment path is `src/lib/x402pay.ts` (`buyGatewayCall` → official
`@celo/buy curl --max-amount`), invoked from the execution engine
(`src/lib/engine.ts`) and surfaced in the UI's Runs tab with explorer links.
The Identity tab prepares ERC-8004 metadata locally; onchain registration is a
manual wallet step and has not been submitted yet.

## Reproducing the review (for judges, offline-clean)

```bash
npm install
npm test     # must pass with no .env, no network for dry-run paths
npm run dev  # http://localhost:3000 — works with zero secrets; paid buttons explain what is missing
```

Live (paid) runs additionally need the sandbox wallet from "Payment setup"
below; without it the app starts fine and only the paid step errors cleanly.

## Payment setup (sandbox — test funds, no real money)

```bash
BUY_HOME=.buy-keystore BUY_KEYSTORE_BACKEND=file \
  npx --yes @celo/buy@0.8.4 setup --name speak2agent --network sepolia
```

Then in `.env` (server side):

```
BUY_ACCOUNT=speak2agent
BUY_HOME=.buy-keystore
BUY_KEYSTORE_BACKEND=file
CELO_NETWORK=testnet
```

The gateway faucet auto-funds 1 test USDC/day on first paid call; every paid call
is capped by `buy curl --max-amount`. Sandbox txs are shown as **Celo Sepolia
(testnet)** everywhere — never as mainnet activity.

Mainnet (real funds, manual): `npx @celo/buy setup --name <agent>` (OS keychain),
fund a small dedicated float, set `CELO_NETWORK=mainnet`. A red warning is shown
in the UI when mainnet is selected.

## Architecture

```
Browser (workspace, builder, runs, identity, Solidity IDE w/ solc worker)
  │  voice: Wispr Flow dictation + Web Speech API (no extra SDK)
  ▼
Next.js API routes (/src/app/api/*)
  blueprint → deterministic NL→blueprint + zod validation (optional LLM objective polish)
  agents    → JSON-file store, allowlisted status transitions
  catalog   → live gateway catalog proxy (fallback: local allowlist)
  runs      → execution engine
Engine (/src/lib/engine.ts): DRAFT→…→SUCCEEDED/FAILED, budget gates, idempotency keys,
  dry-run simulation vs live paid path, single-attempt paid calls (no retry after ambiguity)
x402 (/src/lib/x402pay.ts): 402 challenge = price authority (JSON body per x402 v1),
  budget check, then ONE `@celo/buy curl --max-amount` via the official CLI.
  Secrets stay server-side; services restricted to SERVICE_ALLOWLIST.
Celo (/src/lib/celo.ts): chain IDs, USDC, facilitators, ERC-8004 registries
  (mainnet identity/reputation verified from the live catalog trust block),
  HACKATHON_ATTRIBUTION_TAG forwarded as X-Hackathon-Tag.
```

Verified live catalog facts (2026-10-26, `https://gateway.usebuy.ai/v1/catalog`):
x402 v1 `exact`, Celo 42220 + Sepolia 11142220, payTo
`0x20faAca5F980E29639A0FCC6dcA6988E18ed333B`, USDC/USDT/USAT,
`x.posts.search` = $0.005, `browser.sessions.create` from ~$0.0036, ERC-8004
identity `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`.

## Environment variables

See `.env.example`. Server secrets (`BUY_*` keystore, `X402_API_KEY`, `AI_*`)
are never `NEXT_PUBLIC_*`. Public config (`NEXT_PUBLIC_CELO_NETWORK`,
`NEXT_PUBLIC_HACKATHON_ATTRIBUTION_TAG`, `NEXT_PUBLIC_ERC8004_*`) only carries
display values and verified registry addresses.

## What was verified vs what remains manual

Verified with real external services: live catalog fetch, 402 quote ($0.005),
faucet funding tx, two settled sandbox payments with onchain receipts, budget
refusal ($0 spent), illegal-transition rejection, dry-run labeling.
Solidity compile worker loads solc 0.8.24 from the solc-bin CDN (needs network).

Manual steps for hackathon submission: enroll at loops.house for the attribution
tag (`HACKATHON_ATTRIBUTION_TAG`); fund a dedicated **mainnet** float and run one
qualifying mainnet purchase; complete ERC-8004 onchain registration from the
Identity tab (metadata prefill + wallet signature; registry addresses are
pre-filled from the verified catalog).
