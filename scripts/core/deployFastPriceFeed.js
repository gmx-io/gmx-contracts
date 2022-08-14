const { getFrameSigner, deployContract, contractAt , sendTxn, readTmpAddresses, writeTmpAddresses } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

// TODO: call setSpreadBasisPoints for tokens
async function deployPriceFeedArbTestnet() {
  const { btc, eth, usdc, usdt } = tokens
  const tokenArr = [btc, eth, usdc, usdt]
  const fastPriceTokens = [btc, eth]
  if (fastPriceTokens.find(t => !t.fastPricePrecision)) {
    throw new Error("Invalid price precision")
  }

  const timelock = { address: "0x1e0FD2CC7329Ddf6bDA35f85579E1bC2996dB0d9" }
  const fastPriceFeedGov = { address: "0xFb11f15f206bdA02c224EDC744b0E50E46137046" }

  const updater1 = { address: "0xFb11f15f206bdA02c224EDC744b0E50E46137046" }
  const keeper1 = { address: "0xFb11f15f206bdA02c224EDC744b0E50E46137046" }
  const updaters = [updater1.address, keeper1.address]

  const signers = ["0xFb11f15f206bdA02c224EDC744b0E50E46137046"]
  const tokenManager = { address: "0x8226EC2c1926c9162b6F815153d10018A7ccdf07" }

  const positionRouter = await contractAt("PositionRouter", "0xB4bB78cd12B097603e2b55D2556c09C17a5815F8")

  const fastPriceEvents = await contractAt("FastPriceEvents", "0x260E3Aa495033B07439775a1232f989e79f9abD2")
  // const fastPriceEvents = await deployContract("FastPriceEvents", [])

  const secondaryPriceFeed = await contractAt("FastPriceFeed", "0xE3A717D9C08f17b59D242E36d7322f62F85A83aA")
  // const secondaryPriceFeed = await deployContract("FastPriceFeed", [
  //   5 * 60, // _priceDuration
  //   0, // _minBlockInterval
  //   250, // _maxDeviationBasisPoints
  //   fastPriceEvents.address, // _fastPriceEvents
  //   tokenManager.address, // _tokenManager
  //   positionRouter.address // _positionRouter
  // ])

  // await sendTxn(secondaryPriceFeed.initialize(1, signers, updaters), "secondaryPriceFeed.initialize")
  // await sendTxn(secondaryPriceFeed.setMaxTimeDeviation(60 * 60), "secondaryPriceFeed.setMaxTimeDeviation")

  // await sendTxn(positionRouter.setPositionKeeper(secondaryPriceFeed.address, true), "positionRouter.setPositionKeeper(secondaryPriceFeed)")

  // await sendTxn(fastPriceEvents.setIsPriceFeed(secondaryPriceFeed.address, true), "fastPriceEvents.setIsPriceFeed")

  // const vaultPriceFeed = await deployContract("VaultPriceFeed", [])
  const vaultPriceFeed = await contractAt("VaultPriceFeed", "0x95c648267229b27C74180C0c1f0FA94e49567ECB")

  // await sendTxn(vaultPriceFeed.setMaxStrictPriceDeviation(expandDecimals(5, 28)), "vaultPriceFeed.setMaxStrictPriceDeviation") // 0.05 USD
  // await sendTxn(vaultPriceFeed.setPriceSampleSpace(1), "vaultPriceFeed.setPriceSampleSpace")
  // await sendTxn(vaultPriceFeed.setSecondaryPriceFeed(secondaryPriceFeed.address), "vaultPriceFeed.setSecondaryPriceFeed")
  // await sendTxn(vaultPriceFeed.setIsAmmEnabled(false), "vaultPriceFeed.setIsAmmEnabled")

  // for (const token of tokenArr) {
  //   await sendTxn(vaultPriceFeed.setTokenConfig(
  //     token.address, // _token
  //     token.priceFeed, // _priceFeed
  //     token.priceDecimals, // _priceDecimals
  //     token.isStrictStable // _isStrictStable
  //   ), `vaultPriceFeed.setTokenConfig(${token.name}) ${token.address} ${token.priceFeed}`)
  // }

  // await sendTxn(vaultPriceFeed.setGov(timelock.address), "vaultPriceFeed.setGov")
  await sendTxn(secondaryPriceFeed.setTokens(fastPriceTokens.map(t => t.address), fastPriceTokens.map(t => t.fastPricePrecision)), "secondaryPriceFeed.setTokens")
  // await sendTxn(secondaryPriceFeed.setGov(fastPriceFeedGov.address), "secondaryPriceFeed.setGov")
}

async function main() {
  if (network === "arbitrumTestnet") {
    await deployPriceFeedArbTestnet()
    return
  }

  throw new Error("Unsupported network " + network)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
