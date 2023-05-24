import { VAnchor } from '@webb-tools/anchors';
import {
  calculateTypedChainId,
  ChainType,
  CircomUtxo,
  Keypair,
} from '@webb-tools/sdk-core';
import * as dotenv from 'dotenv';
import { fetchComponentsFromFilePaths, hexToU8a } from '@webb-tools/utils';
import { ethers } from 'ethers';
import path from 'node:path';
import { env } from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * Returns the Vault mnemonic from the environment
 * @returns {string} The Vault mnemonic
 * @throws {Error} If the Vault mnemonic is not set
 */
function getVaultMnemonic(): string {
  const maybeVaultMnemonic = env.MNEMONIC;
  if (!maybeVaultMnemonic) {
    throw new Error('MNEMONIC not set');
  }
  return maybeVaultMnemonic;
}

let providers: ethers.providers.JsonRpcProvider[];
let vault: ethers.Wallet;

dotenv.config({
  path: '../.env',
});
vault = ethers.Wallet.fromMnemonic(getVaultMnemonic());
const chainRpcUrls = [
  `http://127.0.0.1:${env.ATHENA_CHAIN_ID}`,
  `http://127.0.0.1:${env.HERMES_CHAIN_ID}`,
  `http://127.0.0.1:${env.DEMETER_CHAIN_ID}`,
];

providers = chainRpcUrls.map(
  (url) => new ethers.providers.JsonRpcProvider(url)
);
const zeroTokenAddress = '0x0000000000000000000000000000000000000000';
const dirname = path.dirname(fileURLToPath(import.meta.url));
const provider = providers[0];
const vaultSender = vault.connect(provider);
const testAccount = ethers.Wallet.createRandom().connect(provider);
const tx1 = await vaultSender.sendTransaction({
  to: testAccount.address,
  value: ethers.utils.parseEther('1'),
});
await tx1.wait();

const zkComponentsSmall = await fetchComponentsFromFilePaths(
  path.resolve(
    dirname,
    'fixtures/solidity-fixtures/vanchor_2/8/poseidon_vanchor_2_8.wasm'
  ),
  path.resolve(
    dirname,
    'fixtures/solidity-fixtures/vanchor_2/8/witness_calculator.cjs'
  ),
  path.resolve(
    dirname,
    'fixtures/solidity-fixtures/vanchor_2/8/circuit_final.zkey'
  )
);

const zkComponentsLarge = await fetchComponentsFromFilePaths(
  path.resolve(
    dirname,
    'fixtures/solidity-fixtures/vanchor_16/8/poseidon_vanchor_16_8.wasm'
  ),
  path.resolve(
    dirname,
    'fixtures/solidity-fixtures/vanchor_16/8/witness_calculator.cjs'
  ),
  path.resolve(
    dirname,
    'fixtures/solidity-fixtures/vanchor_16/8/circuit_final.zkey'
  )
);

const vanchor = await VAnchor.connect(
  '0x3285e3fda482003ca2540a101a9ced3cb2d8fb99',
  zkComponentsSmall,
  zkComponentsLarge,
  testAccount
);

const originChainId = calculateTypedChainId(ChainType.EVM, 5001);
const chainId = calculateTypedChainId(ChainType.EVM, 5002);
const depositUtxo = await CircomUtxo.generateUtxo({
  curve: 'Bn254',
  backend: 'Circom',
  amount: ethers.utils.parseEther('0.1').toHexString(),
  originChainId: originChainId.toString(),
  chainId: chainId.toString(),
  keypair: new Keypair(),
});

const leaves = vanchor.tree.elements().map((el) => hexToU8a(el.toHexString()));

const res = await vanchor.transact(
  [],
  [depositUtxo],
  0,
  0,
  '0',
  '0',
  zeroTokenAddress,
  {
    [originChainId]: leaves,
  }
);
console.log(res);
