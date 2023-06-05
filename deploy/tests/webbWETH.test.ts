import { env } from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as dotenv from 'dotenv';
import Chai, { expect } from 'chai';
import ChaiAsPromised from 'chai-as-promised';
import { type Deployment, deployWithArgs } from '../main.js';
import { VAnchor } from '@webb-tools/anchors';
import { SignatureBridge__factory as SignatureBridgeFactory } from '@webb-tools/contracts';
import { FungibleTokenWrapper__factory as FungibleTokenWrapperFactory } from '@webb-tools/contracts';
import { ethers } from 'ethers';
import isCI from 'is-ci';
import { fetchComponentsFromFilePaths, hexToU8a } from '@webb-tools/utils';
import {
  ChainType,
  CircomUtxo,
  Keypair,
  calculateTypedChainId,
} from '@webb-tools/sdk-core';

Chai.use(ChaiAsPromised);

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('webbWETH', async () => {
  let webbWETH: Deployment;
  let providers: ethers.providers.JsonRpcProvider[];
  let vault: ethers.Wallet;

  const zeroTokenAddress = '0x0000000000000000000000000000000000000000';

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

  it('should be able to deposit', async () => {
    const provider = providers[0];
    const vaultSender = vault.connect(provider);
    const testAccount = ethers.Wallet.createRandom().connect(provider);
    const tx1 = await vaultSender.sendTransaction({
      to: testAccount.address,
      value: ethers.utils.parseEther('1'),
    });
    await tx1.wait();
    const myBalance = await provider.getBalance(testAccount.address);
    expect(myBalance.toBigInt()).to.equal(
      ethers.utils.parseEther('1').toBigInt()
    );

    const zkComponentsSmall = await fetchComponentsFromFilePaths(
      path.resolve(
        dirname,
        '../fixtures/solidity-fixtures/vanchor_2/8/poseidon_vanchor_2_8.wasm'
      ),
      path.resolve(
        dirname,
        '../fixtures/solidity-fixtures/vanchor_2/8/witness_calculator.cjs'
      ),
      path.resolve(
        dirname,
        '../fixtures/solidity-fixtures/vanchor_2/8/circuit_final.zkey'
      )
    );

    const zkComponentsLarge = await fetchComponentsFromFilePaths(
      path.resolve(
        dirname,
        '../fixtures/solidity-fixtures/vanchor_16/8/poseidon_vanchor_16_8.wasm'
      ),
      path.resolve(
        dirname,
        '../fixtures/solidity-fixtures/vanchor_16/8/witness_calculator.cjs'
      ),
      path.resolve(
        dirname,
        '../fixtures/solidity-fixtures/vanchor_16/8/circuit_final.zkey'
      )
    );
    const vanchor = await VAnchor.connect(
      webbWETH.anchorAddress,
      zkComponentsSmall,
      zkComponentsLarge,
      testAccount
    );

    const originChainId = calculateTypedChainId(
      ChainType.EVM,
      providers[0].network.chainId
    );
    const chainId = calculateTypedChainId(
      ChainType.EVM,
      providers[1].network.chainId
    );
    const depositUtxo = await CircomUtxo.generateUtxo({
      curve: 'Bn254',
      backend: 'Circom',
      amount: ethers.utils.parseEther('0.1').toHexString(),
      originChainId: originChainId.toString(),
      chainId: chainId.toString(),
      keypair: new Keypair(),
    });

    const leaves = vanchor.tree
      .elements()
      .map((el) => hexToU8a(el.toHexString()));

    const res = await vanchor.transact(
      [],
      [depositUtxo],
      0,
      0,
      '0',
      '0',
      zeroTokenAddress,
      {
        [originChainId]: leaves,
      }
    );
    expect(res.status).to.equal(1);
  });
});
