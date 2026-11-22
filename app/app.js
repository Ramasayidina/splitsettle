// SplitSettle web UI — talks to the deployed contract on QDay Aevum testnet.
// Set CONTRACT_ADDRESS after running `npm run deploy` (see deployments.json).
const CONTRACT_ADDRESS = ''; // <-- paste SplitSettle address here
const TUSD8 = '0x456569838f1d43009A91ebA4263147Afd7233483';
const CHAIN_ID_HEX = '0xabe5'; // 44005
const EXPLORER = 'https://explorer-test.qday.info';

const ABI = [
  'function createRequest(uint256 amount, uint64 ttlSeconds, string memo, tuple(address account, uint16 shareBps, string label)[] recipients) returns (uint256)',
  'function payWithPermit(uint256 requestId, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
  'function settle(uint256 requestId)',
  'function refund(uint256 requestId)',
  'function getRequest(uint256 requestId) view returns (address creator, address payer, uint256 amount, uint64 expiresAt, uint8 status, string memo, tuple(address account, uint16 shareBps, string label)[] recipients)',
  'event RequestCreated(uint256 indexed requestId, address indexed creator, uint256 amount, uint64 expiresAt, string memo)',
];
const ERC20 = [
  'function nonces(address) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
];
const STATUS = ['None', 'Open', 'Paid', 'Settled', 'Refunded', 'Cancelled'];

let provider, signer, contract, token;
const $ = (id) => document.getElementById(id);
const say = (msg) => { $('status').textContent = msg; };
const txLink = (hash) => `${EXPLORER}/tx/${hash}`;

async function connect() {
  if (!window.ethereum) { say('No wallet found. Install MetaMask to use the demo UI (the CLI demo in scripts/demo-flow.js needs no browser).'); return; }
  provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send('eth_requestAccounts', []);
  try {
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] });
  } catch {
    await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{
      chainId: CHAIN_ID_HEX, chainName: 'QDay Aevum Testnet',
      rpcUrls: ['https://rpc-test.qday.info'],
      nativeCurrency: { name: 'tQDAY', symbol: 'tQDAY', decimals: 18 },
      blockExplorerUrls: [EXPLORER],
    }] });
  }
  signer = await provider.getSigner();
  $('account').textContent = ' ' + await signer.getAddress();
  if (CONTRACT_ADDRESS) {
    contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
    token = new ethers.Contract(TUSD8, ERC20, provider);
    $('contractAddr').innerHTML = `<a href="${EXPLORER}/address/${CONTRACT_ADDRESS}" target="_blank">${CONTRACT_ADDRESS}</a>`;
  }
  say('Connected on Aevum testnet (44005).');
}

async function create() {
  const amount = ethers.parseUnits($('amount').value, 6);
  const lines = $('recipients').value.split('\n').map((s) => s.trim()).filter(Boolean);
  const recipients = lines.map((line) => {
    const [account, pct, ...label] = line.split(',').map((s) => s.trim());
    return { account, shareBps: Math.round(parseFloat(pct) * 100), label: label.join(', ') };
  });
  const total = recipients.reduce((a, r) => a + r.shareBps, 0);
  if (total !== 10000) { say(`Shares must add up to 100% (now ${total / 100}%). Nothing was sent.`); return; }
  say('Creating request… confirm in your wallet.');
  const tx = await contract.createRequest(amount, 7 * 24 * 3600, $('memo').value, recipients);
  const rc = await tx.wait();
  for (const log of rc.logs) {
    try { const p = contract.interface.parseLog(log); if (p?.name === 'RequestCreated') $('requestId').value = p.args.requestId.toString(); } catch {}
  }
  say(`Request created. Transaction: ${txLink(tx.hash)}`);
}

async function load() {
  const req = await contract.getRequest(BigInt($('requestId').value));
  const rows = req.recipients.map((r) =>
    `<div class="payee"><span>${r.label || 'Payee'}<br><small>${r.account}</small></span><b>${(Number(r.shareBps) / 100).toFixed(2)}%</b></div>`).join('');
  $('payees').innerHTML = rows;
  say(`Request ${$('requestId').value} — "${req.memo}"\nAmount: ${ethers.formatUnits(req.amount, 6)} tUSD8\nStatus: ${STATUS[Number(req.status)]}\nCheck the payees above before paying: this is exactly who will receive the split.`);
  return req;
}

async function pay() {
  const id = BigInt($('requestId').value);
  const req = await load();
  const owner = await signer.getAddress();
  const nonce = await token.nonces(owner);
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  say('Sign the payment authorization in your wallet — one signature, no separate approve transaction.');
  const sig = ethers.Signature.from(await signer.signTypedData(
    { name: 'tUSD8', version: '2', chainId: 44005, verifyingContract: TUSD8 },
    { Permit: [
      { name: 'owner', type: 'address' }, { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }] },
    { owner, spender: CONTRACT_ADDRESS, value: req.amount, nonce, deadline }));
  const tx = await contract.payWithPermit(id, deadline, sig.v, sig.r, sig.s);
  await tx.wait();
  say(`Paid. The money is in escrow until the creator settles.\nTransaction: ${txLink(tx.hash)}`);
}

async function settle() {
  const tx = await contract.settle(BigInt($('requestId').value));
  await tx.wait();
  say(`Settled — every payee received their share.\nTransaction: ${txLink(tx.hash)}`);
}

async function refund() {
  const tx = await contract.refund(BigInt($('requestId').value));
  await tx.wait();
  say(`Refunded to the payer in full.\nTransaction: ${txLink(tx.hash)}`);
}

$('connect').onclick = () => connect().catch((e) => say('Error: ' + (e.shortMessage || e.message)));
$('create').onclick = () => create().catch((e) => say('Error: ' + (e.shortMessage || e.message)));
$('load').onclick = () => load().catch((e) => say('Error: ' + (e.shortMessage || e.message)));
$('pay').onclick = () => pay().catch((e) => say('Error: ' + (e.shortMessage || e.message)));
$('settle').onclick = () => settle().catch((e) => say('Error: ' + (e.shortMessage || e.message)));
$('refund').onclick = () => refund().catch((e) => say('Error: ' + (e.shortMessage || e.message)));
