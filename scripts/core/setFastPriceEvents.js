const { getFrameSigner, deployContract, contractAt , sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")
const { errors } = require("../../test/core/Vault/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function getArbValues() {
  const vaultPriceFeed1 = await contractAt("VaultPriceFeed", "0xEFF37c0969DcBf69B0b142dAc4e56A0930AECBa8")
  const vaultPriceFeed2 = await contractAt("VaultPriceFeed", "0xa18BB1003686d0854EF989BB936211c59EB6e363")

  return { vaultPriceFeed1, vaultPriceFeed2 }
}

async function getAvaxValues() {
  const vaultPriceFeed1 = await contractAt("VaultPriceFeed", "0x131238112aa25c0D8CD237a6c384d1A86D2BB152")
  const vaultPriceFeed2 = await contractAt("VaultPriceFeed", "0x81b7e71A1D9E08a6Ca016A0F4D6Fa50DBCE89Ee3")

  return { vaultPriceFeed1, vaultPriceFeed2 }
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
  const signer = await getFrameSigner()

  const { vaultPriceFeed1, vaultPriceFeed2 } = await getValues(signer)
  const fastPriceFeed1 = await contractAt("FastPriceFeed", await vaultPriceFeed1.secondaryPriceFeed())
  const fastPriceFeed2 = await contractAt("FastPriceFeed", await vaultPriceFeed2.secondaryPriceFeed(), signer)
  const fastPriceEvents = await contractAt("FastPriceEvents", await fastPriceFeed1.fastPriceEvents(), signer)

  console.log("fastPriceEvents", fastPriceEvents.address)
  console.log("fastPriceFeed2", fastPriceFeed2.address)

  await sendTxn(fastPriceEvents.setIsPriceFeed(fastPriceFeed2.address, true), "fastPriceEvents.setIsPriceFeed")
  await sendTxn(fastPriceFeed2.setFastPriceEvents(fastPriceEvents.address), "fastPriceFeed2.setFastPriceEvents")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
