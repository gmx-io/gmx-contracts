const { getFrameSigner, deployContract, contractAt , sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")
const { errors } = require("../../test/core/Vault/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

const depositFee = 30 // 0.3%

async function getArbValues(signer) {
  const vault = await contractAt("Vault", "0x489ee077994B6658eAfA855C308275EAd8097C4A", signer)
  const timelock = await contractAt("Timelock", await vault.gov(), signer)
  const router = await contractAt("Router", await vault.router(), signer)
  const shortsTracker = await contractAt("ShortsTracker", "0xf58eEc83Ba28ddd79390B9e90C4d3EbfF1d434da", signer)
  const weth = await contractAt("WETH", tokens.nativeToken.address)
  const orderBook = await contractAt("OrderBook", "0x09f77E8A13De9a35a7231028187e9fD5DB8a2ACB")
  const referralStorage = await contractAt("ReferralStorage", "0xe6fab3f0c7199b0d34d7fbe83394fc0e0d06e99d")

  const orderKeepers = [
    { address: "0xd4266F8F82F7405429EE18559e548979D49160F3" },
    { address: "0x2D1545d6deDCE867fca3091F49B29D16B230a6E4" }
  ]
  const liquidators = [
    { address: "0x44311c91008DDE73dE521cd25136fD37d616802c" }
  ]

  const partnerContracts = [
    "0x9ba57a1D3f6C61Ff500f598F16b97007EB02E346", // Vovo ETH up vault
    "0x5D8a5599D781CC50A234D73ac94F4da62c001D8B", // Vovo ETH down vault
    "0xE40bEb54BA00838aBE076f6448b27528Dd45E4F0", // Vovo BTC up vault
    "0x1704A75bc723A018D176Dc603b0D1a361040dF16", // Vovo BTC down vault
    "0xbFbEe90E2A96614ACe83139F41Fa16a2079e8408", // Vovo GLP ETH up vault
    "0x0FAE768Ef2191fDfCb2c698f691C49035A53eF0f", // Vovo GLP ETH down vault
    "0x2b8E28667A29A5Ab698b82e121F2b9Edd9271e93", // Vovo GLP BTC up vault
    "0x46d6dEE922f1d2C6421895Ba182120C784d986d3", // Vovo GLP BTC down vault
    "0x3327a5F041E821f476E00572ee0862fbcaa32993", // Jones ETH Hedging
    "0x2F9980d6fb25bD972196B19E243e36Dbde60618B", // Jones gOHM Hedging
    "0xC75417CB103D7008eCb07aa6fbf214eE2c127901", // Jones DPX Hedging
    "0x37a86cB53981CC762709B2c402B0F790D58F95BF", // Jones rDPX Hedging
  ]

  return { vault, timelock, router, shortsTracker, weth, depositFee, orderBook, referralStorage, orderKeepers, liquidators, partnerContracts }
}

async function getAvaxValues(signer) {
  const vault = await contractAt("Vault", "0x9ab2De34A33fB459b538c43f251eB825645e8595")
  const timelock = await contractAt("Timelock", await vault.gov(), signer)
  const router = await contractAt("Router", await vault.router(), signer)
  const shortsTracker = await contractAt("ShortsTracker", "0x9234252975484D75Fd05f3e4f7BdbEc61956D73a", signer)
  const weth = await contractAt("WETH", tokens.nativeToken.address)
  const orderBook = await contractAt("OrderBook", "0x4296e307f108B2f583FF2F7B7270ee7831574Ae5")
  const referralStorage = await contractAt("ReferralStorage", "0x827ed045002ecdabeb6e2b0d1604cf5fc3d322f8")

  const orderKeepers = [
    { address: "0x06f34388A7CFDcC68aC9167C5f1C23DD39783179" },
    { address: "0xf26f52d5985F6391E541A8d638e1EDaa522Ae56C" }
  ]
  const liquidators = [
    { address: "0x7858A4C42C619a68df6E95DF7235a9Ec6F0308b9" }
  ]

  const partnerContracts = []

  return { vault, timelock, router, shortsTracker, weth, depositFee, orderBook, referralStorage, orderKeepers, liquidators, partnerContracts }
}

async function getValues(signer) {
  if (network === "arbitrum") {
    return getArbValues(signer)
  }

  if (network === "avax") {
    return getAvaxValues(signer)
  }
}

async function main() {
  const signer = await getFrameSigner()

  const {
    positionManagerAddress,
    vault,
    timelock,
    router,
    shortsTracker,
    weth,
    depositFee,
    orderBook,
    referralStorage,
    orderKeepers,
    liquidators,
    partnerContracts
  } = await getValues(signer)

  let positionManager
  if (positionManagerAddress) {
    console.log("Using position manager at", positionManagerAddress)
    positionManager = await contractAt("PositionManager", positionManagerAddress)
  } else {
    console.log("Deploying new position manager")
    const positionManagerArgs = [vault.address, router.address, shortsTracker.address, weth.address, depositFee, orderBook.address]
    positionManager = await deployContract("PositionManager", positionManagerArgs)
  }

  // positionManager only reads from referralStorage so it does not need to be set as a handler of referralStorage
  if ((await positionManager.referralStorage()).toLowerCase() != referralStorage.address.toLowerCase()) {
    await sendTxn(positionManager.setReferralStorage(referralStorage.address), "positionManager.setReferralStorage")
  }
  if (await positionManager.shouldValidateIncreaseOrder()) {
    await sendTxn(positionManager.setShouldValidateIncreaseOrder(false), "positionManager.setShouldValidateIncreaseOrder(false)")
  }

  for (let i = 0; i < orderKeepers.length; i++) {
    const orderKeeper = orderKeepers[i]
    if (!(await positionManager.isOrderKeeper(orderKeeper.address))) {
      await sendTxn(positionManager.setOrderKeeper(orderKeeper.address, true), "positionManager.setOrderKeeper(orderKeeper)")
    }
  }

  for (let i = 0; i < liquidators.length; i++) {
    const liquidator = liquidators[i]
    if (!(await positionManager.isLiquidator(liquidator.address))) {
      await sendTxn(positionManager.setLiquidator(liquidator.address, true), "positionManager.setLiquidator(liquidator)")
    }
  }

  if (!(await timelock.isHandler(positionManager.address))) {
    await sendTxn(timelock.setContractHandler(positionManager.address, true), "timelock.setContractHandler(positionManager)")
  }
  if (!(await vault.isLiquidator(positionManager.address))) {
    await sendTxn(timelock.setLiquidator(vault.address, positionManager.address, true), "timelock.setLiquidator(vault, positionManager, true)")
  }
  if (!(await shortsTracker.isHandler(positionManager.address))) {
    await sendTxn(shortsTracker.setHandler(positionManager.address, true), "shortsTracker.setContractHandler(positionManager.address, true)")
  }
  if (!(await router.plugins(positionManager.address))) {
    await sendTxn(router.addPlugin(positionManager.address), "router.addPlugin(positionManager)")
  }

  for (let i = 0; i < partnerContracts.length; i++) {
    const partnerContract = partnerContracts[i]
    if (!(await positionManager.isPartner(partnerContract))) {
      await sendTxn(positionManager.setPartner(partnerContract, true), "positionManager.setPartner(partnerContract)")
    }
  }

  if ((await positionManager.gov()) != (await vault.gov())) {
    await sendTxn(positionManager.setGov(await vault.gov()), "positionManager.setGov")
  }

  console.log("done.")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
