const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function main() {
  const admin = { address: "0x49B373D422BdA4C6BfCdd5eC1E48A9a26fdA2F8b" }
  const buffer = 60 * 60
  const rewardManager = await deployContract("RewardManager", [])
  const tokenManager = { address: "0x4E29d2ee6973E5Bd093df40ef9d0B28BD56C9e4E" }
  const mintReceiver = { address: "0x50F22389C10FcC3bA9B1AB9BCDafE40448a357FB" }
  const maxTokenSupply = expandDecimals("13250000", 18)

  const weth = await contractAt("Token", "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1")

  const gmx = { address: "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a" }
  const esGmx = { address: "0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA" }
  const bnGmx = { address: "0x35247165119B69A40edD5304969560D0ef486921" }
  const glp = { address: "0x4277f8F2c384827B5273592FF7CeBd9f2C1ac258" }
  const stakedGmxTracker = { address: "0x908C4D94D34924765f1eDc22A1DD098397c59dD4" }
  const bonusGmxTracker = { address: "0x4d268a7d4C16ceB5a606c173Bd974984343fea13" }
  const feeGmxTracker = { address: "0xd2D1162512F927a7e282Ef43a362659E4F2a728F" }
  const feeGlpTracker = { address: "0x4e971a87900b931fF39d1Aad67697F49835400b6" }
  const stakedGlpTracker = { address: "0x1aDDD80E6039594eE970E5872D247bf0414C8903" }
  const glpManager = { address: "0x321F653eED006AD1C29D174e17d96351BDe22649" }
  const stakedGmxDistributor = { address: "0x23208B91A98c7C1CD9FE63085BFf68311494F193" }
  const stakedGlpDistributor = { address: "0x60519b48ec4183a61ca2B8e37869E675FD203b34" }

  const timelock = await deployContract("Timelock", [
    admin.address,
    buffer,
    rewardManager.address,
    tokenManager.address,
    mintReceiver.address,
    maxTokenSupply
  ])

  const vestingDuration = 365 * 24 * 60 * 60

  const gmxVester = await deployContract("Vester", [
    "Vested GMX", // _name
    "vGMX", // _symbol
    vestingDuration, // _vestingDuration
    esGmx.address, // _esToken
    feeGmxTracker.address, // _pairToken
    gmx.address, // _claimableToken
    stakedGmxTracker.address, // _rewardTracker
  ])

  const glpVester = await deployContract("Vester", [
    "Vested GLP", // _name
    "vGLP", // _symbol
    vestingDuration, // _vestingDuration
    esGmx.address, // _esToken
    stakedGlpTracker.address, // _pairToken
    gmx.address, // _claimableToken
    stakedGlpTracker.address, // _rewardTracker
  ])

  const rewardRouter = await deployContract("RewardRouterV2", [])

  await rewardRouter.initialize(
    weth.address,
    gmx.address,
    esGmx.address,
    bnGmx.address,
    glp.address,
    stakedGmxTracker.address,
    bonusGmxTracker.address,
    feeGmxTracker.address,
    feeGlpTracker.address,
    stakedGlpTracker.address,
    glpManager.address,
    gmxVester.address,
    glpVester.address
  )

  await rewardManager.initialize(
    timelock.address,
    rewardRouter.address,
    glpManager.address,
    stakedGmxTracker.address,
    bonusGmxTracker.address,
    feeGmxTracker.address,
    feeGlpTracker.address,
    stakedGlpTracker.address,
    stakedGmxDistributor.address,
    stakedGlpDistributor.address,
    esGmx.address,
    bnGmx.address,
    gmxVester.address,
    glpVester.address
  )

  // await rewardManager.updateEsGmxHandlers()
  // await rewardManager.enableRewardRouter()
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
