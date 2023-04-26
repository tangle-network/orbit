import { env } from 'node:process';
import * as dotenv from 'dotenv';
import Chai, { expect } from 'chai';
import ChaiAsPromised from 'chai-as-promised';
import { Deployment, deployWithArgs } from '../main.js';
import { FungibleTokenWrapper__factory as FungibleTokenWrapperFactory } from '@webb-tools/contracts';
import { ethers } from 'ethers';
import isCI from 'is-ci';
import { SignatureBridge__factory as SignatureBridgeFactory } from '@webb-tools/contracts';

Chai.use(ChaiAsPromised);

describe('webbWETH', async () => {
  let webbWETH: Deployment;
  let providers: ethers.providers.JsonRpcProvider[];

  before(async () => {
    dotenv.config({
      path: '../.env',
    });
    const domain = env.DOMAIN ?? 'localhost';
    const chainRpcUrls = isCI
      ? [
          `http://127.0.0.1:${env.ATHENA_CHAIN_ID}`,
          `http://127.0.0.1:${env.HERMES_CHAIN_ID}`,
          `http://127.0.0.1:${env.DEMETER_CHAIN_ID}`,
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
    });
    if (result.kind === 'Err') {
      expect.fail(result.error);
    } else {
      webbWETH = result.deployment;
    }
  });

  it('should deploy', async () => {
    expect(webbWETH).to.exist;
  });

  it('should have a name', async () => {
    for (const provider of providers) {
      const webbToken = FungibleTokenWrapperFactory.connect(
        webbWETH.webbTokenAddress,
        provider
      );
      const name = await webbToken.name();
      const symbol = await webbToken.symbol();
      expect(name).to.equal('webbWETH');
      expect(symbol).to.equal('webbWETH');
    }
  });

  it('should transfer the ownership to the DKG', async () => {
    for (const provider of providers) {
      const sigBridge = SignatureBridgeFactory.connect(
        webbWETH.bridgeAddress,
        provider
      );
      const governor = await sigBridge.governor();
      expect(governor).to.equal('0x4EA8165A3Ebcb34d09a7E986e3FC77eB5Cfa2B02');
      const nonce = await sigBridge.refreshNonce();
      expect(nonce).to.equal(1);
    }
  });
});
