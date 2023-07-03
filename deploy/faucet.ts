import { env, exit } from 'node:process';
import path from 'node:path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { ethers } from 'ethers';
import * as R from 'ramda';
import {
  FungibleTokenWrapper__factory as FungibleTokenWrapperFactory,
  type FungibleTokenWrapper,
} from '@webb-tools/contracts';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export type Args = {
  /**
   * Who will receive the funds
   */
  recipients: string[];
  erc20Address?: string;
  nativeTokenAmount: string;
  erc20Amount?: string;
};

/*
 * Parse the command line arguments
 * @param args The command line arguments
 * @returns The parsed arguments
 */
async function parseArgs(args: string[]): Promise<Args> {
  const parsed: Args = await yargs(args)
    .options({
      recipients: {
        array: true,
        type: 'string',
        description: 'The recipients of the funds',
        default: [],
      },
      erc20Address: {
        type: 'string',
        description: 'The address of the ERC20 token',
        demandOption: false,
      },
      nativeTokenAmount: {
        type: 'string',
        description: 'The amount of native token to send',
        default: '0.1',
      },
      erc20Amount: {
        type: 'string',
        description: 'The amount of ERC20 token to send',
        demandOption: false,
      },
    })
    .parseAsync();
  return parsed;
}

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

async function runFaucet(args: Args): Promise<void> {
  console.log(chalk`{bold Starting faucet script...}`);
  const vaultMnemonic = getVaultMnemonic();
  const vault = ethers.Wallet.fromMnemonic(vaultMnemonic);
  const chainRpcUrls = [
    `http://127.0.0.1:${env.ATHENA_CHAIN_PORT}`,
    `http://127.0.0.1:${env.HERMES_CHAIN_PORT}`,
    `http://127.0.0.1:${env.DEMETER_CHAIN_PORT}`,
  ];

  const providers = chainRpcUrls.map(
    (url) => new ethers.providers.JsonRpcProvider(url)
  );

  console.log(chalk`{dim Checking connection to providers...}`);
  for (const provider of providers) {
    console.log(
      chalk`{dim Checking connection to {blue ${provider.connection.url}}}`
    );
    const network = await provider.getNetwork();
    console.log(chalk`{dim.green Connected to {blue ${network.chainId}}}`);
  }
  const vaultProviders = providers.map((provider) => vault.connect(provider));

  // Helper function to send funds from one wallet to another address
  const sendFunds = async (
    value: ethers.BigNumberish,
    from: ethers.Wallet,
    to: string
  ) => {
    const tx = await from.sendTransaction({
      to,
      value,
    });
    const network = await from.provider.getNetwork();
    console.log(
      chalk`{bold Sending funds to {blue.bold ${to}} on {green.bold ${network.chainId}} }`
    );
    return tx.wait();
  };

  const value = ethers.utils.parseEther(args.nativeTokenAmount);
  const combined = R.xprod(vaultProviders, args.recipients);

  for (const [provider, recipient] of combined) {
    await sendFunds(value, provider, recipient);
  }

  const mint = async (
    amount: ethers.BigNumberish,
    contract: FungibleTokenWrapper,
    recipient: string
  ) => {
    const tx = await contract.mint(recipient, amount);
    const network = await contract.provider.getNetwork();
    console.log(
      chalk`{bold Minting {blue.bold ${ethers.utils.formatEther(
        amount
      )}} tokens to {blue.bold ${recipient}} on {green.bold ${network.chainId
        }}}`
    );
    return tx.wait();
  };

  if (R.isNotNil(args.erc20Address) && R.isNotNil(args.erc20Amount)) {
    console.log(chalk`{bold Sending ERC20 tokens...}`);
    const contracts = vaultProviders.map((provider) =>
      FungibleTokenWrapperFactory.connect(args.erc20Address!, provider)
    );
    const amount = ethers.utils.parseEther(args.erc20Amount);
    const combined = R.xprod(contracts, args.recipients);

    for (const [contract, recipient] of combined) {
      await mint(amount, contract, recipient);
    }
  }
  console.log(chalk`{bold Finished faucet script}`);
}

// *** MAIN ***
async function main() {
  const args = await parseArgs(hideBin(process.argv));
  // Load the environment variables
  dotenv.config({
    path: path.resolve(dirname, '../.env'),
  });
  await runFaucet(args);
  // Exit the script
  exit(0);
}

if (env.NODE_ENV !== 'test') {
  main();
}
