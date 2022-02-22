const { deployContract, contractAt, sendTxn, readTmpAddresses } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('../core/tokens')[network];

async function main() {
  const {
    nativeToken
  } = tokens

  const weth = await contractAt("Token", nativeToken.address)
  const gmx = await contractAt("GMX", "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a")
  const esGmx = await contractAt("EsGMX", "0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA")
  const bnGmx = await contractAt("MintableBaseToken", "0x35247165119B69A40edD5304969560D0ef486921")

  const stakedGmxTracker = await contractAt("RewardTracker", "0x908C4D94D34924765f1eDc22A1DD098397c59dD4")
  const bonusGmxTracker = await contractAt("RewardTracker", "0x4d268a7d4C16ceB5a606c173Bd974984343fea13")
  const feeGmxTracker = await contractAt("RewardTracker", "0xd2D1162512F927a7e282Ef43a362659E4F2a728F")

  const feeGlpTracker = await contractAt("RewardTracker", "0x4e971a87900b931fF39d1Aad67697F49835400b6")
  const stakedGlpTracker = await contractAt("RewardTracker", "0x1aDDD80E6039594eE970E5872D247bf0414C8903")

  const glp = await contractAt("GLP", "0x4277f8F2c384827B5273592FF7CeBd9f2C1ac258")
  const glpManager = await contractAt("GlpManager", "0x321F653eED006AD1C29D174e17d96351BDe22649")

  console.log("glpManager", glpManager.address)

  const rewardRouter = await deployContract("RewardRouter", [])

  await sendTxn(rewardRouter.initialize(
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
    glpManager.address
  ), "rewardRouter.initialize")

  // allow rewardRouter to stake in stakedGmxTracker
  await sendTxn(stakedGmxTracker.setHandler(rewardRouter.address, true), "stakedGmxTracker.setHandler(rewardRouter)")
  // allow rewardRouter to stake in bonusGmxTracker
  await sendTxn(bonusGmxTracker.setHandler(rewardRouter.address, true), "bonusGmxTracker.setHandler(rewardRouter)")
  // allow rewardRouter to stake in feeGmxTracker
  await sendTxn(feeGmxTracker.setHandler(rewardRouter.address, true), "feeGmxTracker.setHandler(rewardRouter)")
  // allow rewardRouter to burn bnGmx
  await sendTxn(bnGmx.setMinter(rewardRouter.address, true), "bnGmx.setMinter(rewardRouter)")

  // allow rewardRouter to mint in glpManager
  await sendTxn(glpManager.setHandler(rewardRouter.address, true), "glpManager.setHandler(rewardRouter)")
  // allow rewardRouter to stake in feeGlpTracker
  await sendTxn(feeGlpTracker.setHandler(rewardRouter.address, true), "feeGlpTracker.setHandler(rewardRouter)")
  // allow rewardRouter to stake in stakedGlpTracker
  await sendTxn(stakedGlpTracker.setHandler(rewardRouter.address, true), "stakedGlpTracker.setHandler(rewardRouter)")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
