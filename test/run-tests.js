// Local test suite for SplitSettle, run against an in-process ganache chain
// with MockUSD8 standing in for the real tUSD8. Run: npm test
const ganache = require('ganache');
const { ethers } = require('ethers');
const { compile } = require('../scripts/compile');

let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log('  ok -', name); }
  else { failed++; console.log('  FAIL -', name); }
}
async function reverts(name, promise) {
  try { await promise; check(name + ' (should revert)', false); }
  catch { check(name, true); }
}

(async () => {
  const artifacts = compile();
  const provider = new ethers.BrowserProvider(ganache.provider({ chain: { hardfork: 'shanghai' }, logging: { quiet: true } }));
  const signers = [];
  for (let i = 0; i < 6; i++) signers.push(await provider.getSigner(i));
  const [merchant, payer, freelancer, platform, referrer, stranger] = signers;

  const mock = await new ethers.ContractFactory(artifacts.MockUSD8.abi, artifacts.MockUSD8.bytecode, merchant).deploy();
  const settle = await new ethers.ContractFactory(artifacts.SplitSettle.abi, artifacts.SplitSettle.bytecode, merchant)
    .deploy(await mock.getAddress());

  const AMOUNT = 100_000000n; // 100 tUSD8 (6 decimals)
  await mock.mint(await payer.getAddress(), AMOUNT * 3n);

  const splits = [
    { account: await freelancer.getAddress(), shareBps: 8000, label: 'Freelancer' },
    { account: await platform.getAddress(), shareBps: 1500, label: 'Platform fee' },
    { account: await referrer.getAddress(), shareBps: 500, label: 'Referrer' },
  ];
  const mk = () => settle.connect(merchant).createRequest(AMOUNT, 3600, 'INV-2026-001', splits);

  async function createId(contract, ...args) {
    const rc = await (await contract.createRequest(...args)).wait();
    for (const log of rc.logs) {
      try { const p = settle.interface.parseLog(log); if (p && p.name === 'RequestCreated') return p.args.requestId; } catch {}
    }
    throw new Error('RequestCreated event not found');
  }

  console.log('createRequest');
  const id = await createId(settle.connect(merchant), AMOUNT, 3600, 'INV-2026-001', splits);
  check('request created with id 1', id === 1n);
  const req = await settle.getRequest(1);
  check('status Open (1)', req.status === 1n);
  check('recipients pinned with labels', req.recipients[0].label === 'Freelancer');
  await reverts('shares not summing to 10000 revert', settle.connect(merchant).createRequest(
    AMOUNT, 3600, 'bad', [{ account: splits[0].account, shareBps: 9999, label: 'x' }]));
  await reverts('zero amount reverts', settle.connect(merchant).createRequest(0, 3600, 'bad', splits));

  console.log('pay (approve + pay)');
  await reverts('pay before approve reverts', settle.connect(payer).pay(1));
  await mock.connect(payer).approve(await settle.getAddress(), AMOUNT);
  await settle.connect(payer).pay(1, { gasLimit: 1000000 });
  check('status Paid (2)', (await settle.getRequest(1)).status === 2n);
  check('escrow holds the exact amount', (await mock.balanceOf(await settle.getAddress())) === AMOUNT);
  await reverts('double pay reverts (idempotent)', settle.connect(payer).pay(1));

  console.log('settle (split)');
  await reverts('stranger cannot settle', settle.connect(stranger).settle(1));
  await settle.connect(merchant).settle(1, { gasLimit: 1000000 });
  check('freelancer got 80%', (await mock.balanceOf(splits[0].account)) === 80_000000n);
  check('platform got 15%', (await mock.balanceOf(splits[1].account)) === 15_000000n);
  check('referrer got 5%', (await mock.balanceOf(splits[2].account)) === 5_000000n);
  check('escrow empty after settle', (await mock.balanceOf(await settle.getAddress())) === 0n);
  await reverts('double settle reverts', settle.connect(merchant).settle(1));

  console.log('payWithPermit (single transaction)');
  // A locally-keyed wallet signs typed data offline (ganache's RPC
  // signTypedData is incompatible with ethers v6); it plays the payer here.
  const permitPayer = ethers.Wallet.createRandom().connect(provider);
  await (await merchant.sendTransaction({ to: permitPayer.address, value: ethers.parseEther('1') })).wait();
  await mock.mint(permitPayer.address, AMOUNT);
  const id2 = (await settle.nextRequestId());
  await (await mk()).wait();
  const owner = permitPayer.address;
  const spender = await settle.getAddress();
  const nonce = await mock.nonces(owner);
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  const domain = { name: 'tUSD8', version: '2', chainId: (await provider.getNetwork()).chainId, verifyingContract: await mock.getAddress() };
  const types = { Permit: [
    { name: 'owner', type: 'address' }, { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }] };
  const sig = ethers.Signature.from(await permitPayer.signTypedData(domain, types,
    { owner, spender, value: AMOUNT, nonce, deadline }));
  await settle.connect(permitPayer).payWithPermit(id2, deadline, sig.v, sig.r, sig.s, { gasLimit: 1000000 });
  check('permit payment escrowed', (await settle.getRequest(id2)).status === 2n);
  check('no separate approve was needed', (await mock.allowance(owner, spender)) === 0n);

  console.log('refund paths');
  await reverts('payer cannot refund before expiry', settle.connect(payer).refund(id2));
  const balBefore = await mock.balanceOf(owner);
  await settle.connect(merchant).refund(id2, { gasLimit: 1000000 }); // creator may refund any time pre-settle
  check('creator refund returns full amount', (await mock.balanceOf(owner)) === balBefore + AMOUNT);
  // expired: payer self-refund
  const id3 = await settle.nextRequestId();
  await (await settle.connect(merchant).createRequest(AMOUNT, 60, 'INV-EXP', splits)).wait();
  await mock.connect(payer).approve(await settle.getAddress(), AMOUNT);
  await settle.connect(payer).pay(id3, { gasLimit: 1000000 });
  await provider.send('evm_increaseTime', [120]);
  await provider.send('evm_mine', []);
  await settle.connect(payer).refund(id3, { gasLimit: 1000000 });
  check('payer self-refunds after expiry', (await settle.getRequest(id3)).status === 4n);

  console.log('cancel');
  const id4 = await settle.nextRequestId();
  await (await mk()).wait();
  await settle.connect(merchant).cancel(id4, { gasLimit: 1000000 });
  check('cancelled status (5)', (await settle.getRequest(id4)).status === 5n);
  await reverts('paying a cancelled request reverts', settle.connect(payer).pay(id4));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
