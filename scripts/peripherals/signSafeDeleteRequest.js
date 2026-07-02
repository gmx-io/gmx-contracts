const { ArgumentParser } = require("argparse");
const { ethers } = require("ethers");
const hre = require("hardhat");

const {
  ARBITRUM_DEPLOY_KEY,
  AVAX_DEPLOY_KEY,
  MAINNET_DEPLOY_KEY,
} = require("../../env.json");

const DEPLOY_KEYS = {
  arbitrum: ARBITRUM_DEPLOY_KEY,
  avax: AVAX_DEPLOY_KEY,
  mainnet: MAINNET_DEPLOY_KEY,
};

function getTotp(unixSeconds) {
  const timestamp = unixSeconds !== undefined
    ? unixSeconds
    : Math.floor(Date.now() / 1000);
  return Math.floor(timestamp / 3600);
}

function buildDeleteRequestTypedData({ chainId, safeAddress, safeTxHash, totp }) {
  return {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      DeleteRequest: [
        { name: "safeTxHash", type: "bytes32" },
        { name: "totp", type: "uint256" },
      ],
    },
    primaryType: "DeleteRequest",
    domain: {
      name: "Safe Transaction Service",
      version: "1.0",
      chainId,
      verifyingContract: safeAddress,
    },
    message: {
      safeTxHash,
      totp,
    },
  };
}

function getSignerPrivateKey(network) {
  if (process.env.SIGNER_KEY) {
    return process.env.SIGNER_KEY;
  }

  const deployKey = DEPLOY_KEYS[network];
  if (!deployKey) {
    throw new Error(
      `No signer key found. Set SIGNER_KEY or use a supported network deploy key (${Object.keys(DEPLOY_KEYS).join(", ")})`
    );
  }

  return deployKey;
}

async function signDeleteRequest({
  chainId,
  safeAddress,
  safeTxHash,
  totp,
  privateKey,
}) {
  const typedData = buildDeleteRequestTypedData({
    chainId,
    safeAddress,
    safeTxHash,
    totp,
  });

  const signer = new ethers.Wallet(privateKey);
  const signature = await signer._signTypedData(
    typedData.domain,
    { DeleteRequest: typedData.types.DeleteRequest },
    typedData.message
  );

  const recoveredAddress = ethers.utils.verifyTypedData(
    typedData.domain,
    { DeleteRequest: typedData.types.DeleteRequest },
    typedData.message,
    signature
  );

  if (recoveredAddress.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error("Signature verification failed");
  }

  return {
    typedData,
    signature,
    signer: signer.address,
    totp,
  };
}

function getArg(name, envName) {
  if (process.env[envName]) {
    return process.env[envName];
  }

  return undefined;
}

async function main() {
  const parser = new ArgumentParser({
    description: "Sign a Safe Transaction Service DeleteRequest with an EOA",
  });
  parser.add_argument("--safe-tx-hash", {
    help: "Safe transaction hash (bytes32). Env: SAFE_TX_HASH",
    default: getArg("safe-tx-hash", "SAFE_TX_HASH"),
  });
  parser.add_argument("--safe-address", {
    help: "Safe address used as verifyingContract. Env: SAFE_ADDRESS",
    default: getArg("safe-address", "SAFE_ADDRESS"),
  });
  parser.add_argument("--chain-id", {
    help: "Chain ID (defaults to Hardhat network chainId). Env: CHAIN_ID",
    type: "int",
    default: process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID, 10) : undefined,
  });
  parser.add_argument("--totp", {
    help: "TOTP value (defaults to floor(unix_timestamp / 3600)). Env: TOTP",
    type: "int",
    default: process.env.TOTP ? parseInt(process.env.TOTP, 10) : undefined,
  });
  parser.add_argument("--unix-timestamp", {
    help: "Unix timestamp in seconds used to compute TOTP. Env: UNIX_TIMESTAMP",
    type: "int",
    default: process.env.UNIX_TIMESTAMP ? parseInt(process.env.UNIX_TIMESTAMP, 10) : undefined,
  });

  const args = parser.parse_args();
  const network = hre.network.name;
  const chainId = args.chain_id !== undefined ? args.chain_id : hre.network.config.chainId;

  if (!args.safe_tx_hash) {
    throw new Error("safe-tx-hash is required (pass --safe-tx-hash or set SAFE_TX_HASH)");
  }

  if (!args.safe_address) {
    throw new Error("safe-address is required (pass --safe-address or set SAFE_ADDRESS)");
  }

  if (!chainId) {
    throw new Error("Chain ID is required. Pass --chain-id, set CHAIN_ID, or run with --network");
  }

  const totp = args.totp !== undefined
    ? args.totp
    : getTotp(args.unix_timestamp !== undefined ? args.unix_timestamp : undefined);

  const privateKey = getSignerPrivateKey(network);
  const result = await signDeleteRequest({
    chainId,
    safeAddress: ethers.utils.getAddress(args.safe_address),
    safeTxHash: args.safe_tx_hash,
    totp,
    privateKey,
  });

  console.log(JSON.stringify({
    chainId,
    safeAddress: result.typedData.domain.verifyingContract,
    safeTxHash: result.typedData.message.safeTxHash,
    totp: result.totp,
    signer: result.signer,
    signature: result.signature,
    typedData: result.typedData,
  }, null, 2));
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  getTotp,
  buildDeleteRequestTypedData,
  signDeleteRequest,
};
