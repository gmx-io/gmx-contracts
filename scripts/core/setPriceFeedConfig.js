const { getFrameSigner, deployContract, contractAt, sendTxn, readTmpAddresses, callWithRetries } = require("../shared/helpers")
const { bigNumberify, expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function getArbValues() {
  const vault = await contractAt("Vault", "0x489ee077994B6658eAfA855C308275EAd8097C4A")
  const vaultPriceFeed = await contractAt("VaultPriceFeed", await vault.priceFeed())
  // const vaultPriceFeed = await contractAt("VaultPriceFeed", "0xfe661cbf27Da0656B7A1151a761ff194849C387A")

  const { btc, eth, usdc, link, uni, usdt, mim, frax, dai } = tokens
  const fastPriceTokens = [btc, eth, link, uni]

  return { vaultPriceFeed, fastPriceTokens }
}

async function getAvaxValues() {
  const vault = await contractAt("Vault", "0x9ab2De34A33fB459b538c43f251eB825645e8595")
  const vaultPriceFeed = await contractAt("VaultPriceFeed", await vault.priceFeed())
  // const vaultPriceFeed = await contractAt("VaultPriceFeed", "0x205646B93B9D8070e15bc113449586875Ed7288E")

  const { avax, btc, btcb, eth, mim, usdce, usdc } = tokens
  const fastPriceTokens = [avax, btc, btcb, eth]

  return { vaultPriceFeed, fastPriceTokens }
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
  const { vaultPriceFeed, fastPriceTokens } = await getValues()
  const secondaryPriceFeed = await contractAt("FastPriceFeed", await vaultPriceFeed.secondaryPriceFeed())

  console.log("secondaryPriceFeed", secondaryPriceFeed.address)
  console.log("setMaxDeviationBasisPoints", 1000)
  console.log("setPriceDataInterval", 1 * 60)
  console.log("setMaxCumulativeDeltaDiffs")
  console.log("[", fastPriceTokens.map(t => `"${t.address}"`).join(",\n"), "]")
  console.log("[", fastPriceTokens.map(t => t.maxCumulativeDeltaDiff).join(",\n"), "]")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
