import { env, exit } from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import yargs from 'yargs';
import isCI from 'is-ci';
import { hideBin } from 'yargs/helpers';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import {
  VBridge,
  TokenConfig,
  VBridgeInput,
} from '@webb-tools/vbridge/lib/VBridge.js';
import { DeployerConfig, GovernorConfig } from '@webb-tools/interfaces';
import { fetchComponentsFromFilePaths } from '@webb-tools/utils';
import {
  ERC20__factory as ERC20Factory,
  FungibleTokenWrapper__factory as FungibleTokenWrapperFactory,
} from '@webb-tools/contracts';
import {
  parseTypedChainId,
  calculateTypedChainId,
  ChainType,
} from '@webb-tools/sdk-core';
import chalk from 'chalk';
import * as R from 'ramda';
import { deployWETH9 } from './deployWETH.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

async function deployWebbBridge(
  fungibleTokensConfig: Map<number, TokenConfig>,
  tokens: Record<number, string[]>,
  deployers: DeployerConfig,
  governorConfig: GovernorConfig
): Promise<VBridge> {
  const assetRecord: typeof tokens = {};
  const chainIdsArray: number[] = [];
  const webbTokens = new Map(); // left empty for now
  for (const typedChainId of Object.keys(deployers)) {
    const k = parseInt(typedChainId);
    assetRecord[k] = tokens[k];
    chainIdsArray.push(k);
  }

  const bridgeInput: VBridgeInput = {
    vAnchorInputs: {
      asset: assetRecord,
    },
    chainIDs: chainIdsArray,
    tokenConfigs: fungibleTokensConfig,
    webbTokens,
  };

  const zkComponentsSmall = await fetchComponentsFromFilePaths(
    path.resolve(
      dirname,
      './fixtures/solidity-fixtures/vanchor_2/8/poseidon_vanchor_2_8.wasm'
    ),
    path.resolve(
      dirname,
      './fixtures/solidity-fixtures/vanchor_2/8/witness_calculator.cjs'
    ),
    path.resolve(
      dirname,
      './fixtures/solidity-fixtures/vanchor_2/8/circuit_final.zkey'
    )
  );

  const zkComponentsLarge = await fetchComponentsFromFilePaths(
    path.resolve(
      dirname,
      './fixtures/solidity-fixtures/vanchor_16/8/poseidon_vanchor_16_8.wasm'
    ),
    path.resolve(
      dirname,
      './fixtures/solidity-fixtures/vanchor_16/8/witness_calculator.cjs'
    ),
    path.resolve(
      dirname,
      './fixtures/solidity-fixtures/vanchor_16/8/circuit_final.zkey'
    )
  );

  return VBridge.deployVariableAnchorBridge(
    bridgeInput,
    deployers,
    governorConfig,
    zkComponentsSmall,
    zkComponentsLarge
  );
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

type DeploymentConfig = {
  deployers: {
    [chainId: number]: ethers.Wallet;
  };
  typedChainIds: number[];
  governorAddress: string;
  deployWeth: boolean;
  wethAddress?: string;
  allowWrappingNativeToken: boolean;
  webbTokenName: string;
  webbTokenSymbol: string;
};

async function deploy(config: DeploymentConfig): Promise<DeploymentResult> {
  const tokenAddresses: string[] = [];
  if (config.allowWrappingNativeToken) {
    tokenAddresses.push('0');
  }
  if (config.deployWeth) {
    // Deploy WETH on each chain
    console.log(chalk`{yellow Deploying WETH...}`);
    for (const typedChainId of config.typedChainIds) {
      const deployer = config.deployers[typedChainId];
      const wethAddress = await deployWETH9(deployer);
      const chainId = parseTypedChainId(typedChainId).chainId;
      console.log(
        chalk`{green.bold Chain ${chainId} WETH Deployed at {blue.bold ${wethAddress}}}`
      );
      config.wethAddress = wethAddress;
    }
    // Add WETH to the token list
    if (config.wethAddress && !tokenAddresses.includes(config.wethAddress)) {
      tokenAddresses.push(config.wethAddress);
    }
  } else if (config.wethAddress) {
    // otherwise, verify that the WETH address is correct
    assert.ok(config.wethAddress, 'WETH address not set');
    // verify WETH on each chain
    console.log(chalk`{yellow Verifying WETH...}`);
    for (const typedChainId of config.typedChainIds) {
      const deployer = config.deployers[typedChainId];
      const weth = ERC20Factory.connect(config.wethAddress, deployer);
      // check that the token symbol is WETH
      const wethSymbol = await weth.symbol();
      assert.equal(
        wethSymbol,
        'WETH',
        `Invalid WETH symbol on ${typedChainId}`
      );
      const chainId = parseTypedChainId(typedChainId).chainId;
      console.log(chalk`{green.bold WETH Verified on ${chainId}!}`);
    }
    // Add WETH to the token list
    if (!tokenAddresses.includes(config.wethAddress)) {
      tokenAddresses.push(config.wethAddress);
    }
  }
  // Deploy the bridge
  console.log(chalk`{yellow Deploying bridge...}`);

  const governorConfig: GovernorConfig = Object.keys(config.deployers).reduce(
    (acc, typedChainId) => {
      acc[parseInt(typedChainId)] = config.governorAddress;
      return acc;
    },
    {} as GovernorConfig
  );

  const erc20Tokens = Object.keys(config.deployers).reduce(
    (acc, typedChainId) => {
      acc[parseInt(typedChainId)] = tokenAddresses;
      return acc;
    },
    {} as Record<number, string[]>
  );

  // Configure fungible tokens for each chain
  const webbTokenConfig: TokenConfig = {
    name: config.webbTokenName,
    symbol: config.webbTokenSymbol,
  };

  const fungibleTokensConfig: Map<number, TokenConfig> = new Map(
    Object.keys(config.deployers).map((typedChainId) => [
      parseInt(typedChainId),
      webbTokenConfig,
    ])
  );

  const webb = await deployWebbBridge(
    fungibleTokensConfig,
    erc20Tokens,
    config.deployers,
    governorConfig
  );

  for (const [typedChainId, wtoken] of webb.webbTokenAddresses) {
    const deployer = config.deployers[typedChainId];
    const fungibleTokenWrapper = FungibleTokenWrapperFactory.connect(
      wtoken,
      deployer
    );
    // Grant the governor all the roles on the token
    const adminRole = await fungibleTokenWrapper.DEFAULT_ADMIN_ROLE();
    const minterRole = await fungibleTokenWrapper.MINTER_ROLE();
    const pauserRole = await fungibleTokenWrapper.PAUSER_ROLE();

    const tx1 = await fungibleTokenWrapper.grantRole(
      adminRole,
      config.governorAddress
    );
    await tx1.wait();
    const tx2 = await fungibleTokenWrapper.grantRole(
      minterRole,
      config.governorAddress
    );
    await tx2.wait();
    const tx3 = await fungibleTokenWrapper.grantRole(
      pauserRole,
      config.governorAddress
    );
    await tx3.wait();

    // Then Remove the deployer's from the roles
    const tx4 = await fungibleTokenWrapper.revokeRole(
      minterRole,
      deployer.address
    );
    await tx4.wait();
    const tx5 = await fungibleTokenWrapper.revokeRole(
      pauserRole,
      deployer.address
    );
    await tx5.wait();
  }
  console.log(chalk`{green.bold 🎉 Bridge Deployed! 🎉}`);

  console.log(chalk`{bold Bridge Addresses:}`);
  let bridgeAddress: string;
  for (const bridgeSide of webb.vBridgeSides.values()) {
    const chainId = await bridgeSide.contract.signer.getChainId();
    console.log(
      chalk`{green.bold Chain ${chainId}:} {blue.bold ${bridgeSide.contract.address}}`
    );
    bridgeAddress = bridgeSide.contract.address;
  }

  console.log(chalk`{bold Anchor Addresses:}`);
  let anchorAddress: string;
  for (const anchor of webb.vAnchors.values()) {
    const chainId = await anchor.contract.signer.getChainId();
    console.log(
      chalk`{green.bold Chain ${chainId}:} {blue.bold ${anchor.contract.address}}`
    );
    anchorAddress = anchor.contract.address;
  }

  console.log(chalk`{bold Webb Token Addresses:}`);
  let webbTokenAddress: string;
  for (const [typedChainId, wtoken] of webb.webbTokenAddresses) {
    const deployer = config.deployers[typedChainId];
    const fungibleTokenWrapper = FungibleTokenWrapperFactory.connect(
      wtoken,
      deployer
    );
    const tokenSymbol = await fungibleTokenWrapper.symbol();
    const tokenName = await fungibleTokenWrapper.name();
    const v = parseTypedChainId(typedChainId);
    const chainId = v.chainId;
    console.log(
      chalk`{green.bold Chain ${chainId}:} {cyan.bold ${tokenName} (${tokenSymbol})} {blue.bold ${wtoken}}`
    );
    webbTokenAddress = wtoken;
  }

  assert.ok(bridgeAddress!, 'Bridge address not found');
  assert.ok(anchorAddress!, 'Anchor address not found');
  assert.ok(webbTokenAddress!, 'Webb token address not found');
  return {
    kind: 'Ok',
    deployment: {
      bridgeAddress,
      anchorAddress,
      webbTokenAddress,
      wethAddress: config.wethAddress,
    },
  };
}

export type Args = {
  wethAddress: string;
  deployWeth: boolean;
  webbTokenName: string;
  webbTokenSymbol: string;
  allowWrappingNativeToken: boolean;
};

/**
 * Parse the command line arguments
 * @param args The command line arguments
 * @returns The parsed arguments
 * @throws If the arguments are invalid
 * @throws If the WETH address is invalid
 */
async function parseArgs(args: string[]): Promise<Args> {
  const parsed: Args = await yargs(args)
    .options({
      wethAddress: {
        type: 'string',
        description: 'The address of the WETH contract',
        demandOption: false,
        conflicts: 'deployWeth',
        coerce: (arg) => {
          if (arg && !ethers.utils.isAddress(arg)) {
            throw new Error('Invalid WETH address');
          } else {
            return arg;
          }
        },
      },
      deployWeth: {
        type: 'boolean',
        description: 'Whether to deploy WETH',
        demandOption: false,
        default: true,
        conflicts: 'wethAddress',
      },
      webbTokenName: {
        type: 'string',
        description: 'The name of the webb token',
        demandOption: false,
        default: 'webbTNT-standalone',
      },
      webbTokenSymbol: {
        type: 'string',
        description: 'The symbol of the webb token',
        demandOption: false,
        default: 'webbTNT',
      },
      allowWrappingNativeToken: {
        type: 'boolean',
        description: 'Whether to allow wrapping native tokens into webb tokens',
        demandOption: false,
        default: true,
      },
    })
    .parseAsync();
  return parsed;
}

export type Deployment = {
  bridgeAddress: string;
  anchorAddress: string;
  webbTokenAddress: string;
  wethAddress?: string;
};

export type DeploymentResult =
  | {
      kind: 'Ok';
      deployment: Deployment;
    }
  | {
      kind: 'Err';
      error: string;
    };

export async function deployWithArgs(args: Args): Promise<DeploymentResult> {
  console.log(chalk`{bold Starting deployment script...}`);
  const vaultMnemonic = getVaultMnemonic();
  const vault = ethers.Wallet.fromMnemonic(vaultMnemonic);
  // For Deployment, we create a new dummy wallet and use it to deploy the bridge
  const deployer = ethers.Wallet.createRandom();
  const domain = process.env.DOMAIN ?? 'localhost';
  const chainRpcUrls = isCI
    ? [
        `http://${domain}:${process.env.ATHENA_CHAIN_ID}`,
        `http://${domain}:${process.env.HERMES_CHAIN_ID}`,
        `http://${domain}:${process.env.DEMETER_CHAIN_ID}`,
      ]
    : [
        `https://athena-testnet.${domain}`,
        `https://hermes-testnet.${domain}`,
        `https://demeter-testnet.${domain}`,
      ];

  const providers = chainRpcUrls.map(
    (url) => new ethers.providers.JsonRpcProvider(url)
  );

  console.log(chalk`{dim Checking connection to providers...}`);
  for (const provider of providers) {
    const network = await provider.getNetwork();
    console.log(chalk`{dim.green Connected to {blue ${network.chainId}}}`);
  }
  const vaultProviders = providers.map((provider) => vault.connect(provider));
  const deployerProviders = providers.map((provider) =>
    deployer.connect(provider)
  );

  // Helper function to send funds from one wallet to another
  const sendFunds = async (
    value: ethers.BigNumberish,
    from: ethers.Wallet,
    to: ethers.Wallet
  ) => {
    const tx = await from.sendTransaction({
      to: to.address,
      value,
    });
    return tx.wait();
  };

  // We use the Vault wallet to send the deployer some funds to pay for the deployment
  // This is not necessary if you are deploying to a testnet, at the end of the script
  // the deployer wallet will send any remaining funds back to the Vault wallet.

  // Send the deployer some funds
  console.log(
    chalk`{bold Sending funds to deployer {blue.bold ${deployer.address}}}`
  );

  const value = ethers.utils.parseEther('1');
  await Promise.all(
    R.zipWith(R.curry(sendFunds)(value), vaultProviders, deployerProviders)
  );

  let result: DeploymentResult;
  try {
    const networks = await Promise.all(
      providers.map((provider) => provider.getNetwork())
    );
    const chainIds = networks.map((network) => network.chainId);
    const typedChainIds = chainIds.map((chainId) =>
      calculateTypedChainId(ChainType.EVM, chainId)
    );

    const config: DeploymentConfig = {
      deployers: R.zipObj(typedChainIds, deployerProviders),
      governorAddress: vault.address,
      typedChainIds,
      ...args,
    };
    result = await deploy(config);
  } catch (e) {
    console.error(e);
    result = {
      kind: 'Err',
      error: (e as Error).message,
    };
  }
  const balances = await Promise.all(
    deployerProviders.map((provider) => provider.getBalance())
  );
  const gasCost = ethers.utils.parseEther('0.0001');
  const remBalance = balances
    .reduce((acc, balance) => acc.add(balance), ethers.BigNumber.from(0))
    .div(balances.length)
    .sub(gasCost);

  // Send the remaining funds back to the Vault Wallet
  await Promise.all(
    R.zipWith(R.curry(sendFunds)(remBalance), deployerProviders, vaultProviders)
  );

  console.log(
    chalk`Funds sent back to Vault wallet: {blue.bold ${vault.address}}`
  );
  return result;
}

// *** MAIN ***
async function main() {
  const args = await parseArgs(hideBin(process.argv));
  // Load the environment variables
  dotenv.config({
    path: path.resolve(dirname, '../.env'),
  });
  await deployWithArgs(args);
  // Exit the script
  exit(0);
}

if (env.NODE_ENV !== 'test') {
  main();
}
