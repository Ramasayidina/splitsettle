// Deploys SplitSettle to the QDay Aevum testnet (chain 44005) against the
// real tUSD8. Usage: node scripts/deploy.js
// Requires the deployer wallet in .testnet-wallet.json to hold tQDAY for gas.
// Aevum notes honoured here: legacy (type 0) transactions like QDay's own
// faucet sends, and Shanghai-compiled bytecode (see scripts/compile.js).
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const { compile } = require('./compile');

const RPC = 'https://rpc-test.qday.info';
const CHAIN_ID = 44005;
const TUSD8 = '0x456569838f1d43009A91ebA4263147Afd7233483';
const EXPLORER = 'https://explorer-test.qday.info';

(async () => {
  const walletFile = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.testnet-wallet.json'), 'utf8'));
  const provider = new ethers.JsonRpcProvider(RPC, CHAIN_ID);
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== CHAIN_ID) throw new Error('wrong chain: ' + net.chainId);

  const deployer = new ethers.Wallet(walletFile.deployer.privateKey, provider);
  const balance = await provider.getBalance(deployer.address);
  console.log('Deployer:', deployer.address);
  console.log('tQDAY balance:', ethers.formatEther(balance));

  if (balance === 0n) {
    console.log('\nDEPLOY BLOCKED: deployer has no tQDAY for gas.');
    console.log('Fund it first (either route gives ~1 tQDAY + 5 tUSD8):');
    console.log('  1. Web faucet: https://faucet.qday.info (connect this address)');
    console.log('  2. Discord faucet: join the QDay Discord, verify, run /faucet with this address');
    console.log('Then re-run: npm run deploy');
    process.exit(2);
  }

  const artifacts = compile();
  const factory = new ethers.ContractFactory(artifacts.SplitSettle.abi, artifacts.SplitSettle.bytecode, deployer);
  const contract = await factory.deploy(TUSD8, { type: 0 }); // legacy tx, per Aevum kit guidance
  const tx = contract.deploymentTransaction();
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  const record = {
    network: 'QDay Aevum Testnet',
    chainId: CHAIN_ID,
    contract: 'SplitSettle',
    address,
    deployTx: tx.hash,
    token: TUSD8,
    deployer: deployer.address,
    explorer: `${EXPLORER}/address/${address}`,
    deployTxExplorer: `${EXPLORER}/tx/${tx.hash}`,
    deployedAt: new Date().toISOString(),
    verification: 'Explorer contract verification is not yet available on Aevum (per the official starter-kit docs). Source is in contracts/SplitSettle.sol; judges can reproduce the bytecode with `npm run compile` (solc 0.8.26, Shanghai, optimizer 200 runs).',
  };
  fs.writeFileSync(path.join(__dirname, '..', 'deployments.json'), JSON.stringify(record, null, 2));
  console.log('\nSplitSettle deployed:', address);
  console.log('Deploy tx:', tx.hash);
  console.log('Explorer:', record.explorer);
  console.log('Record written to deployments.json — next: npm run demo');
})().catch((e) => { console.error(e); process.exit(1); });
