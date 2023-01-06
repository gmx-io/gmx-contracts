const { getFrameSigner, deployContract, contractAt , sendTxn, readTmpAddresses, writeTmpAddresses } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function getBscValues(){
  const { btc, bnb, busd, eth} = tokens
  const tokenArr = [btc, bnb, busd, eth]
  const fastPriceTokens = []

  const priceFeedTimelock = { address: "0x51d2E6c7B6cc67875D388aDbE2BB7A8238EA6353" }

  const updater1 = { address: "0xe6fd8f16CA620854289571FBBB7eE743437fc027" }
  // const updater2 = { address: "0x8588bBa54C5fF7209cd23068E2113e825AA4CA7F" }
  // const keeper1 = { address: "0x5405415765D1aAaC6Fe7E287967B87E5598Aab8C" }
  // const keeper2 = { address: "0x3f321C9303cAE0Cb02631e92f52190482b8Fa0A6" }
  const updaters = [updater1.address]

  const tokenManager = { address: "0x7D52Fc0564e13c8D515e1e1C17CCB7aFafAd37F3" }

  const positionRouter = await contractAt("PositionRouter", "0xf5D769Fc5A274812e81a12bD900EFCD29c6EaE78")

  // const fastPriceEvents = await contractAt("FastPriceEvents", "0xf71d18652C3975e75fddd07396869f1ccA184C5a")
  const fastPriceEvents = await deployContract("FastPriceEvents", [])

  // const chainlinkFlags = { address: "0x3C14e07Edd0dC67442FA96f1Ec6999c57E810a83" }

  return {
    fastPriceTokens,
    fastPriceEvents,
    tokenManager,
    positionRouter,
    // chainlinkFlags,
    tokenArr,
    updaters,
    priceFeedTimelock
  }
}

async function getTestnetValues(){
  const { btc, bnb, busd} = tokens
  const tokenArr = [btc, bnb, busd]
  const fastPriceTokens = []

  const priceFeedTimelock = { address: "0x11Ccc78ad8D3C2FfeB42Eca65934476D31794f5F" }

  const updater1 = { address: "0x9B82B9Ab7570Ae452D9FF5411F1bE2bad08EF4c4" }
  const updater2 = { address: "0x2CC6D07871A1c0655d6A7c9b0Ad24bED8f940517" }
  const keeper1 = { address: "0x33EDbEc831AD335f26fFC06EB07311cC99F50084" }
  const keeper2 = { address: "0x3134d254202E5dd2d98E4ba10CaE3703199c3FB0" }
  const updaters = [updater1.address, updater2.address, keeper1.address, keeper2.address]

  const tokenManager = { address: "0x15f54d599ADF24b809de9B9C917061Ce0cB7617f" }

  const positionRouter = await contractAt("PositionRouter", "0x9B25fb7d0af7B36d9dF9b872d1e80D42F0278168")

  const fastPriceEvents = await contractAt("FastPriceEvents", "0xf71d18652C3975e75fddd07396869f1ccA184C5a")
  // const fastPriceEvents = await deployContract("FastPriceEvents", [])

  // const chainlinkFlags = { address: "0x3C14e07Edd0dC67442FA96f1Ec6999c57E810a83" }

  return {
    fastPriceTokens,
    fastPriceEvents,
    tokenManager,
    positionRouter,
    // chainlinkFlags,
    tokenArr,
    updaters,
    priceFeedTimelock
  }
}

async function getArbValues(signer) {
  const { btc, eth, usdc, link, uni, usdt, mim, frax, dai } = tokens
  const tokenArr = [btc, eth, usdc, link, uni, usdt, mim, frax, dai]
  const fastPriceTokens = [btc, eth, link, uni]

  const priceFeedTimelock = { address: "0x7b1FFdDEEc3C4797079C7ed91057e399e9D43a8B" }

  const updater1 = { address: "0x18eAc44875EC92Ed80EeFAa7fa7Ac957b312D366" }
  const updater2 = { address: "0x2eD9829CFF68c7Bb40812f70c4Fc06A4938845de" }
  const keeper1 = { address: "0xbEe27BD52dB995D3c74Dc11FF32D93a1Aad747f7" }
  const keeper2 = { address: "0x94577665926885f47ddC1Feb322bc51470daA8E8" }
  const updaters = [updater1.address, updater2.address, keeper1.address, keeper2.address]

  const tokenManager = { address: "0x2c247a44928d66041D9F7B11A69d7a84d25207ba" }

  const positionRouter = await contractAt("PositionRouter", "0xb87a436B93fFE9D75c5cFA7bAcFff96430b09868")

  const fastPriceEvents = await contractAt("FastPriceEvents", "0x4530b7DE1958270A2376be192a24175D795e1b07", signer)
  // const fastPriceEvents = await deployContract("FastPriceEvents", [])

  const chainlinkFlags = { address: "0x3C14e07Edd0dC67442FA96f1Ec6999c57E810a83" }

  return {
    fastPriceTokens,
    fastPriceEvents,
    tokenManager,
    positionRouter,
    chainlinkFlags,
    tokenArr,
    updaters,
    priceFeedTimelock
  }
}

async function getAvaxValues(signer) {
  const { avax, btc, btcb, eth, mim, usdce, usdc } = tokens
  const tokenArr = [avax, btc, btcb, eth, mim, usdce, usdc]
  const fastPriceTokens = [avax, btc, btcb, eth]

  const priceFeedTimelock = { address: "0xCa8b5F2fF7B8d452bE8972B44Dc026Be96b97228" }

  const updater1 = { address: "0x2b249Bec7c3A142431b67e63A1dF86F974FAF3aa" }
  const updater2 = { address: "0x63ff41E44d68216e716d236E2ECdd5272611D835" }
  const keeper1 = { address: "0x5e0338CE6597FCB9404d69F4286194A60aD442b7" }
  const keeper2 = { address: "0x8CD98FF48831aa8864314ae8f41337FaE9941C8D" }
  const updaters = [updater1.address, updater2.address, keeper1.address, keeper2.address]

  const tokenManager = { address: "0x9bf98C09590CeE2Ec5F6256449754f1ba77d5aE5" }

  const positionRouter = await contractAt("PositionRouter", "0xffF6D276Bc37c61A23f06410Dce4A400f66420f8")

  // const fastPriceEvents = await deployContract("FastPriceEvents", [])
  const fastPriceEvents = await contractAt("FastPriceEvents", "0x02b7023D43bc52bFf8a0C54A9F2ecec053523Bf6", signer)

  return {
    fastPriceTokens,
    fastPriceEvents,
    tokenManager,
    positionRouter,
    tokenArr,
    updaters,
    priceFeedTimelock
  }
}

async function getValues(signer) {
  if (network === "arbitrum") {
    return getArbValues(signer)
  }

  if (network === "avax") {
    return getAvaxValues(signer)
  }

  if (network === "testnet") {
    return getTestnetValues()
  }

  if (network === "bsc") {
    return getBscValues()
  }
}

async function main() {
  const signer = await getFrameSigner()
  const deployer = { address: "0x2CC6D07871A1c0655d6A7c9b0Ad24bED8f940517" }

  const {
    fastPriceTokens,
    fastPriceEvents,
    tokenManager,
    positionRouter,
    tokenArr,
    updaters,
    priceFeedTimelock
  } = await getValues(signer)

  const signers = [
    "0x0EaEA9558eFF1d4b76b347A39f54d8CDf01F990F", // account test 1
    "0x33EDbEc831AD335f26fFC06EB07311cC99F50084", // account test 2
    "0x3134d254202E5dd2d98E4ba10CaE3703199c3FB0", // account test 3
    "0x6f8e190d41c6D5F0Dc18122b01C339761A4deDbe", // account test 4
  ]

  if (fastPriceTokens.find(t => !t.fastPricePrecision)) {
    throw new Error("Invalid price precision")
  }

  if (fastPriceTokens.find(t => !t.maxCumulativeDeltaDiff)) {
    throw new Error("Invalid price maxCumulativeDeltaDiff")
  }

  const secondaryPriceFeed = await deployContract("FastPriceFeed", [
    5 * 60 * 60, // _priceDuration  10 hours
    12 * 60 * 60, // _maxPriceUpdateDelay 12 hours
    1, // _minBlockInterval
    250, // _maxDeviationBasisPoints
    fastPriceEvents.address, // _fastPriceEvents
    deployer.address, // _tokenManager
    positionRouter.address
  ])

  const vaultPriceFeed = await deployContract("VaultPriceFeed", [])

  await sendTxn(vaultPriceFeed.setMaxStrictPriceDeviation(expandDecimals(1, 28)), "vaultPriceFeed.setMaxStrictPriceDeviation") // 0.01 USD
  await sendTxn(vaultPriceFeed.setPriceSampleSpace(1), "vaultPriceFeed.setPriceSampleSpace")
  await sendTxn(vaultPriceFeed.setSecondaryPriceFeed(secondaryPriceFeed.address), "vaultPriceFeed.setSecondaryPriceFeed")
  await sendTxn(vaultPriceFeed.setIsAmmEnabled(false), "vaultPriceFeed.setIsAmmEnabled")

  // if (chainlinkFlags) {
  //   await sendTxn(vaultPriceFeed.setChainlinkFlags(chainlinkFlags.address), "vaultPriceFeed.setChainlinkFlags")
  // }

  for (const [i, tokenItem] of tokenArr.entries()) {
    if (!tokenItem || tokenItem.spreadBasisPoints === undefined) { continue }
    await sendTxn(vaultPriceFeed.setSpreadBasisPoints(
      tokenItem.address, // _token
      tokenItem.spreadBasisPoints // _spreadBasisPoints
    ), `vaultPriceFeed.setSpreadBasisPoints(${tokenItem.name}) ${tokenItem.spreadBasisPoints}`)
  }

  for (const token of tokenArr) {
    await sendTxn(vaultPriceFeed.setTokenConfig(
      token.address, // _token
      token.priceFeed, // _priceFeed
      token.priceDecimals, // _priceDecimals
      token.isStrictStable // _isStrictStable
    ), `vaultPriceFeed.setTokenConfig(${token.name}) ${token.address} ${token.priceFeed}`)
  }

  await sendTxn(secondaryPriceFeed.initialize(1, signers, updaters), "secondaryPriceFeed.initialize")
  await sendTxn(secondaryPriceFeed.setTokens(fastPriceTokens.map(t => t.address), fastPriceTokens.map(t => t.fastPricePrecision)), "secondaryPriceFeed.setTokens")
  await sendTxn(secondaryPriceFeed.setVaultPriceFeed(vaultPriceFeed.address), "secondaryPriceFeed.setVaultPriceFeed")
  await sendTxn(secondaryPriceFeed.setMaxTimeDeviation(60 * 60), "secondaryPriceFeed.setMaxTimeDeviation")
  await sendTxn(secondaryPriceFeed.setSpreadBasisPointsIfInactive(50), "secondaryPriceFeed.setSpreadBasisPointsIfInactive")
  await sendTxn(secondaryPriceFeed.setSpreadBasisPointsIfChainError(500), "secondaryPriceFeed.setSpreadBasisPointsIfChainError")
  await sendTxn(secondaryPriceFeed.setMaxCumulativeDeltaDiffs(fastPriceTokens.map(t => t.address), fastPriceTokens.map(t => t.maxCumulativeDeltaDiff)), "secondaryPriceFeed.setMaxCumulativeDeltaDiffs")


  await sendTxn(secondaryPriceFeed.setPriceDataInterval(1 * 60), "secondaryPriceFeed.setPriceDataInterval")

  await sendTxn(positionRouter.setPositionKeeper(secondaryPriceFeed.address, true), "positionRouter.setPositionKeeper(secondaryPriceFeed)")
  await sendTxn(fastPriceEvents.setIsPriceFeed(secondaryPriceFeed.address, true), "fastPriceEvents.setIsPriceFeed")

  await sendTxn(vaultPriceFeed.setGov(priceFeedTimelock.address), "vaultPriceFeed.setGov")
  await sendTxn(secondaryPriceFeed.setGov(priceFeedTimelock.address), "secondaryPriceFeed.setGov")
  await sendTxn(secondaryPriceFeed.setTokenManager(tokenManager.address), "secondaryPriceFeed.setTokenManager")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
