#!/bin/sh

# Usage: ./scripts/anvil.sh [CHAIN_ID]
# Default values are read from the env
ANVIL_CHAIN_ID=${CHAIN_ID:-5001}
ANVIL_MNEMONIC=${MNEMONIC:-"test test test test test test test test test test test junk"}

anvil \
  --chain-id=${ANVIL_CHAIN_ID} \
  --state=/data/state.bytes \
  --state-interval=60 \
  --mnemonic="${ANVIL_MNEMONIC}" \
  --balance=10000 \
  --gas-price=5000000000 \
  --steps-tracing \
  --host 0.0.0.0

