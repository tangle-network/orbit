import '@polkadot/api-augment/substrate';

import { ApiPromise, WsProvider, Keyring } from '@polkadot/api';
import { env, exit } from 'node:process';
import path from 'node:path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import * as dotenv from 'dotenv';
import { u8aToHex, hexToU8a } from '@polkadot/util';
import type { Codec, Registry } from '@polkadot/types-codec/types';
import { u32, u128, createType } from '@polkadot/types';
import type { KeyringPair } from '@polkadot/keyring/types';
import type { SubmittableExtrinsic } from '@polkadot/api/types';
import { ChainType, type TypedChainId, ResourceId } from '@webb-tools/sdk-core';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';

const dirname = path.dirname(fileURLToPath(import.meta.url));

function makeTypedChainIdCodec(
  r: Registry,
  chainType: ChainType,
  chainId: number
): Codec {
  switch (chainType) {
    case ChainType.EVM:
      return createType(r, 'WebbProposalsHeaderTypedChainId', {
        Evm: chainId,
      });
    case ChainType.Substrate:
      return createType(r, 'WebbProposalsHeaderTypedChainId', {
        Substrate: chainId,
      });
    default:
      throw new Error('Unsupported chain type');
  }
}
async function whitelistChain(
  api: ApiPromise,
  args: {
    typedChainId: TypedChainId;
  }
): Promise<SubmittableExtrinsic<'promise'>> {
  const r = api.registry;

  return api.tx.dkgProposals.whitelistChain(
    makeTypedChainIdCodec(
      r,
      args.typedChainId.chainType,
      args.typedChainId.chainId
    )
  );
}

async function setResource(
  api: ApiPromise,
  args: {
    resourceId: ResourceId;
  }
): Promise<SubmittableExtrinsic<'promise'>> {
  return api.tx.dkgProposals.setResource(
    u8aToHex(args.resourceId.toU8a()),
    '0x00'
  );
}

async function addProposer(
  api: ApiPromise,
  args: {
    nativeAccount: string;
    externalAccount: string;
  }
): Promise<SubmittableExtrinsic<'promise'>> {
  return api.tx.dkgProposals.addProposer(
    args.nativeAccount,
    args.externalAccount
  );
}

async function setAssetMetadata(
  api: ApiPromise,
  args: {
    assetId: number;
    symbol: string;
    decimals: number;
  }
): Promise<SubmittableExtrinsic<'promise'>> {
  return api.tx.assetRegistry.setMetadata(
    args.assetId,
    args.symbol,
    args.decimals
  );
}

async function registerAsset(
  api: ApiPromise,
  args: {
    name: string;
    assetType: { kind: 'Token' } | { kind: 'PoolShare'; with: number[] };
    existentialDeposit: number;
  }
): Promise<SubmittableExtrinsic<'promise'>> {
  const r = api.registry;
  let ty: any;
  switch (args.assetType.kind) {
    case 'Token':
      ty = createType(r, 'PalletAssetRegistryAssetType', {
        Token: null,
      });
      break;
    case 'PoolShare':
      ty = createType(r, 'PalletAssetRegistryAssetType', {
        PoolShare: args.assetType.with,
      });
      break;
    default:
      throw new Error('Unsupported asset type');
  }
  return api.tx.assetRegistry.register(args.name, ty, args.existentialDeposit);
}

async function createVAnchor(
  api: ApiPromise,
  args: {
    maxEdges: number;
    depth: number;
    assetId: number;
  }
): Promise<SubmittableExtrinsic<'promise'>> {
  return api.tx.vAnchorBn254.create(args.maxEdges, args.depth, args.assetId);
}

async function balanceForceTransferFrom(
  api: ApiPromise,
  args: {
    from: string;
    to: string;
    amount: u128;
  }
): Promise<SubmittableExtrinsic<'promise'>> {
  return api.tx.balances.forceTransfer(args.from, args.to, args.amount);
}
/**
 * @param api - ApiPromise
 * @param call - SubmittableExtrinsic
 * @param sudo - KeyringPair
 * @returns Promise<void>
 * @description Call a xt as sudo
 **/
async function callAsSudo(
  api: ApiPromise,
  call: SubmittableExtrinsic<'promise'>,
  sudo: KeyringPair
): Promise<void> {
  const r = api.registry;
  return new Promise(async (resolve, reject) => {
    const unsub = await api.tx.sudo
      .sudo(call)
      .signAndSend(sudo, ({ status, events }) => {
        if (status.isInBlock) {
          events
            .filter(({ event }) => api.events.sudo.Sudid.is(event))
            .forEach(
              ({
                event: {
                  data: [result],
                },
              }) => {
                // @ts-ignore
                if (result.isErr) {
                  // @ts-ignore
                  let error = result.asErr;
                  if (error.isModule) {
                    const decoded = r.findMetaError(error.asModule);
                    const { docs, name, section } = decoded;
                    const v = `${section}.${name}: ${docs.join(' ')}`;
                    unsub();
                    reject(new Error(v));
                  } else {
                    unsub();
                    reject(new Error(error.toString()));
                  }
                } else {
                  unsub();
                  resolve();
                }
              }
            );
        }
      });
  });
}

export type Args = {
  wsEndpoint: string;
  resourceIds: string[];
  proposers: string[];
  nativeAssetSymbol: string;
  nativeAssetDecimals: number;
  webbAssetName: string;
  webbAssetSymbol: string;
  webbAssetDecimals: number;
  maxEdges: number;
  depth: number;
  registerWebbAsset: boolean;
  createVAnchor: boolean;
};

/*
 * Parse the command line arguments
 * @param args The command line arguments
 * @returns The parsed arguments
 */
async function parseArgs(args: string[]): Promise<Args> {
  const parsed: Args = await yargs(args)
    .options({
      wsEndpoint: {
        type: 'string',
        description: 'The endpoint of the node',
        default: 'ws://127.0.0.1:9944',
      },
      resourceIds: {
        array: true,
        type: 'string',
        description: 'The resource ids',
        default: [],
      },
      proposers: {
        array: true,
        type: 'string',
        description: 'The proposers native accounts',
        default: [],
      },
      nativeAssetSymbol: {
        type: 'string',
        description: 'The native asset symbol',
        default: 'tTNT',
      },
      nativeAssetDecimals: {
        type: 'number',
        description: 'The native asset decimals',
        default: 18,
      },
      webbAssetName: {
        type: 'string',
        description: 'The webb asset name',
        default: 'webbtTNT',
        implies: 'registerWebbAsset',
      },
      webbAssetSymbol: {
        type: 'string',
        description: 'The webb asset symbol',
        default: 'webbtTNT',
        implies: 'registerWebbAsset',
      },
      webbAssetDecimals: {
        type: 'number',
        description: 'The webb asset decimals',
        default: 18,
        implies: 'registerWebbAsset',
      },
      maxEdges: {
        type: 'number',
        description: 'The max edges of the vanchor',
        default: 7,
        implies: 'createVAnchor',
      },
      depth: {
        type: 'number',
        description: 'The depth of the vanchor',
        default: 30,
        implies: 'createVAnchor',
      },
      registerWebbAsset: {
        type: 'boolean',
        description: 'Register the webb asset',
        default: false,
      },
      createVAnchor: {
        type: 'boolean',
        description: 'Create the vanchor',
        default: false,
      },
    })
    .parseAsync();
  return parsed;
}

/**
 * Returns the Sudo Account SURI from the environment
 * @returns {string} The Sudo SURI
 * @throws {Error} If the Sudo SURI is not set
 */
function getSudoSuri(): string {
  const maybeSudoSuri = env.SUDO_SURI;
  if (!maybeSudoSuri) {
    throw new Error('SUDO_SURI not set');
  }
  return maybeSudoSuri;
}

async function configureTangle(args: Args) {
  console.log(chalk`{blue.bold Configure the tangle network}!!`);
  const wsProvider = new WsProvider(args.wsEndpoint);
  console.log(chalk`=> {bold Connecting to the node ${args.wsEndpoint}}`);
  const api = await ApiPromise.create({
    provider: wsProvider,
    noInitWarn: true,
  });
  await api.isReady;
  console.log(chalk`[+] {green Connected to the node}`);

  const r = api.registry;
  const keyring = new Keyring({ type: 'sr25519' });
  const sudo = keyring.addFromUri(getSudoSuri());
  const calls: SubmittableExtrinsic<'promise'>[] = [];

  const resourceIds = args.resourceIds.map((v) =>
    ResourceId.fromBytes(hexToU8a(v))
  );
  const proposers = args.proposers.map((v) => createType(r, 'AccountId', v));
  const typedChainIds = resourceIds.map((v) => ({
    chainType: v.chainType,
    chainId: v.chainId,
  }));

  console.log(chalk`=> {green.bold Whitelist the chain ids}`);
  const chainIdsSet = new Set<number>();
  for (const v of typedChainIds) {
    const maybeU32Value = await api.query.dkgProposals.chainNonces(
      makeTypedChainIdCodec(r, v.chainType, v.chainId)
    );
    const maybeNonce = createType(r, 'Option<u32>', maybeU32Value);
    if (maybeNonce.isSome) {
      console.log(
        chalk`[x] {yellow Chain ${v.chainId} is already whitelisted}`
      );
    } else if (!chainIdsSet.has(v.chainId)) {
      const call = await whitelistChain(api, { typedChainId: v });
      calls.push(call);
      console.log(chalk`[+] {green Chain ${v.chainId} whitelisted}`);
      chainIdsSet.add(v.chainId);
    } else {
      console.log(
        chalk`[x] {yellow Chain ${v.chainId} is already whitelisted}`
      );
    }
  }

  console.log(chalk`=> {green.bold Register the resource ids}`);

  for (const v of resourceIds) {
    const vhex = u8aToHex(v.toU8a());
    const maybeResourceIdValue = await api.query.dkgProposals.resources(vhex);
    const maybeResourceId = createType(
      r,
      'Option<Bytes>',
      maybeResourceIdValue
    );
    if (maybeResourceId.isSome) {
      console.log(chalk`[x] {yellow Resource ${vhex} is already registered}`);
    } else {
      const call = await setResource(api, { resourceId: v });
      calls.push(call);
      console.log(chalk`[+] {green Resource ${v.toString()} registered}`);
    }
  }

  console.log(chalk`=> {green.bold Register the proposers}`);
  for (const v of proposers) {
    const maybeProposerValue = await api.query.dkgProposals.proposers(v);
    const alreadyRegistered = createType(r, 'bool', maybeProposerValue);
    if (alreadyRegistered.isTrue) {
      console.log(
        chalk`[x] {yellow Proposer ${v.toString()} is already registered}`
      );
    } else {
      const call = await addProposer(api, {
        nativeAccount: v.toString(),
        externalAccount: '',
      });
      calls.push(call);
      console.log(chalk`[+] {green Proposer ${v.toString()} registered}`);
    }
  }

  if (args.registerWebbAsset) {
    console.log(chalk`=> {bold Register the webb asset}`);
    // check if the webb asset is already with the same name.
    const maybeWebbAssetIdValue = await api.query.assetRegistry.assetIds(
      args.webbAssetName
    );
    const maybeWebbAssetId = createType(
      r,
      'Option<u32>',
      maybeWebbAssetIdValue
    );
    if (maybeWebbAssetId.isSome) {
      console.log(
        chalk`[x] {yellow Webb asset ${args.webbAssetName} is already registered}`
      );
    } else {
      const registerWebbAssetCall = await registerAsset(api, {
        name: args.webbAssetName,
        assetType: { kind: 'PoolShare', with: [0] },
        existentialDeposit: 10 * 10 ** 13,
      });
      calls.push(registerWebbAssetCall);
      console.log(chalk`[+] {green ${args.webbAssetName} registered}`);
      const nextAssetIdValue = await api.query.assetRegistry.nextAssetId();
      const nextAssetId = new u32(r, nextAssetIdValue).addn(1);
      const updateWebbAssetMetadataCall = await setAssetMetadata(api, {
        assetId: nextAssetId.toNumber(),
        symbol: args.webbAssetSymbol,
        decimals: args.webbAssetDecimals,
      });
      calls.push(updateWebbAssetMetadataCall);

      console.log(
        chalk`[+] {green ${args.webbAssetSymbol} (Asset: ${nextAssetId}) metadata updated}`
      );
    }
  }

  const updateNativeAssetMetadataCall = await setAssetMetadata(api, {
    assetId: 0,
    symbol: args.nativeAssetSymbol,
    decimals: args.nativeAssetDecimals,
  });
  calls.push(updateNativeAssetMetadataCall);

  console.log(chalk`[+] {green Native asset metadata updated}`);

  if (args.createVAnchor) {
    let vAnchorAssetId: number;
    console.log(chalk`=> {bold Create a VAnchor}`);
    // check if the webb asset is already with the same name.
    const maybeWebbAssetIdValue = await api.query.assetRegistry.assetIds(
      args.webbAssetName
    );
    const maybeWebbAssetId = createType(
      r,
      'Option<u32>',
      maybeWebbAssetIdValue
    );

    if (maybeWebbAssetId.isSome) {
      vAnchorAssetId = maybeWebbAssetId.unwrap().toNumber();
      console.log(
        chalk`[x] {blue Found a Webb asset with name ${args.webbAssetName} is already registered}`
      );
    } else {
      const nextAssetIdValue = await api.query.assetRegistry.nextAssetId();
      const nextAssetId = new u32(r, nextAssetIdValue).addn(1);
      vAnchorAssetId = nextAssetId.toNumber();
    }
    const nextTreeIdValue = await api.query.merkleTreeBn254.nextTreeId();
    const nextTreeId = new u32(r, nextTreeIdValue).addn(1);

    const createVAnchorCall = await createVAnchor(api, {
      maxEdges: args.maxEdges,
      depth: args.depth,
      assetId: vAnchorAssetId,
    });
    calls.push(createVAnchorCall);

    console.log(
      chalk`[+] {green VAnchor (Id: ${nextTreeId}) with Asset: ${vAnchorAssetId} created }`
    );
  }

  // transfer some funds to the proposers
  console.log(chalk`=> {bold Transferring funds to proposers}`);
  for (const v of proposers) {
    const x = 10n ** 18n;
    const amount = 1000n * x;
    const tx = await balanceForceTransferFrom(api, {
      from: sudo.address,
      to: v.toString(),
      amount: new u128(r, amount),
    });
    calls.push(tx);
    console.log(
      chalk`[+] {green ${v.toString()} received ${amount / x} tokens}`
    );
  }

  console.log(chalk`=> {bold Execute the batch call}`);
  const batchCall = api.tx.utility.batchAll(calls);
  await callAsSudo(api, batchCall, sudo);

  console.log(chalk`=> {green.bold Batch call executed!!}`);

  await api.disconnect();
  console.log(chalk`{bold.green Done!}`);
}

// *** MAIN ***
async function main() {
  const args = await parseArgs(hideBin(process.argv));
  // Load the environment variables
  dotenv.config({
    path: path.resolve(dirname, '../.env'),
  });
  await configureTangle(args);
  // Exit the script
  exit(0);
}

if (env.NODE_ENV !== 'test') {
  main();
}
