import Chai, { expect } from 'chai';
import ChaiAsPromised from 'chai-as-promised';
import * as dotenv from 'dotenv';
import { ethers } from 'ethers';
import isCI from 'is-ci';
import { env } from 'node:process';
import { deployWithArgs, type Deployment } from '../main.js';

Chai.use(ChaiAsPromised);

describe('multicall3', async () => {
  let deployment: Deployment;
  let providers: ethers.providers.JsonRpcProvider[];
  let vault: ethers.Wallet;

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

  before(async () => {
    dotenv.config({
      path: '../.env',
    });
    vault = ethers.Wallet.fromMnemonic(getVaultMnemonic());
    const domain = env.DOMAIN ?? 'localhost';
    const chainRpcUrls = isCI
      ? [
          `http://127.0.0.1:${env.ATHENA_CHAIN_PORT}`,
          `http://127.0.0.1:${env.HERMES_CHAIN_PORT}`,
          `http://127.0.0.1:${env.DEMETER_CHAIN_PORT}`,
        ]
      : [
          `https://athena-testnet.${domain}`,
          `https://hermes-testnet.${domain}`,
          `https://demeter-testnet.${domain}`,
        ];

    providers = chainRpcUrls.map(
      (url) => new ethers.providers.JsonRpcProvider(url)
    );

    const result = await deployWithArgs({
      wethAddress: '',
      deployWeth: true,
      allowWrappingNativeToken: true,
      webbTokenName: 'webbWETH',
      webbTokenSymbol: 'webbWETH',
      governor:
        '0x0277c66266b89414906b425c1d1089a448f506299444de64ea86c385ac2b78ff6e',
      governorNonce: 1,
      deployMulticall3: true,
    });
    if (result.kind === 'Err') {
      expect.fail(result.error);
    } else {
      deployment = result.deployment;
    }
  });

  it('should deploy', async () => {
    expect(deployment).to.exist;
    expect(deployment.multicall3Address).to.exist;
  });
});
