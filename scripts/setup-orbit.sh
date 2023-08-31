#!/bin/sh

# Overview:
# This script will call other commands to setup the environment for the orbit
# chains. It will do the following:
# 1. Minpulate the `genesis.json` file to include the correct chain-id for each chain using `jq`.
# 2. Create the required directories for each chain.
# 3. Initialize each chain with the correct genesis file using `geth init`.
# 4. Import the private keys for each validator using `geth account import`.
# 5. Create the password files for each validator using `echo` and saves it next to the node data.

# Usage:
# This script should be run from the root of the repository, e.g. `./scripts/setup-orbit.sh`.
# However, for convenience, you can also run it from the `scripts` directory, e.g. `./setup-orbit.sh`.
# and it should still work since we will change the working directory to the root of the repository.

set -e
# Exit immediately if a command exits with a non-zero status.
trap 'exit' ERR

# Retrieve the root directory of the repository.
ROOT_DIR=$(git rev-parse --show-toplevel)

# Load the environment variables from the `.env` file.
source $ROOT_DIR/.env

# Check the required tools are installed.
# jq is used to manipulate the genesis.json file.

if ! command -v jq &> /dev/null
then
    echo "jq could not be found"
    echo "Please install jq and try again"
    exit
fi


function required_arg() {
  if [ -z "$1" ]
  then
    echo "Missing required argument: $2"
    # Print a call stack trace of the last 10 commands
    caller 0 | sed -n '1!G;h;$p' | sed -n '1,10p'
    exit
  fi
}

# Wrapper around running geth, we will use docker to run geth.
# Parameters:
# $1: chain datadir (e.g. `data/x_chain`)
# $@: passed as-is to the geth command
function geth() {
  required_arg "$1" "chain-datadir"
  local chain_datadir=$1
  shift 1 # Remove the first arg $1 from the list of args $@
  docker run -t --rm -v $ROOT_DIR/$chain_datadir:/data ethereum/client-go:stable --datadir /data "$@"
}

# Extradata is the extra data field in the genesis file.
# It is a 32 byte of zeros followed by the 20 byte address of the validator then 65 bytes of zeros.
# Usage:
# mk_extradata <validator-address>
# Parameters:
# $1: validator-address (e.g. `0x7e5f4552091a69125d5dfcb7b8c2659029395bdf`)
# Returns:
# Extra data with correct format.
function mk_extradata() {
  required_arg "$1" "validator-address"
  local validator_address=$1
  local validator_address_hex=$(echo $validator_address | sed 's/^0x//')
  local extra_data=$(printf "0x%064s%s%0130s" "0" $validator_address_hex "0")
  echo $extra_data
}

# Generate the genesis file for each chain.
#
# Usage:
# mk_genesis <chain-id> <datadir>
# Parameters:
# $1: chain-id (e.g. `1`)
# $2: datadir (e.g. `data/x_chain`)
# Example:
# mk_genesis 1 data/x_chain
function mk_genesis() {
  required_arg "$1" "chain-id"
  required_arg "$2" "datadir"
  local chain_id=$1
  local datadir=$2
  local validator_address_hex=$(echo $VAULT_ACCOUNT_ADDRESS | sed 's/^0x//')
  local extra_data=$(mk_extradata $VAULT_ACCOUNT_ADDRESS)
  mkdir -p $ROOT_DIR/$datadir
  jq ".config.chainId |= $chain_id | .extraData |= \"$extra_data\" | .alloc.\"$validator_address_hex\".balance |= \"0x152d02c7e14af6800000\"" \
    $ROOT_DIR/config/genesis.json > $ROOT_DIR/$datadir/genesis.json
}

# Import the private key for each validator.
# Usage:
# import_private_key <chain-datadir>
# Parameters:
# $1: chain-datadir (e.g. `data/x_chain`)
# Example:
# import_private_key data/x_chain
function import_private_key() {
  required_arg "$1" "chain-datadir"
  local chain_datadir=$1
  local private_key=$(echo $VAULT_ACCOUNT_PRIVATE_KEY | sed 's/^0x//')
  local password=$VAULT_ACCOUNT_PASSWORD
  mkdir -p $ROOT_DIR/$chain_datadir
  echo $password > $ROOT_DIR/$chain_datadir/password.txt
  echo $private_key > $ROOT_DIR/$chain_datadir/private_key.txt
  geth $chain_datadir account import --password data/password.txt data/private_key.txt
  rm $ROOT_DIR/$chain_datadir/private_key.txt
}

# Initialize the chain with the correct genesis file.
# Usage:
# init_chain <chain-datadir>
# Parameters:
# $1: chain-datadir (e.g. `data/x_chain`)
function init_chain() {
  required_arg "$1" "chain-datadir"
  local chain_datadir=$1
  geth $chain_datadir init /data/genesis.json
}

####################

# Athena
mk_genesis $ATHENA_CHAIN_ID data/athena_chain
import_private_key data/athena_chain
init_chain data/athena_chain
# Hermes
mk_genesis $HERMES_CHAIN_ID data/hermes_chain
import_private_key data/hermes_chain
init_chain data/hermes_chain
# Demeter
mk_genesis $DEMETER_CHAIN_ID data/demeter_chain
import_private_key data/demeter_chain
init_chain data/demeter_chain

