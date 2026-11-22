# Demo video script — SplitSettle (target 3–4 minutes)

Record the terminal + browser. Everything shown runs on the **live Aevum
testnet**; every step prints an explorer link the judges can open.

## 0:00 — The problem (talking head or title card)

> "A client pays one invoice — then someone has to split it by hand:
> 80% to the freelancer, 15% platform fee, 5% to the referrer. Three manual
> transfers, three chances to get it wrong. SplitSettle makes the split part
> of the payment itself, in tUSD8 on QDay Aevum."

## 0:25 — The contract & tests (terminal)

- Show `contracts/SplitSettle.sol` briefly: state machine, exact-amount rule.
- Run `npm test` → **22 checks pass**: split math, permit payment,
  idempotency (double-pay/double-settle revert), refunds, expiry.

## 1:00 — Live flow, CLI (terminal) — the core demo

Run `npm run demo` and narrate each step as it prints:

1. **Create** — "The merchant creates a 25 tUSD8 request. The recipients and
   shares are now frozen on-chain." (open the tx on explorer-test.qday.info)
2. **Confirmation of Payee** — the script lists exactly who gets what.
   "The payer sees this *before* signing anything."
3. **Pay with one signature** — "No approve transaction: one EIP-2612 permit
   signature, one transaction, and the money sits in escrow."
4. **Settle** — "One call, and the split executes atomically: 20 / 3.75 /
   1.25 tUSD8 to the three payees." (open the settle tx; show the Payout
   events / token transfers on the explorer)

## 2:15 — The browser UI (app/index.html)

- Connect MetaMask (Aevum testnet is added automatically).
- Create a small request (e.g. 5 tUSD8, two payees) from the form.
- Load it, show the payee list, pay with the permit button, settle.
- Point out the plain-language guard: set shares to 90% total → the UI
  refuses before anything is sent.

## 3:00 — Safety & edge cases (terminal or voiceover)

- "Paid too little? Impossible — the contract only accepts the exact amount."
- "Merchant disappears? After expiry the payer refunds themselves — escrow
  always has an exit."
- "Double-click? The state machine makes every step happen exactly once."

## 3:30 — Close

> "SplitSettle is MIT-licensed and reusable for payroll, marketplaces and
> crowdfunding on Aevum. The code, tests and this exact flow are in the repo —
> and every transaction you just saw is verifiable on the testnet explorer."

## Recording checklist

- [ ] Deployer + payer funded from the faucet (1 tQDAY + tUSD8 each)
- [ ] `npm run deploy` done; `deployments.json` address pasted into `app/app.js`
- [ ] One clean rehearsal run of `npm run demo` (note its tx hashes as backup)
- [ ] Explorer tabs pre-opened for the rehearsal transactions, in case the
      live network is slow during recording
