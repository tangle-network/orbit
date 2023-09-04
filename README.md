<div align="center">
<a href="https://www.webb.tools/">
    
![Webb Logo](./assets/webb_banner_light.png#gh-light-mode-only)
![Webb Logo](./assets/webb_banner_dark.png#gh-dark-mode-only)
  </a>
  </div>
<h1 align="left"> 🛰️ 🕸️ Webb Orbit 🕸️ 🛰️ </h1>
<p align="left">
    <strong>🚀 A Set of EVM Testnet(s) </strong>
</p>

<div align="left" >

[![CI](https://github.com/webb-tools/orbit/actions/workflows/ci.yml/badge.svg)](https://github.com/webb-tools/orbit/actions/workflows/ci.yml)
[![License Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg?style=flat-square)](https://opensource.org/licenses/Apache-2.0)
[![Twitter](https://img.shields.io/twitter/follow/webbprotocol.svg?style=flat-square&label=Twitter&color=1DA1F2)](https://twitter.com/webbprotocol)
[![Telegram](https://img.shields.io/badge/Telegram-gray?logo=telegram)](https://t.me/webbprotocol)
[![Discord](https://img.shields.io/discord/833784453251596298.svg?style=flat-square&label=Discord&logo=discord)](https://discord.gg/cv8EfJu3Tn)

</div>

<!-- TABLE OF CONTENTS -->
<h2 id="table-of-contents"> 📖 Table of Contents</h2>

<details open="open">
  <summary>Table of Contents</summary>
  <ul>
    <li><a href="#start"> Getting Started</a></li>
    <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#install">Installation</a></li>
    </ul>
    <li><a href="#usage">Usage</a></li>
    <ul>
        <li><a href="#launch">Run Local</a></li>
        <li><a href="#deploy">Deploy</a></li>
    </ul>
    <li><a href="#contribute">Contributing</a></li>
    <li><a href="#license">License</a></li>
  </ul>  
</details>

<h1 id="start"> Getting Started  🎉 </h1>

Webb Orbit is a set of Isolated EVM Testnets used for our internal testing and development. Internally it runs
a geth instance with a few tweaks to make it more suitable for our needs.

As of now, we have these testnets running:

| Testnet   | Chain Id   | Currency symbol | RPC                                  | Explorer                              |
| --------- | ---------- | --------------- | ------------------------------------ | ------------------------------------- |
| `Athena`  | 3884533461 | ETH             | `https://athena-testnet.webb.tools`  | `https://athena-explorer.webb.tools`  |
| `Hermes`  | 3884533462 | ETH             | `https://hermes-testnet.webb.tools`  | `https://hermes-explorer.webb.tools`  |
| `Demeter` | 3884533463 | ETH             | `https://demeter-testnet.webb.tools` | `https://demeter-explorer.webb.tools` |

Need help adding these networks to your wallet like MetaMask? [Read Here](https://support.metamask.io/hc/en-us/articles/360043227612-How-to-add-a-custom-network-RPC#h_01G63GGJ83DGDRCS2ZWXM37CV5)

## Prerequisites

- Docker: https://docs.docker.com/get-docker/
- Nodejs: https://nodejs.org/en/download/
- Yarn: https://classic.yarnpkg.com/en/docs/install

## Installation 💻

<h1 id="usage"> Usage </h1>

<h2 style="border-bottom:none"> Quick Start ⚡ </h2>

After installing the prerequisites, you can run the following command to start the testnet:

```bash
cp .env.example .env
# Fetch the zk fixtures
./scripts/fetch-fixtures.sh
```

Open the `.env` file in your editor and change what it is needed, usually they are the first section of the file.

Once done you can run the following command:

```bash
source .env # This will load the environment variables
./scripts/setup-orbit.sh # This will setup the orbit chains for you
```
Next, simply run the following command to start the chains:

```bash
docker compose up
```

You can now access the deployed chains, locally under `http://localhost:${PORT}` where `$PORT` depends on the chain, for example
Athena chain is running under `$ATHENA_CHAIN_PORT` port, revisit your `.env` file to get your configured ports.

## Deploy Block Explorers

To deploy the Block Explorers locally too, or on the server, you need to include the `explorers.yml` file, run the following:

```bash
docker compose -f docker-compose.yml -f explorers.yml up -d
```

This will deploy the block explorer for each chain, which you can access on localhost `http://localhost:${PORT}`where the `$PORT` here depends on which
chain's explorer you are trying to visit, for example Athena chain explorer running under `http://localhost:${ATHENA_CHAIN_EXPLORER_PORT}`.

## Deploying the smart contracts

To deploy the smart contracts, you can run the following command:

```bash
cd deploy && yarn
```

As a quick overview of all options you can run the following command:

```bash
yarn deploy --help
```

You should see something like the following:

```bash
Options:
Options:
  --help                      Show help                                [boolean]
  --version                   Show version number                      [boolean]
  --wethAddress               The address of the WETH contract          [string]
  --deployWeth                Whether to deploy WETH   [boolean] [default: true]
  --webbTokenName             The name of the webb token
                                        [string] [default: "Webb Wrapped Ether"]
  --webbTokenSymbol           The symbol of the webb token
                                                  [string] [default: "webbWETH"]
  --allowWrappingNativeToken  Whether to allow wrapping native tokens into webb
                              tokens                   [boolean] [default: true]
  --governor                  The Signature Bridge governor. Could be ETH addres
                              s, Uncompressed or Compressed Public Key  [string]
  --governorNonce             The nonce of the governor    [number] [default: 0]
  --deployMulticall3          Whether to deploy Multicall3 contract
                                                       [boolean] [default: true]
  --includeTangleEVM          Include tangle EVM chain[boolean] [default: false]
```

And here is an example of deploying a local bridge named webbWETH Bridge.

```bash
yarn deploy --deployWeth --allowWrappingNativeToken=false --webbTokenName webbWETH --webbTokenSymbol webbWETH
```

This will deploy the smart contracts to the testnets.

### Transfer the Ownership of Existing Signature Bridge

There is a sub-command for transferring the ownership of the Bridge after the deployment.

```bash
yarn deploy transfer-ownership --contractAddress <CONTRACT> --governor <ADDRESS> --governorNonce 0
```

### Deploying on Tangle Network

If you want to utilize the Tangle Network and the DKG as a governor for the deployed bridge, you will need to configure the following:

- Whitelists ChainIds
- Set Resource Ids

These steps could be done manually or using the following command:

```bash
yarn tangle --help
```

You should see something like the following:

```bash
Options:
  --help                 Show help                                     [boolean]
  --version              Show version number                           [boolean]
  --wsEndpoint           The endpoint of the node
                                       [string] [default: "ws://127.0.0.1:9944"]
  --resourceIds          The resource ids                  [array] [default: []]
```

And here is an example of how you can use it:

```bash
yarn tangle --resourceIds 0x00000000000064ba293e654992a94f304b00e3ceb8fd0f7aa77301000000138a --resourceIds 0x00000000000064ba293e654992a94f304b00e3ceb8fd0f7aa773010000001389 --resourceIds 0x00000000000064ba293e654992a94f304b00e3ceb8fd0f7aa77301000000138b
```

This command will automatically do the above steps for you.

<h3 id="deploy"> Deploy with <a href="https://docker.com">Docker</a> ☄️</h3>

You can also deploy the testnets to a remote server using Docker. To do so, you can use the following command:

```bash
docker compose up -d
```

### Running with a Local Relayer

The Deployment script also generates `orbit.toml` file that could be used with the [webb relayer](https://github.com/webb-tools/relayer)
if you have it locally, you can also use it to connect to the running chains by running the following command:

```bash
webb-relayer -vvv --tmp -c ./config
```

### Running Webb Faucet

To run Webb faucet backend locally, you need first to edit `config/Rocket.toml` file's twitter section and then run the following command:

```bash
docker compose -f faucet.yml up -d
```

### Cleanup

To clean up everything and start over, you can executed the following commands:

```bash
docker compose down -v

sudo rm -rf {logs,data}
```

### Deploying Smart Contracts

For the already deployed smart contracts on the testnets, refer to the [DEPLOYMENTS.md](./DEPLOYMENTS.md) file.

otherwise, the process of deploying smart contracts on the deployed chains is the same as locally.

<h2 id="contribute"> Contributing </h2>

Interested in contributing to the Webb? Thank you so much for your interest! We are always appreciative for contributions from the open-source community!

If you have a contribution in mind, please check out our [Contribution Guide](./.github/CONTRIBUTING.md) for information on how to do so. We are excited for your first contribution!

<h2 id="license"> License </h2>

Licensed under <a href="LICENSE">Apache 2.0 license</a>.

Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in this crate by you, as defined in the Apache 2.0 license, shall be licensed as above, without any additional terms or conditions.
