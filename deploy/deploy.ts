import { ethers } from 'ethers';
import { VBridge } from '@webb-tools/vbridge';
import { DeployerConfig, GovernorConfig } from '@webb-tools/interfaces';
import {
  fetchComponentsFromFilePaths,
  getChainIdType,
} from '@webb-tools/utils';

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
    './fixtures/solidity-fixtures/vanchor_2/8/poseidon_vanchor_2_8.wasm',
    './fixtures/solidity-fixtures/vanchor_2/8/witness_calculator.cjs',
    './fixtures/solidity-fixtures/vanchor_2/8/circuit_final.zkey'
  );

  const zkComponentsLarge = await fetchComponentsFromFilePaths(
    './fixtures/solidity-fixtures/vanchor_16/8/poseidon_vanchor_16_8.wasm',
    './fixtures/solidity-fixtures/vanchor_16/8/witness_calculator.cjs',
    './fixtures/solidity-fixtures/vanchor_16/8/circuit_final.zkey'
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
  const maybeVultMnemonic = Deno.env.get('VULT_MNEMONIC');
  if (!maybeVultMnemonic) {
    throw new Error('VULT_MNEMONIC not set');
  }
  return maybeVultMnemonic;
}

// *** MAIN ***

const vultMnemonic = getVultMnemonic();
const vult = ethers.Wallet.fromPhrase(vultMnemonic);
// For Deployment, we create a new dummy wallet and use it to deploy the bridge
const deployer = ethers.Wallet.createRandom();

const athenaRpcUrl =
  Deno.env.get('ATHENA_RPC_URL') ?? 'https://athena-testnet.webb.local';
const hermesRpcUrl =
  Deno.env.get('HERMES_RPC_URL') ?? 'https://hermes-testnet.webb.local';
const demeterRpcUrl =
  Deno.env.get('DEMETER_RPC_URL') ?? 'https://demeter-testnet.webb.local';
const athenaProvider = new ethers.JsonRpcProvider(athenaRpcUrl);
const hermesProvider = new ethers.JsonRpcProvider(hermesRpcUrl);
const demeterProvider = new ethers.JsonRpcProvider(demeterRpcUrl);

// Check the connection to the providers
const networks = {
  athena: await athenaProvider.getNetwork(),
  hermes: await hermesProvider.getNetwork(),
  demeter: await demeterProvider.getNetwork(),
};
console.log('Checking connection to providers...', networks);

const athenaTypedChainId = getChainIdType(Number(networks.athena.chainId));
const hermesTypedChainId = getChainIdType(Number(networks.hermes.chainId));
const demeterTypedChainId = getChainIdType(Number(networks.demeter.chainId));

// We use the Vult wallet to send the deployer some funds to pay for the deployment
// This is not necessary if you are deploying to a testnet, at the end of the script
// the deployer wallet will send any remaining funds back to the Vult wallet.
