const { getFrameSigner, deployContract, contractAt , sendTxn, readTmpAddresses, writeTmpAddresses } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

// TODO: update tokenManager
async function deployPriceFeedArb() {
  const signer = await getFrameSigner()

  const timelock = { address: "0xAF2f95aA67476bFaFd8194e96B3b6dE77272ae2A" }
  const fastPriceFeedGov = { address: "0x49B373D422BdA4C6BfCdd5eC1E48A9a26fdA2F8b" }
  const fastPriceFeedAdmin = { address: "0x67F1B9E91D7bB46556ba013c1B187C461e2a1Ffd" }
  const signers = ["0x8A78BA7F6c187e381ffE9B6414FC11cebd5993c1"]
  const tokenManager = { address: "0x1EF8156b46e6f5A1973BfF4975177fd13275Ad59" }

  const fastPriceEvents = await contractAt("FastPriceEvents", "0x4530b7DE1958270A2376be192a24175D795e1b07", signer)

  const chainlinkFlags = { address: "0x3C14e07Edd0dC67442FA96f1Ec6999c57E810a83" }
  const secondaryPriceFeed = await deployContract("FastPriceFeed", [
    5 * 60, // _priceDuration
    250, // _maxDeviationBasisPoints
    fastPriceEvents.address, // _fastPriceEvents
    fastPriceFeedAdmin.address, // _admin
    tokenManager.address // _tokenManager
  ])
  await sendTxn(secondaryPriceFeed.initialize(1, signers), "secondaryPriceFeed.initialize")

  await sendTxn(fastPriceEvents.setIsPriceFeed(secondaryPriceFeed.address, true), "fastPriceEvents.setIsPriceFeed")

  const vaultPriceFeed = await deployContract("VaultPriceFeed", [])

  await sendTxn(vaultPriceFeed.setMaxStrictPriceDeviation(expandDecimals(5, 28)), "vaultPriceFeed.setMaxStrictPriceDeviation") // 0.05 USD
  await sendTxn(vaultPriceFeed.setPriceSampleSpace(1), "vaultPriceFeed.setPriceSampleSpace")
  await sendTxn(vaultPriceFeed.setSecondaryPriceFeed(secondaryPriceFeed.address), "vaultPriceFeed.setSecondaryPriceFeed")
  await sendTxn(vaultPriceFeed.setIsAmmEnabled(false), "vaultPriceFeed.setIsAmmEnabled")
  await sendTxn(vaultPriceFeed.setChainlinkFlags(chainlinkFlags.address), "vaultPriceFeed.setChainlinkFlags")

  const { btc, eth, usdc, link, uni, usdt, mim, frax, dai } = tokens
  const tokenArr = [btc, eth, usdc, link, uni, usdt, mim, frax, dai]
  const fastPriceTokens = [btc, eth, link, uni]
  if (fastPriceTokens.find(t => !t.fastPricePrecision)) {
    throw new Error("Invalid price precision")
  }

  for (const token of tokenArr) {
    await sendTxn(vaultPriceFeed.setTokenConfig(
      token.address, // _token
      token.priceFeed, // _priceFeed
      token.priceDecimals, // _priceDecimals
      token.isStrictStable // _isStrictStable
    ), `vaultPriceFeed.setTokenConfig(${token.name}) ${token.address} ${token.priceFeed}`)
  }

  await sendTxn(vaultPriceFeed.setGov(timelock.address), "vaultPriceFeed.setGov")
  await sendTxn(secondaryPriceFeed.setTokens(fastPriceTokens.map(t => t.address), fastPriceTokens.map(t => t.fastPricePrecision)), "secondaryPriceFeed.setTokens")
  await sendTxn(secondaryPriceFeed.setGov(fastPriceFeedGov.address), "secondaryPriceFeed.setGov")
}

async function deployPriceFeedAvax() {
  const { avax, btc, eth } = tokens
  // const tokenArr = []
  const fastPriceTokens = [avax, btc, eth]
  if (fastPriceTokens.find(t => !t.fastPricePrecision)) {
    throw new Error("Invalid price precision")
  }

  // const timelock = { address: "0xAF2f95aA67476bFaFd8194e96B3b6dE77272ae2A" }
  // const fastPriceFeedGov = { address: "0x49B373D422BdA4C6BfCdd5eC1E48A9a26fdA2F8b" }
  const fastPriceFeedAdmin = { address: "0xB6A92Ae811B6A3530b4C01a78651ad295D9570d4" }
  const signers = ["0x1D6d107F5960A66f293Ac07EDd08c1ffE79B548a"]
  const tokenManager = { address: "0x7F98d265Ba2609c1534D12cF6b0976505Ad7F653" }

  const fastPriceEvents = await deployContract("FastPriceEvents", [])

  const secondaryPriceFeed = await deployContract("FastPriceFeed", [
    5 * 60, // _priceDuration
    1, // _minBlockInterval
    250, // _maxDeviationBasisPoints
    fastPriceEvents.address, // _fastPriceEvents
    fastPriceFeedAdmin.address, // _admin
    tokenManager.address // _tokenManager
  ])
  await sendTxn(secondaryPriceFeed.initialize(1, signers), "secondaryPriceFeed.initialize")

  await sendTxn(fastPriceEvents.setIsPriceFeed(secondaryPriceFeed.address, true), "fastPriceEvents.setIsPriceFeed")

  const vaultPriceFeed = await contractAt("VaultPriceFeed", "0x131238112aa25c0D8CD237a6c384d1A86D2BB152")
  await sendTxn(vaultPriceFeed.setSecondaryPriceFeed(secondaryPriceFeed.address), "vaultPriceFeed.setSecondaryPriceFeed")

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

async function deployPriceFeedBsc() {
  const signers = ["0xFb11f15f206bdA02c224EDC744b0E50E46137046"]
  const fastPriceFeedGov = { address: "0x4180518618F6FAA25AFf275865523470f0fa5024" }

  const secondaryPriceFeed = await deployContract("FastPriceFeed", [5 * 60, 250])
  await sendTxn(secondaryPriceFeed.initialize(1, signers), "secondaryPriceFeed.initialize")

  const vaultPriceFeed = await deployContract("VaultPriceFeed", [])

  await sendTxn(vaultPriceFeed.setMaxStrictPriceDeviation(expandDecimals(5, 28)), "vaultPriceFeed.setMaxStrictPriceDeviation") // 0.05 USD
  await sendTxn(vaultPriceFeed.setPriceSampleSpace(1), "vaultPriceFeed.setPriceSampleSpace")
  await sendTxn(vaultPriceFeed.setSecondaryPriceFeed(secondaryPriceFeed.address), "vaultPriceFeed.setSecondaryPriceFeed")
  await sendTxn(vaultPriceFeed.setIsAmmEnabled(false), "vaultPriceFeed.setIsAmmEnabled")

  const { btc, eth, bnb, busd, usdc, usdt } = tokens
  const tokenArr = [btc, eth, bnb, busd, usdc, usdt]

  for (const token of tokenArr) {
    await sendTxn(vaultPriceFeed.setTokenConfig(
      token.address, // _token
      token.priceFeed, // _priceFeed
      token.priceDecimals, // _priceDecimals
      token.isStrictStable // _isStrictStable
    ), `vaultPriceFeed.setTokenConfig(${token.name}) ${token.address} ${token.priceFeed}`)
  }

  await sendTxn(secondaryPriceFeed.setTokens([btc.address, eth.address, bnb.address]), "secondaryPriceFeed.setTokens")
  await sendTxn(secondaryPriceFeed.setGov(fastPriceFeedGov.address), "secondaryPriceFeed.setGov")
}

async function main() {
  if (network === "bsc") {
    await deployPriceFeedBsc()
    return
  }

  if (network === "avax") {
    await deployPriceFeedAvax()
    return
  }

  await deployPriceFeedArb()
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
