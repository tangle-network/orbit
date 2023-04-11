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
a [ganache](https://trufflesuite.com/ganache/) instance with a few tweaks to make it more suitable for our needs.

As of now, we have these testnets running:

| Testnet   | RPC                                      | Explorer                                      |
| --------- | ---------------------------------------- | --------------------------------------------- |
| `Athena`  | `https://athena-testnet.webb.tools/rpc`  | `https://athena-testnet.webb.tools/explorer`  |
| `Hermes`  | `https://hermes-testnet.webb.tools/rpc`  | `https://hermes-testnet.webb.tools/explorer`  |
| `Demeter` | `https://demeter-testnet.webb.tools/rpc` | `https://demeter-testnet.webb.tools/explorer` |

## Prerequisites

Install Docker: https://docs.docker.com/get-docker/

## Installation 💻

<h1 id="usage"> Usage </h1>

<h2 style="border-bottom:none"> Quick Start ⚡ </h2>

After installing the prerequisites, you can run the following command to start the testnet:

```bash
cp .env.example .env
docker compose up
```

This will start the testnets locally and you can access them via the RPC endpoints listed below:

| Testnet   | RPC                     | Explorer                |
| --------- | ----------------------- | ----------------------- |
| `Athena`  | `http://localhost:5001` | `http://localhost:4001` |
| `Hermes`  | `http://localhost:5002` | `http://localhost:4002` |
| `Demeter` | `http://localhost:5003` | `http://localhost:4003` |

<h3 id="deploy"> Deploy with <a href="https://docker.com">Docker</a> ☄️</h3>

You can also deploy the testnets to a remote server using Docker. To do so, you can use the following command:

```bash
docker compose up -d
```

Then configure your reverse proxy to point to the RPC endpoints.

<h2 id="contribute"> Contributing </h2>

Interested in contributing to the Webb? Thank you so much for your interest! We are always appreciative for contributions from the open-source community!

If you have a contribution in mind, please check out our [Contribution Guide](./.github/CONTRIBUTING.md) for information on how to do so. We are excited for your first contribution!

<h2 id="license"> License </h2>

Licensed under <a href="LICENSE">Apache 2.0 license</a>.

Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in this crate by you, as defined in the Apache 2.0 license, shall be licensed as above, without any additional terms or conditions.
