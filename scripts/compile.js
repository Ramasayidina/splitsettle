// Compiles the contracts with solc-js, pinned to the Shanghai EVM —
// Aevum testnet has no Cancun opcodes, so this pin is load-bearing.
const fs = require('fs');
const path = require('path');
const solc = require('solc');

function compile() {
  const sources = {};
  for (const f of ['SplitSettle.sol', 'MockUSD8.sol']) {
    sources[f] = { content: fs.readFileSync(path.join(__dirname, '..', 'contracts', f), 'utf8') };
  }
  const input = {
    language: 'Solidity',
    sources,
    settings: {
      evmVersion: 'shanghai',
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  if (out.errors) {
    for (const e of out.errors) {
      if (e.severity === 'error') throw new Error(e.formattedMessage);
      console.warn(e.formattedMessage);
    }
  }
  const dir = path.join(__dirname, '..', 'out');
  fs.mkdirSync(dir, { recursive: true });
  const artifacts = {};
  for (const [file, contracts] of Object.entries(out.contracts)) {
    for (const [name, c] of Object.entries(contracts)) {
      artifacts[name] = { abi: c.abi, bytecode: '0x' + c.evm.bytecode.object, source: file };
      fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify(artifacts[name], null, 2));
    }
  }
  return artifacts;
}

if (require.main === module) {
  const a = compile();
  console.log('Compiled:', Object.keys(a).join(', '));
}
module.exports = { compile };
