import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

import { Contract, ethers } from 'ethers';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export async function deployMulticall3(
  deployer: ethers.Wallet
): Promise<Contract> {
  const jsonPath = path.join(dirname, 'contracts', 'Multicall3.json');
  const metadataString = fs.readFileSync(jsonPath, 'utf8');

  const metadata = JSON.parse(metadataString);
  const Multicall3Factory = new ethers.ContractFactory(
    metadata.abi,
    metadata.bytecode,
    deployer
  );

  const multicall3 = await Multicall3Factory.deploy();
  const contract = await multicall3.deployed();
  return contract;
}
