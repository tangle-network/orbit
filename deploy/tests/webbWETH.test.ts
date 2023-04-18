import * as dotenv from 'dotenv';
import Chai, { expect } from 'chai';
import ChaiAsPromised from 'chai-as-promised';
import { Deployment, deployWithArgs } from '../main.js';
import { FungibleTokenWrapper__factory as FungibleTokenWrapperFactory } from '@webb-tools/contracts';
import { ethers } from 'ethers';

Chai.use(ChaiAsPromised);

describe('webbWETH', async () => {
  let webbWETH: Deployment;
  let providers: ethers.providers.JsonRpcProvider[];

  before(async () => {
    dotenv.config({
      path: '../.env',
    });
    const domain = process.env.DOMAIN ?? 'localhost';
    // NOTE: We can add more chains here as needed
    const chainRpcUrls = [
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
});
