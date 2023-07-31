import { env, exit } from 'node:process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { ECPairFactory } from 'ecpair';
import * as tinysecp from 'tiny-secp256k1';
import {
  VBridge,
  type TokenConfig,
  type VBridgeInput,
} from '@webb-tools/vbridge';
import type { DeployerConfig, GovernorConfig } from '@webb-tools/interfaces';
import {
  fetchComponentsFromFilePaths,
  parseTypedChainId,
  calculateTypedChainId,
  ChainType,
} from '@webb-tools/utils';
import {
  ERC20__factory as ERC20Factory,
  SignatureBridge__factory as SignatureBridgeFactory,
  FungibleTokenWrapper__factory as FungibleTokenWrapperFactory,
  type VAnchor,
} from '@webb-tools/contracts';
import chalk from 'chalk';
import * as R from 'ramda';
import { deployWETH9 } from './deployWETH.js';
import { deployMulticall3 } from './deployMulticall3.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

async function deployWebbBridge(
  fungibleTokensConfig: Map<number, TokenConfig>,
  tokens: Record<number, string[]>,
  deployers: DeployerConfig,
  governorConfig: GovernorConfig
): Promise<VBridge<VAnchor>> {
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
    chainIds: chainIdsArray,
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

function ethAddressFromUncompressedPublicKey(publicKey: string): `0x${string}` {
  const pubKeyHash = ethers.utils.keccak256(publicKey); // we hash it.
  const address = ethers.utils.getAddress(`0x${pubKeyHash.slice(-40)}`); // take the last 20 bytes and convert it to an address.
  return address as `0x${string}`;
}

function uncompressPublicKey(compressed: `0x${string}`): `0x${string}` {
  const ECPair = ECPairFactory(tinysecp);
  const dkgPubKey = ECPair.fromPublicKey(
    Buffer.from(compressed.slice(2), 'hex'),
    {
      compressed: false,
    }
  ).publicKey.toString('hex');
  // now we remove the `04` prefix byte and return it.
  return `0x${dkgPubKey.slice(2)}`;
}

/**
 * Computes the governor address from the givin value or returns the default governor address
 * @param value The value to extract the governor address from
 * this can be an Ethereum Address, a compressed public key or an uncompressed public key.
 * @param defaultValue The default governor address
 * @returns The governor address
 **/
export function extractGovernorAddressOrDefault(
  value: string | undefined,
  defaultValue: () => ReturnType<typeof extractGovernorAddressOrDefault>
): `0x${string}` {
  if (value && ethers.utils.isAddress(value)) {
    return value as `0x${string}`; // Ethereum Address
  }
  // Compressed Public Key (0x + 33 bytes)
  else if (value && value.startsWith('0x') && value.length === 66 + 2) {
    return ethAddressFromUncompressedPublicKey(
      uncompressPublicKey(value as `0x${string}`)
    );
  }
  // Uncompressed Public Key (0x + 64 bytes)
  else if (value && value.startsWith('0x') && value.length === 128 + 2) {
    return ethAddressFromUncompressedPublicKey(value as `0x${string}`);
  } else {
    console.warn(
      chalk`{yellow WARNING:} Invalid/Unknown governor address provided. Using default governor address.`,
      value
    );
    return defaultValue();
  }
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
  vaultAddress: string;
  governorAddress: string;
  governorNonce: number;
  deployWeth: boolean;
  wethAddress?: string;
  allowWrappingNativeToken: boolean;
  webbTokenName: string;
  webbTokenSymbol: string;
  deployMulticall3: boolean;
};

async function transferOwnershipOfBridge(
  args: TransferOwnershipArgs
): Promise<void> {
  console.log(chalk`{bold Starting transfer ownership script...}`);
  const vaultMnemonic = getVaultMnemonic();
  const vault = ethers.Wallet.fromMnemonic(vaultMnemonic);
  const chainRpcUrls = [
    `http://127.0.0.1:${env.ATHENA_CHAIN_PORT}`,
    `http://127.0.0.1:${env.HERMES_CHAIN_PORT}`,
    `http://127.0.0.1:${env.DEMETER_CHAIN_PORT}`,
  ];
  // Only add Tangle if it is enabled
  if (args.includeTangleEVM && env.TANGLE_HTTP_URL) {
    chainRpcUrls.push(env.TANGLE_HTTP_URL);
  }

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
  for (const provider of vaultProviders) {
    const sigBridge = SignatureBridgeFactory.connect(
      args.contractAddress,
      provider
    );
    const governor = await sigBridge.governor();
    if (governor === args.governor) {
      const network = await provider.provider.getNetwork();
      console.log(
        chalk`{bold Requested Governor is already set for chain {blue ${network.chainId}}}`
      );
      continue;
    }
    // transfer ownership
    const tx = await sigBridge.transferOwnership(
      args.governor,
      args.governorNonce
    );
    await tx.wait();
    const network = await provider.provider.getNetwork();
    console.log(
      chalk`{bold Transferred ownership of Bridge on chain {blue ${network.chainId}}}`
    );
  }
  exit(0);
}

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
      acc[parseInt(typedChainId)] = {
        address: config.governorAddress,
        nonce: config.governorNonce,
      };
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
      config.vaultAddress
    );
    await tx1.wait();
    const tx2 = await fungibleTokenWrapper.grantRole(
      minterRole,
      config.vaultAddress
    );
    await tx2.wait();
    const tx3 = await fungibleTokenWrapper.grantRole(
      pauserRole,
      config.vaultAddress
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

  console.log(chalk`{bold Generating Relayer Config}`);
  const template = fs.readFileSync(
    path.resolve(dirname, '../config/orbit.toml.tmpl'),
    {
      encoding: 'utf-8',
    }
  );

  // Replace the template variables with the actual values
  const configFile = template
    .replace(/ATHENA_CHAIN_ID/g, env.ATHENA_CHAIN_ID!)
    .replace(/HERMES_CHAIN_ID/g, env.HERMES_CHAIN_ID!)
    .replace(/DEMETER_CHAIN_ID/g, env.DEMETER_CHAIN_ID!)
    .replace(/BRIDGE_ADDRESS/g, bridgeAddress)
    .replace(/VANCHOR_ADDRESS/g, anchorAddress);
  // Write the config file
  fs.writeFileSync(path.resolve(dirname, '../config/orbit.toml'), configFile);

  let multicall3Address: string | undefined;
  if (config.deployMulticall3) {
    console.log(chalk`{yellow Deploying Multicall3...}`);
    for (const typedChainId of config.typedChainIds) {
      const deployer = config.deployers[typedChainId];
      const multicall3Contract = await deployMulticall3(deployer);
      const receipt = await multicall3Contract.deployTransaction.wait();
      multicall3Address = multicall3Contract.address;
      const chainId = parseTypedChainId(typedChainId).chainId;
      console.log(
        chalk`{green.bold Chain ${chainId} Multicall3 deployed at: block {blue.bold ${receipt.blockNumber} - address {blue.bold ${multicall3Address}}}}`
      );
    }
  }

  return {
    kind: 'Ok',
    deployment: {
      bridgeAddress,
      anchorAddress,
      webbTokenAddress,
      wethAddress: config.wethAddress,
      multicall3Address,
    },
  };
}

export type TransferOwnershipArgs = {
  /**
   * The address of the Signature Bridge contract
   * @example 0x1234567890123456789012345678901234567890
   */
  contractAddress: string;
  /**
   * The Signature Bridge governor:
   * 1. Could be ETH address
   * 2. Could be Uncompressed Public Key
   * 3. Could be Compressed Public Key
   * @example 0x1234567890123456789012345678901234567890
   **/
  governor: string;
  /**
   * The nonce of the governor
   * @default 0
   * @example 1
   **/
  governorNonce: number;

  /**
   * Include tangle EVM chain.
   * @default false
   * @example true
   **/
  includeTangleEVM: boolean;
};

/**
 * Arguments for the deploy script
 */
export type Args = {
  /**
   * The address of the WETH contract
   * @default The WETH contract will be deployed
   * @example 0x1234567890123456789012345678901234567890
   */
  wethAddress: string;
  /**
   * Whether to deploy the WETH contract
   * @default true
   * @example false
   **/
  deployWeth: boolean;
  /**
   * The name of the Webb token
   * @default Webb Wrapped Ether
   * @example Webb Wrapped Ether
   **/
  webbTokenName: string;
  /**
   * The symbol of the Webb token
   * @default webbWETH
   * @example webbWETH
   **/
  webbTokenSymbol: string;
  /**
   * Whether to allow wrapping the native token
   * @default true
   * @example false
   **/
  allowWrappingNativeToken: boolean;
  /**
   * The Signature Bridge governor:
   * 1. Could be ETH address
   * 2. Could be Uncompressed Public Key
   * 3. Could be Compressed Public Key
   * @default undefined
   * @example 0x1234567890123456789012345678901234567890
   **/
  governor?: string;
  /**
   * The nonce of the governor
   * @default 0
   * @example 1
   **/
  governorNonce: number;
  /**
   * Whether to deploy the Multicall3 contract
   * @default true
   * @example false
   **/
  deployMulticall3: boolean;

  /**
   * Use this wallet as a vault wallet
   * @default undefined
   **/
  vault?: ethers.Wallet;

  /**
   * Include tangle EVM chain.
   * @default false
   * @example true
   **/
  includeTangleEVM: boolean;
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
    .command<TransferOwnershipArgs>(
      'transfer-ownership',
      'Transfer ownership of existing the bridge',
      (yargs) =>
        yargs.options({
          contractAddress: {
            type: 'string',
            description: 'The address of the Signature Bridge contract',
            demandOption: true,
            coerce: (arg) => {
              if (arg && !ethers.utils.isAddress(arg)) {
                throw new Error('Invalid contract address');
              } else {
                return arg;
              }
            },
          },
          governor: {
            type: 'string',
            description:
              'The Signature Bridge governor. Could be ETH address, Uncompressed or Compressed Public Key',
            demandOption: true,
          },
          governorNonce: {
            type: 'number',
            description: 'The nonce of the governor',
            demandOption: false,
            default: 0,
          },
          includeTangleEVM: {
            type: 'boolean',
            description: 'Include tangle EVM chain',
            demandOption: false,
            default: false,
          },
        }),
      async (argv) => {
        await transferOwnershipOfBridge(argv);
      }
    )
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
        default: 'Webb Wrapped Ether',
      },
      webbTokenSymbol: {
        type: 'string',
        description: 'The symbol of the webb token',
        demandOption: false,
        default: 'webbWETH',
      },
      allowWrappingNativeToken: {
        type: 'boolean',
        description: 'Whether to allow wrapping native tokens into webb tokens',
        demandOption: false,
        default: true,
      },
      governor: {
        type: 'string',
        description:
          'The Signature Bridge governor. Could be ETH address, Uncompressed or Compressed Public Key',
        demandOption: false,
      },
      governorNonce: {
        type: 'number',
        description: 'The nonce of the governor',
        demandOption: false,
        default: 0,
      },
      deployMulticall3: {
        type: 'boolean',
        description: 'Whether to deploy Multicall3 contract',
        demandOption: false,
        default: true,
      },
      includeTangleEVM: {
        type: 'boolean',
        description: 'Include tangle EVM chain',
        demandOption: false,
        default: false,
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
  multicall3Address?: string;
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
  const vault = args.vault ?? ethers.Wallet.fromMnemonic(getVaultMnemonic());

  // For Deployment, if the deployer mnemonic is not provided, we will use a random wallet
  const deployer =
    env.DEPLOYER_PRIVATE_KEY !== '' && env.DEPLOYER_PRIVATE_KEY !== undefined
      ? new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY)
      : ethers.Wallet.createRandom();

  console.log(chalk`{dim Using Vault Account: ${vault.address}...}`);
  console.log(chalk`{dim Using Deployer Account: ${deployer.address}...}`);
  const chainRpcUrls = [
    `http://127.0.0.1:${env.ATHENA_CHAIN_PORT}`,
    `http://127.0.0.1:${env.HERMES_CHAIN_PORT}`,
    `http://127.0.0.1:${env.DEMETER_CHAIN_PORT}`,
  ];

  // Only add Tangle if it is enabled
  if (args.includeTangleEVM && env.TANGLE_HTTP_URL) {
    chainRpcUrls.push(env.TANGLE_HTTP_URL);
  }

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
    const result = await tx.wait();
    const network = await from.provider?.getNetwork();
    const v = ethers.utils.formatEther(value);
    console.log(
      chalk`{dim Sent {blue ${v}} ETH from {blue ${from.address}} to {blue ${to.address}} on {blue ${network?.chainId}}. Tx Hash: {blue ${result.transactionHash}}}`
    );
  };

  // We use the Vault wallet to send the deployer some funds to pay for the deployment
  // This is not necessary if you are deploying to a testnet, at the end of the script
  // the deployer wallet will send any remaining funds back to the Vault wallet.

  // Send the deployer some funds
  console.log(
    chalk`{bold Sending funds to deployer {blue.bold ${deployer.address}}}`
  );

  let defaultValue = ethers.utils.parseEther('1');
  let valueByNetwork: Record<string, ethers.BigNumberish> = {
    [env.ATHENA_CHAIN_ID!]: defaultValue,
    [env.HERMES_CHAIN_ID!]: defaultValue,
    [env.DEMETER_CHAIN_ID!]: defaultValue,
    [env.TANGLE_CHAIN_ID!]: ethers.utils.parseEther('2'),
  };

  await Promise.all(
    R.zipWith(
      async (vault, deployer) => {
        const chainId = await vault.getChainId();
        const value = valueByNetwork[chainId] ?? defaultValue;
        const v = ethers.utils.formatEther(value);
        console.log(
          chalk`{dim Sending {blue ${v}} ETH from {blue ${vault.address}} to {blue ${deployer.address}} on {blue ${chainId}}}`
        );
        return sendFunds(value, vault, deployer);
      },
      vaultProviders,
      deployerProviders
    )
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
      governorAddress: extractGovernorAddressOrDefault(
        args.governor ?? vault.address,
        () => vault.address as `0x${string}`
      ),
      typedChainIds,
      vaultAddress: vault.address,
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

  // Send the remaining funds back to the Vault Wallet
  await Promise.all(
    R.zipWith(
      async (deployer, vault) => {
        let balance = await deployer.getBalance();
        if (balance.gt(ethers.constants.Zero)) {
          let remaining = balance.sub(ethers.utils.parseEther('0.01'));
          let v = ethers.utils.formatEther(remaining);
          console.log(
            chalk`{dim Sending remaining {blue ${v}} ETH from {blue ${deployer.address}} to {blue ${vault.address}}}`
          );
          return sendFunds(remaining, deployer, vault);
        } else {
          return Promise.resolve();
        }
      },
      deployerProviders,
      vaultProviders
    )
  );

  console.log(
    chalk`Funds sent back to Vault wallet: {blue.bold ${vault.address}}`
  );

  return result;
}

// *** MAIN ***
async function main() {
  // Load the environment variables
  dotenv.config({
    path: path.resolve(dirname, '../.env'),
  });
  const args = await parseArgs(hideBin(process.argv));
  await deployWithArgs(args);
  // Exit the script
  exit(0);
}

if (env.NODE_ENV !== 'test') {
  main();
}
