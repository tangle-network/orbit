import { VAnchor } from '@webb-tools/anchors';
import * as dotenv from 'dotenv';
import {
  fetchComponentsFromFilePaths,
  hexToU8a,
  calculateTypedChainId,
  ChainType,
  Utxo,
  Keypair,
} from '@webb-tools/utils';
import { ethers } from 'ethers';
import path from 'node:path';
import { env, exit } from 'node:process';
import { fileURLToPath } from 'node:url';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const dirname = path.dirname(fileURLToPath(import.meta.url));
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

/**
 * Arguments for the deploy script
 */
export type Args = {
  /**
   * The address of the VAnchor contract
   * @example 0x1234567890123456789012345678901234567890
   */
  contractAddress: string;
  /**
   * The amount of ETH to deposit
   * @default 0.01 ETH
   * @example 0.1 ETH
   **/
  amount: number;
};

/**
 * Parse the command line arguments
 */
async function parseArgs(args: string[]): Promise<Args> {
  const parsed: Args = await yargs(args)
    .options({
      contractAddress: {
        type: 'string',
        description: 'The address of the VAnchor contract',
        demandOption: true,
        coerce: (arg) => {
          if (arg && !ethers.utils.isAddress(arg)) {
            throw new Error('Invalid Contract address');
          } else {
            return arg;
          }
        },
      },
      amount: {
        type: 'number',
        description: 'The amount of ETH to deposit',
        demandOption: false,
        default: 0.01,
      },
    })
    .parseAsync();
  return parsed;
}
// *** MAIN ***
async function main() {
  const args = await parseArgs(hideBin(process.argv));
  // Load the environment variables
  dotenv.config({
    path: path.resolve(dirname, '../.env'),
  });

  const vault = ethers.Wallet.fromMnemonic(getVaultMnemonic());
  const chainRpcUrls = [
    `http://127.0.0.1:${env.ATHENA_CHAIN_PORT}`,
    `http://127.0.0.1:${env.HERMES_CHAIN_PORT}`,
    `http://127.0.0.1:${env.DEMETER_CHAIN_PORT}`,
  ];

  const providers = chainRpcUrls.map(
    (url) => new ethers.providers.JsonRpcProvider(url)
  );
  const zeroTokenAddress = '0x0000000000000000000000000000000000000000';
  const provider = providers[0];
  const vaultSender = vault.connect(provider);
  const testAccount = ethers.Wallet.createRandom().connect(provider);
  const tx1 = await vaultSender.sendTransaction({
    to: testAccount.address,
    value: ethers.utils.parseEther('1000'),
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
    args.contractAddress,
    zkComponentsSmall,
    zkComponentsLarge,
    testAccount
  );

  const ATHENA_CHAIN_ID = parseInt(env.ATHENA_CHAIN_ID!);
  const HERMES_CHAIN_ID = parseInt(env.HERMES_CHAIN_ID!);
  const originChainId = calculateTypedChainId(ChainType.EVM, ATHENA_CHAIN_ID);
  const chainId = calculateTypedChainId(ChainType.EVM, HERMES_CHAIN_ID);
  const depositUtxo = Utxo.generateUtxo({
    curve: 'Bn254',
    backend: 'Circom',
    amount: ethers.utils.parseEther(args.amount.toString()).toHexString(),
    originChainId: originChainId.toString(),
    chainId: chainId.toString(),
    keypair: new Keypair(),
  });

  const leaves = vanchor.tree
    .elements()
    .map((el) => hexToU8a(el.toHexString()));

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
  console.log('TxHash:', res.transactionHash);
  // Exit the script
  exit(0);
}

await main();
