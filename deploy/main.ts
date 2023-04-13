import { env, exit } from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { VBridge } from '@webb-tools/vbridge';
import { DeployerConfig, GovernorConfig } from '@webb-tools/interfaces';
import { fetchComponentsFromFilePaths } from '@webb-tools/utils';
import {
  parseTypedChainId,
  calculateTypedChainId,
  ChainType,
} from '@webb-tools/sdk-core';
import chalk from 'chalk';
import { deployWETH9 } from './deployWETH.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

async function deployWebbBridge(
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

  const bridgeInput = {
    vAnchorInputs: {
      asset: assetRecord,
    },
    chainIDs: chainIdsArray,
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
 * Returns the Vult mnemonic from the environment
 * @returns {string} The Vult mnemonic
 * @throws {Error} If the Vult mnemonic is not set
 */
function getVultMnemonic(): string {
  const maybeVultMnemonic = env.MNEMONIC;
  if (!maybeVultMnemonic) {
    throw new Error('MNEMONIC not set');
  }
  return maybeVultMnemonic;
}

// *** MAIN ***
async function main() {
  console.log(chalk`{bold Starting deployment script...}`);
  // Load the environment variables
  dotenv.config({
    path: path.resolve(dirname, '../.env'),
  });
  const vultMnemonic = getVultMnemonic();
  const vult = ethers.Wallet.fromMnemonic(vultMnemonic);
  // For Deployment, we create a new dummy wallet and use it to deploy the bridge
  const deployer = ethers.Wallet.createRandom();

  const domain = process.env.DOMAIN ?? 'localhost';
  const athenaRpcUrl = `https://athena-testnet.${domain}`;
  const hermesRpcUrl = `https://hermes-testnet.${domain}`;
  const demeterRpcUrl = `https://demeter-testnet.${domain}`;

  const athenaProvider = new ethers.providers.JsonRpcProvider(athenaRpcUrl);
  const hermesProvider = new ethers.providers.JsonRpcProvider(hermesRpcUrl);
  const demeterProvider = new ethers.providers.JsonRpcProvider(demeterRpcUrl);

  // Check the connection to the providers
  const networks: {
    [key: string]: ethers.providers.Network;
  } = {};
  try {
    console.log(chalk`{dim Checking connection to providers...}`);
    networks.athena = await athenaProvider.getNetwork();
    console.log(
      chalk`{dim.green Connected to Athena: {blue ${networks.athena.chainId}}}`
    );
    networks.hermes = await hermesProvider.getNetwork();
    console.log(
      chalk`{dim.green Connected to Hermes: {blue ${networks.hermes.chainId}}}`
    );
    networks.demeter = await demeterProvider.getNetwork();
    console.log(
      chalk`{dim.green Connected to Demeter: {blue ${networks.demeter.chainId}}}`
    );
  } catch (e) {
    console.log(chalk`{red Failed to connect to providers}`);
    throw e;
  }

  const athenaTypedChainId = calculateTypedChainId(
    ChainType.EVM,
    Number(networks.athena.chainId)
  );
  const hermesTypedChainId = calculateTypedChainId(
    ChainType.EVM,
    Number(networks.hermes.chainId)
  );
  const demeterTypedChainId = calculateTypedChainId(
    ChainType.EVM,
    Number(networks.demeter.chainId)
  );

  // We use the Vult wallet to send the deployer some funds to pay for the deployment
  // This is not necessary if you are deploying to a testnet, at the end of the script
  // the deployer wallet will send any remaining funds back to the Vult wallet.
  const athenaVult = vult.connect(athenaProvider);
  const hermesVult = vult.connect(hermesProvider);
  const demeterVult = vult.connect(demeterProvider);

  const athenaDeployer = deployer.connect(athenaProvider);
  const hermesDeployer = deployer.connect(hermesProvider);
  const demeterDeployer = deployer.connect(demeterProvider);

  // Send the deployer some funds
  console.log(
    chalk`{bold Sending funds to deployer {blue.bold ${deployer.address}}}`
  );
  await Promise.all([
    athenaVult.sendTransaction({
      to: athenaDeployer.address,
      value: ethers.utils.parseEther('1'),
    }),
    hermesVult.sendTransaction({
      to: hermesDeployer.address,
      value: ethers.utils.parseEther('1'),
    }),
    demeterVult.sendTransaction({
      to: demeterDeployer.address,
      value: ethers.utils.parseEther('1'),
    }),
  ]).then((txs) => txs.map((tx) => tx.wait()));

  // Deploy WETH on each chain
  console.log(chalk`{yellow Deploying WETH...}`);
  const athenaWETH = await deployWETH9(athenaDeployer);
  const hermesWETH = await deployWETH9(hermesDeployer);
  const demeterWETH = await deployWETH9(demeterDeployer);
  console.log(
    chalk`{green.bold 🎉 WETH Deployed at {blue.bold ${athenaWETH}} 🎉}`
  );

  // Deploy the bridge
  console.log(chalk`{yellow Deploying bridge...}`);
  const deployers: DeployerConfig = {
    [athenaTypedChainId]: athenaDeployer,
    [hermesTypedChainId]: hermesDeployer,
    [demeterTypedChainId]: demeterDeployer,
  };

  const governorConfig: GovernorConfig = {
    [athenaTypedChainId]: vult.address,
    [hermesTypedChainId]: vult.address,
    [demeterTypedChainId]: vult.address,
  };

  const tokens = {
    [athenaTypedChainId]: ['0', athenaWETH],
    [hermesTypedChainId]: ['0', hermesWETH],
    [demeterTypedChainId]: ['0', demeterWETH],
  };

  const webb = await deployWebbBridge(tokens, deployers, governorConfig);
  console.log(chalk`{green.bold 🎉 Bridge Deployed! 🎉}`);

  console.log(chalk`{bold Bridge Addresses:}`);
  for (const bridgeSide of webb.vBridgeSides.values()) {
    const chainId = await bridgeSide.contract.signer.getChainId();
    console.log(
      chalk`{green.bold Chain ${chainId}:} {blue.bold ${bridgeSide.contract.address}}`
    );
  }

  console.log(chalk`{bold Anchor Addresses:}`);
  for (const anchor of webb.vAnchors.values()) {
    const chainId = await anchor.contract.signer.getChainId();
    console.log(
      chalk`{green.bold Chain ${chainId}:} {blue.bold ${anchor.contract.address}}`
    );
  }

  console.log(chalk`{bold Webb Token Addresses:}`);
  for (const [typedChainId, wtoken] of webb.webbTokenAddresses) {
    const v = parseTypedChainId(typedChainId);
    const chainId = v.chainId;
    console.log(chalk`{green.bold Chain ${chainId}:} {blue.bold ${wtoken}}`);
  }

  // Send the remaining funds back to the Vult wallet
  const athenaDeployerBalance = await athenaDeployer.getBalance();
  const hermesDeployerBalance = await hermesDeployer.getBalance();
  const demeterDeployerBalance = await demeterDeployer.getBalance();

  const gasCost = ethers.utils.parseEther('0.0001');
  const athenaDeployerBalanceAfterGas = athenaDeployerBalance.sub(gasCost);
  const hermesDeployerBalanceAfterGas = hermesDeployerBalance.sub(gasCost);
  const demeterDeployerBalanceAfterGas = demeterDeployerBalance.sub(gasCost);
  await Promise.all([
    athenaDeployer.sendTransaction({
      to: athenaVult.address,
      value: athenaDeployerBalanceAfterGas,
    }),
    hermesDeployer.sendTransaction({
      to: hermesVult.address,
      value: hermesDeployerBalanceAfterGas,
    }),
    demeterDeployer.sendTransaction({
      to: demeterVult.address,
      value: demeterDeployerBalanceAfterGas,
    }),
  ]).then((txs) => txs.map((tx) => tx.wait()));

  console.log(
    chalk`Funds sent back to Vult wallet: {blue.bold ${vult.address}}`
  );
  // Exit the script
  exit(0);
}

main();
