const { contractAt } = require("../shared/helpers")
const { createSafeClient } = require("@safe-global/sdk-starter-kit")
const { proposeSafeTransaction } = require("../shared/safeHelpers")
const SafeApiKit = require("@safe-global/api-kit").default

const hre = require("hardhat");
const network = hre.network.name;
const tokens = require('../core/tokens')[network];

async function getArbValues() {
  const vault = await contractAt("Vault", "0x489ee077994B6658eAfA855C308275EAd8097C4A")
  const timelock = await contractAt("Timelock", "0x718507c37AA801A4b37aAE70dF8B2cB0bd4674b5")
  return { vault, timelock }
}

async function getAvaxValues() {
  const vault = await contractAt("Vault", "0x9ab2De34A33fB459b538c43f251eB825645e8595")
  const timelock = await contractAt("Timelock", "0xe089F0eDc8efB1172Dae20CEa041eB4B9dc7d468")
  return { vault, timelock }
}

async function getValues() {
  if (network === "arbitrum") {
    return getArbValues()
  }

  if (network === "avax") {
    return getAvaxValues()
  }
}

async function main() {
  console.log(network);
  const { vault, timelock } = await getValues()

  const rawTx = await timelock.populateTransaction.signalRemoveTokenFromWhitelist(vault.address, tokens.mim.address)
  console.log(rawTx);
}

async function useSafe() {
  const signerPK = process.env.SIGNER_KEY;
  const safeApiKey = process.env.SAFE_API_KEY;

  const { vault, timelock } = await getValues()
  const rawTx = await timelock.populateTransaction.signalRemoveTokenFromWhitelist(vault.address, tokens.mim.address)

  const safeClient = await createSafeClient({
    provider: hre.network.config.url,
    signer: signerPK,
    safeAddress: '0x58F582455b54d7c83d03BCeed95FAf72B37fdDD7',
    apiKey: safeApiKey
  })

  const transactions = [{
    to: rawTx.to,
    data: rawTx.data,
    value: '0',
  }]

  const nonce = process.env.SAFE_NONCE ? parseInt(process.env.SAFE_NONCE, 10) : undefined

  const { safeTxHash, nonce: usedNonce } = await proposeSafeTransaction(safeClient, {
    transactions,
    nonce,
  })

  console.log(`Tx proposed with nonce ${usedNonce}, hash: ${safeTxHash}`);
}
//
// async function createSafeApiKit() {
//   const apiKit = new SafeApiKit({
//     chainId: 43114n,
//     apiKey: process.env.SAFE_API_KEY
//   })
//
//   const safeTransactionData  = {
//     to: '0xe089F0eDc8efB1172Dae20CEa041eB4B9dc7d468',
//     value: '0',
//     data: '0xd5c2c8b60000000000000000000000009ab2de34a33fb459b538c43f251eb825645e8595000000000000000000000000130966628846bfd36ff31a822705796e8cb8c18d',
//     operation: 0, // 0 = call, 1 = delegate call
//     nonce: '15'
//   }
//
//   const proposeTransactionProps = {
//     safeAddress: '0x58F582455b54d7c83d03BCeed95FAf72B37fdDD7',
//     safeTransactionData,
//     senderAddress: '0xeAA5600595a64a23480b2DF5FCA35A2867c912Ea',
//     senderSignature: process.env.SIGNER_KEY
//   }
//
//   const r = await apiKit.proposeTransaction(proposeTransactionProps)
//   console.log(r);
// }

useSafe()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
