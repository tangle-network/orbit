import '@webb-tools/tangle-substrate-types';

import { ApiPromise, WsProvider, Keyring } from '@polkadot/api';
import { env, exit } from 'node:process';
import path from 'node:path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import * as dotenv from 'dotenv';
import { u8aToHex, hexToU8a } from '@polkadot/util';
import type { KeyringPair } from '@polkadot/keyring/types';
import type { SubmittableExtrinsic } from '@polkadot/api/types';
import { ResourceId } from '@webb-tools/proposals';
import { type TypedChainId } from '@webb-tools/utils';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';

const dirname = path.dirname(fileURLToPath(import.meta.url));

async function whitelistChain(
  api: ApiPromise,
  args: {
    typedChainId: TypedChainId;
  }
): Promise<SubmittableExtrinsic<'promise'>> {
  return api.tx.dkgProposals.whitelistChain({
    Evm: args.typedChainId.chainId,
  });
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

  const keyring = new Keyring({ type: 'sr25519' });
  const sudo = keyring.addFromUri(getSudoSuri());
  const calls: SubmittableExtrinsic<'promise'>[] = [];

  const resourceIds = args.resourceIds.map((v) =>
    ResourceId.fromBytes(hexToU8a(v))
  );
  const typedChainIds = resourceIds.map((v) => ({
    chainType: v.chainType,
    chainId: v.chainId,
  }));

  console.log(chalk`=> {green.bold Whitelist the chain ids}`);
  const chainIdsSet = new Set<number>();
  for (const v of typedChainIds) {
    const maybeNonce = await api.query.dkgProposals.chainNonces({
      Evm: v.chainId,
    });
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
    const maybeResourceId = await api.query.dkgProposals.resources(vhex);
    if (maybeResourceId.isSome) {
      console.log(chalk`[x] {yellow Resource ${vhex} is already registered}`);
    } else {
      const call = await setResource(api, { resourceId: v });
      calls.push(call);
      console.log(chalk`[+] {green Resource ${v.toString()} registered}`);
    }
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
