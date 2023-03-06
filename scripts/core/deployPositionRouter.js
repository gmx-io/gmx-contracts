const { getFrameSigner, deployContract, contractAt , sendTxn, readTmpAddresses, writeTmpAddresses } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

const {
  ARBITRUM_URL,
  ARBITRUM_CAP_KEEPER_KEY,
  AVAX_URL,
  AVAX_CAP_KEEPER_KEY,
} = require("../../env.json")

async function getArbValues(signer) {
  const provider = new ethers.providers.JsonRpcProvider(ARBITRUM_URL)
  const capKeeperWallet = new ethers.Wallet(ARBITRUM_CAP_KEEPER_KEY).connect(provider)

  const vault = await contractAt("Vault", "0x489ee077994B6658eAfA855C308275EAd8097C4A")
  const timelock = await contractAt("Timelock", await vault.gov(), signer)
  const router = await contractAt("Router", await vault.router(), signer)
  const weth = await contractAt("WETH", tokens.nativeToken.address)
  const referralStorage = await contractAt("ReferralStorage", "0xe6fab3F0c7199b0d34d7FbE83394fc0e0D06e99d")
  const shortsTracker = await contractAt("ShortsTracker", "0xf58eEc83Ba28ddd79390B9e90C4d3EbfF1d434da", signer)
  const shortsTrackerTimelock = await contractAt("ShortsTrackerTimelock", "0xf58eEc83Ba28ddd79390B9e90C4d3EbfF1d434da", signer)
  const depositFee = "30" // 0.3%
  const minExecutionFee = "100000000000000" // 0.0001 ETH

  return {
    capKeeperWallet,
    vault,
    timelock,
    router,
    weth,
    referralStorage,
    shortsTracker,
    shortsTrackerTimelock,
    depositFee,
    minExecutionFee,
    positionKeepers
  }
}

async function getAvaxValues(signer) {
  const provider = new ethers.providers.JsonRpcProvider(AVAX_URL)
  const capKeeperWallet = new ethers.Wallet(AVAX_CAP_KEEPER_KEY).connect(provider)

  const vault = await contractAt("Vault", "0x9ab2De34A33fB459b538c43f251eB825645e8595")
  const timelock = await contractAt("Timelock", await vault.gov(), signer)
  const router = await contractAt("Router", await vault.router(), signer)
  const weth = await contractAt("WETH", tokens.nativeToken.address)
  const referralStorage = await contractAt("ReferralStorage", "0x827ED045002eCdAbEb6e2b0d1604cf5fC3d322F8")
  const shortsTracker = await contractAt("ShortsTracker", "0x9234252975484D75Fd05f3e4f7BdbEc61956D73a", signer)
  const shortsTrackerTimelock = await contractAt("ShortsTrackerTimelock", "0xf58eEc83Ba28ddd79390B9e90C4d3EbfF1d434da", signer)
  const depositFee = "30" // 0.3%
  const minExecutionFee = "20000000000000000" // 0.02 AVAX

  return {
    capKeeperWallet,
    vault,
    timelock,
    router,
    weth,
    referralStorage,
    shortsTracker,
    shortsTrackerTimelock,
    depositFee,
    minExecutionFee
  }
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
    capKeeperWallet,
    vault,
    timelock,
    router,
    weth,
    shortsTracker,
    shortsTrackerTimelock,
    depositFee,
    minExecutionFee,
    referralStorage
  } = await getValues(signer)

  const positionUtils = await deployContract("PositionUtils", [])

  const referralStorageGov = await contractAt("Timelock", await referralStorage.gov(), signer)

  const positionRouterArgs = [vault.address, router.address, weth.address, shortsTracker.address, depositFee, minExecutionFee]
  const positionRouter = await deployContract("PositionRouter", positionRouterArgs, "PositionRouter", {
      libraries: {
        PositionUtils: positionUtils.address
      }
  })

  await sendTxn(positionRouter.setReferralStorage(referralStorage.address), "positionRouter.setReferralStorage")
  await sendTxn(referralStorageGov.signalSetHandler(referralStorage.address, positionRouter.address, true), "referralStorage.signalSetHandler(positionRouter)")

  await sendTxn(shortsTrackerTimelock.signalSetHandler(positionRouter.address, true), "shortsTrackerTimelock.signalSetHandler(positionRouter)")

  await sendTxn(router.addPlugin(positionRouter.address), "router.addPlugin")

  await sendTxn(positionRouter.setDelayValues(0, 180, 30 * 60), "positionRouter.setDelayValues")
  await sendTxn(timelock.setContractHandler(positionRouter.address, true), "timelock.setContractHandler(positionRouter)")

  await sendTxn(positionRouter.setGov(await vault.gov()), "positionRouter.setGov")

  await sendTxn(positionRouter.setAdmin(capKeeperWallet.address), "positionRouter.setAdmin")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
