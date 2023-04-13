import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

import { ethers } from 'ethers';
import chalk from 'chalk';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export async function deployWETH9(deployer: ethers.Wallet): Promise<string> {
  const jsonPath = path.join(dirname, 'contracts', 'WETH9.json');
  const metadataString = fs.readFileSync(jsonPath, 'utf8');
  const metadata = JSON.parse(metadataString);
  const WETH9Factory = new ethers.ContractFactory(
    metadata.abi,
    metadata.bytecode,
    deployer
  );
  const weth9 = await WETH9Factory.deploy();
  const contract = await weth9.deployed();
  const chainId = await deployer.getChainId();
  console.log(
    chalk.green(`WETH9 deployed to ${weth9.address} on chain ${chainId}`)
  );
  return contract.address;
}
