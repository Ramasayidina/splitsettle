// End-to-end demo against the DEPLOYED SplitSettle on Aevum testnet:
// merchant creates a 25 tUSD8 request (80/15/5 split), the payer pays with a
// single EIP-2612 permit transaction, the merchant settles, and every step
// prints its explorer link. This is the exact flow the demo video shows.
// Usage: npm run deploy && npm run demo   (both wallets need faucet funds:
// deployer needs tQDAY + the payer needs tQDAY for gas and 25 tUSD8.)
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const RPC = 'https://rpc-test.qday.info';
const CHAIN_ID = 44005;
const TUSD8 = '0x456569838f1d43009A91ebA4263147Afd7233483';
const EXPLORER = 'https://explorer-test.qday.info';
const ERC20 = [
  'function balanceOf(address) view returns (uint256)',
  'function nonces(address) view returns (uint256)',
  'function name() view returns (string)',
];

(async () => {
  const dep = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'deployments.json'), 'utf8'));
  const walletFile = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.testnet-wallet.json'), 'utf8'));
  const artifacts = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'out', 'SplitSettle.json'), 'utf8'));

  const provider = new ethers.JsonRpcProvider(RPC, CHAIN_ID);
  const merchant = new ethers.Wallet(walletFile.deployer.privateKey, provider);
  const payer = new ethers.Wallet(walletFile.payer.privateKey, provider);
  const settle = new ethers.Contract(dep.address, artifacts.abi, merchant);
  const token = new ethers.Contract(TUSD8, ERC20, provider);

  const AMOUNT = 25_000000n; // 25 tUSD8
  const payerBalance = await token.balanceOf(payer.address);
  console.log('Payer tUSD8 balance:', ethers.formatUnits(payerBalance, 6));
  if (payerBalance < AMOUNT) {
    console.log('DEMO BLOCKED: payer needs at least 25 tUSD8 — claim from the faucet for', payer.address);
    process.exit(2);
  }

  // Demo recipients: reuse the two project wallets plus the deployer so the
  // demo needs no extra funded accounts (labels show the intended roles).
  const recipients = [
    { account: merchant.address, shareBps: 8000, label: 'Freelancer (demo: merchant wallet)' },
    { account: payer.address, shareBps: 1500, label: 'Platform fee (demo: payer wallet)' },
    { account: merchant.address, shareBps: 500, label: 'Referrer (demo: merchant wallet)' },
  ];

  console.log('\n1) Merchant creates the payment request…');
  const createTx = await settle.createRequest(AMOUNT, 7 * 24 * 3600, 'INV-DEMO-001', recipients, { type: 0 });
  const createRc = await createTx.wait();
  let requestId;
  for (const log of createRc.logs) {
    try { const p = settle.interface.parseLog(log); if (p?.name === 'RequestCreated') requestId = p.args.requestId; } catch {}
  }
  console.log('   requestId:', requestId.toString(), '| tx:', `${EXPLORER}/tx/${createTx.hash}`);

  console.log('\n2) Payer reviews the payees (Confirmation of Payee) and signs ONE permit…');
  const req = await settle.getRequest(requestId);
  for (const r of req.recipients) {
    console.log(`   - ${r.label}: ${r.account} — ${(Number(r.shareBps) / 100).toFixed(2)}%`);
  }
  const nonce = await token.nonces(payer.address);
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  const domain = { name: 'tUSD8', version: '2', chainId: CHAIN_ID, verifyingContract: TUSD8 };
  const types = { Permit: [
    { name: 'owner', type: 'address' }, { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }] };
  const sig = ethers.Signature.from(await payer.signTypedData(domain, types,
    { owner: payer.address, spender: dep.address, value: AMOUNT, nonce, deadline }));
  const payTx = await settle.connect(payer).payWithPermit(requestId, deadline, sig.v, sig.r, sig.s, { type: 0 });
  await payTx.wait();
  console.log('   paid in a single transaction | tx:', `${EXPLORER}/tx/${payTx.hash}`);

  console.log('\n3) Merchant settles — the split executes atomically…');
  const settleTx = await settle.settle(requestId, { type: 0 });
  await settleTx.wait();
  console.log('   settled | tx:', `${EXPLORER}/tx/${settleTx.hash}`);
  console.log('   final status (3 = Settled):', (await settle.getRequest(requestId)).status.toString());
  console.log('\nDemo flow complete. All three transactions are verifiable on the explorer.');
})().catch((e) => { console.error(e); process.exit(1); });
