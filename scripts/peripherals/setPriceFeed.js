const { deployContract, contractAt, sendTxn, getFrameSigner } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

async function getArbValues() {
  const vault = await contractAt("Vault", "0x489ee077994B6658eAfA855C308275EAd8097C4A")
  const nextPriceFeed = await contractAt("VaultPriceFeed", "0x2d68011bcA022ed0E474264145F46CC4de96a002")
  return { vault, nextPriceFeed }
}

async function getAvaxValues() {
  const vault = await contractAt("Vault", "0x9ab2De34A33fB459b538c43f251eB825645e8595")
  const nextPriceFeed = await contractAt("VaultPriceFeed", "0x27e99387af40e5CA9CE21418552f15F02C8C57E7")
  return { vault, nextPriceFeed }
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

  const { vault, nextPriceFeed } = await getValues(signer)
  const timelock = await contractAt("Timelock", await vault.gov(), signer)
  const prevPriceFeed = await contractAt("VaultPriceFeed", await vault.priceFeed())

  // basic check to verify that the contract is a VaultPriceFeed contract
  if ((await prevPriceFeed.isSecondaryPriceEnabled()) !== true) {
    throw new Error("Invalid prevPriceFeed")
  }

  // basic check to verify that the contract is a VaultPriceFeed contract
  if ((await nextPriceFeed.isSecondaryPriceEnabled()) !== true) {
    throw new Error("Invalid nextPriceFeed")
  }

  await sendTxn(timelock.signalSetPriceFeed(vault.address, nextPriceFeed.address), "timelock.signalSetPriceFeed(nextPriceFeed)")
  await sendTxn(timelock.signalSetPriceFeed(vault.address, prevPriceFeed.address), "timelock.signalSetPriceFeed(prevPriceFeed)")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
