# SplitSettle — split payments in tUSD8 on QDay Aevum

**Aevum Builder Challenge #1 · Track: Invoice Payments (+ Confirmation of Payee)**

A merchant creates one payment request; the customer pays once in **tUSD8**;
when the merchant settles, the money is split automatically between everyone
who earned it — freelancer 80%, platform 15%, referrer 5%, or any other split.

Built on the **QDay Aevum testnet** (chain ID `44005`) with the real tUSD8
stablecoin (`0x456569838f1d43009A91ebA4263147Afd7233483`, 6 decimals).

## The problem

Freelancers, small platforms and marketplaces constantly split incoming
payments by hand: a client pays one invoice, then someone has to forward
shares to collaborators, pay a platform fee and a referral cut — each a
separate transfer, each a chance for mistakes, delays or disputes. SplitSettle
makes the split part of the payment itself: the recipients and their shares
are pinned on-chain when the invoice is created, the payer can see exactly
who gets what *before* paying (Confirmation of Payee), and settlement
distributes everything atomically in one transaction.

## How it works

```
 Merchant                SplitSettle (escrow)                 Payer
    |  createRequest(amount, recipients+shares, memo)             |
    |---------------------->|  status: Open                       |
    |                       |<--- pay() or payWithPermit() -------|  exact amount, tUSD8
    |                       |  status: Paid (funds in escrow)     |
    |  settle()             |                                     |
    |---------------------->|  80% -> freelancer                  |
    |                       |  15% -> platform                    |
    |                       |   5% -> referrer                    |
    |                       |  status: Settled                    |
    |  refund() any time, or payer refunds after expiry           |
    |---------------------->|  status: Refunded (full amount back)|
```

State machine: `Open → Paid → Settled | Refunded`, plus `Open → Cancelled`.
Every transition fires exactly once, so retries, double-clicks and relayer
resubmissions can never double-pay or double-settle (**idempotency**).

### Payment modes

1. **approve + pay** — the classic two-transaction ERC-20 flow.
2. **payWithPermit** — the payer signs one EIP-2612 permit and pays in a
   *single* transaction. tUSD8 is USDC-style (permit + EIP-3009), so this is
   the flow it is built for; the demo uses it end to end.

### Safety properties

- **Exact-amount enforcement** — a request can only be paid for its exact
  amount; a dust payment can never mark it paid (the classic checkout flaw).
- **Confirmation of Payee** — recipients (address + share + human-readable
  label) are frozen at creation; UIs show them before anything is signed.
- **Escrow with an exit** — funds are never trapped: the creator can refund
  any time before settlement, and after expiry the *payer* can refund
  themselves.
- Checks-effects-interactions, a reentrancy guard, and checked return values
  on every token call. No owner, no admin keys, no upgradeability.

## Repository layout

| Path | What |
| --- | --- |
| `contracts/SplitSettle.sol` | The payment-request escrow + split contract |
| `contracts/MockUSD8.sol` | Local tUSD8 stand-in (6 decimals, EIP-2612) — tests only |
| `test/run-tests.js` | 22-check local test suite (ganache, Shanghai hardfork) |
| `scripts/compile.js` | solc-js build, pinned to **Shanghai** (Aevum has no Cancun opcodes) |
| `scripts/deploy.js` | Deploys to Aevum testnet (legacy txs, like QDay's own faucet) |
| `scripts/demo-flow.js` | Full create → permit-pay → settle run against the live deployment |
| `app/` | Minimal browser UI (MetaMask): create, inspect payees, pay, settle, refund |
| `DEMO.md` | Demo-video script (3–5 min) |

## Run it locally (no funds needed)

```bash
npm install
npm test        # 22 checks, all local
```

## Deploy to Aevum testnet

1. A fresh **testnet-only** wallet lives in `.testnet-wallet.json`
   (git-ignored, created for this project — never use it on mainnet).
   Deployer: `0x2aEaB99CfEAA267E42d7cDe66c027f38Bf931Dc5` ·
   Payer: `0x1Cd5E8495219539B98cb2C4eB70462c26E16D626`
2. Fund the deployer (and, for the demo, the payer) — ~1 tQDAY + 5 tUSD8 each:
   - Web faucet: <https://faucet.qday.info> (connect the address), or
   - Discord faucet: QDay Discord → `#verify` → `/faucet <address>`.
3. Deploy and run the live demo flow:

```bash
npm run deploy   # writes deployments.json with address + explorer links
npm run demo     # 25 tUSD8 request: create -> permit-pay -> settle, with tx links
```

4. For the browser UI, paste the deployed address into `CONTRACT_ADDRESS`
   in `app/app.js` and open `app/index.html`.

## Deployment status

| Item | Value |
| --- | --- |
| Network | QDay Aevum Testnet, chain ID 44005 |
| RPC | https://rpc-test.qday.info |
| Token (tUSD8) | 0x456569838f1d43009A91ebA4263147Afd7233483 |
| SplitSettle | **pending faucet funding** — run `npm run deploy` after step 2 above; the address and tx hashes land in `deployments.json` |
| Contract verification | The Aevum explorer does not support source verification yet (per the official starter-kit docs). Judges can reproduce the exact bytecode from this repo: `npm run compile` (solc 0.8.26, Shanghai, optimizer 200 runs) and compare it with the on-chain code at the deployed address. |

## How this maps to the judging criteria

1. **UX & presentation** — plain-language UI; payees and shares are shown
   before payment; plain-language errors (e.g. shares ≠ 100% stops before
   anything is sent); a CLI demo that needs no browser at all.
2. **Demo** — `DEMO.md` scripts a reproducible 3–5 min walkthrough; every
   step prints an explorer link, and `npm run demo` re-runs it live.
3. **Documentation** — this README: architecture, state machine, env/network
   specs, reproduction steps, and known constraints (below).
4. **Innovation** — revenue splits + Confirmation of Payee labels pinned
   on-chain at invoice creation, combined with one-signature permit payment;
   goes beyond the starter kit's single-merchant checkout.
5. **Technical quality** — 22 local tests incl. idempotency, refund and
   expiry paths; Shanghai-pinned build; legacy transactions; chunked-event
   friendly design (all state readable via `getRequest`).
6. **Real-world utility** — freelancer/agency/marketplace payouts are a
   daily workflow; the same contract works for payroll splits and
   crowdfunding shares (other challenge tracks) unchanged.
7. **Safety & trust** — least-privilege by construction (no admin), exact
   amounts, escrow exit for both sides, full on-chain audit trail via events
   (`RequestCreated/Paid/Payout/Refunded`).
8. **Ecosystem contribution** — MIT-licensed, dependency-light, reusable as
   a template for any tUSD8 payment app on Aevum.

## Known constraints (Aevum-specific)

- EVM is **Shanghai**: no Cancun opcodes; the build is pinned accordingly.
- `eth_getLogs` is limited to 1,000-block ranges on the public RPC — read
  state via `getRequest` or page event queries.
- HTTPS RPC only (no WebSocket) — poll for confirmations.
- Explorer source verification is not available yet (see above).

## Roadmap

- EIP-3009 gasless payment via a relayer (buyer needs no tQDAY at all).
- Recurring payroll requests (scheduled splits).
- Mainnet deployment when QDay mainnet launches (Q1 2027).

## License

MIT — see `LICENSE`. Original work for this challenge; the design was
informed by the MIT-licensed Aevum starter kit's published guidance on
Aevum's network quirks (Shanghai pin, legacy txs, log limits).
