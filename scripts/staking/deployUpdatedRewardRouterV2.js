const { deployContract, contractAt, sendTxn, writeTmpAddresses } = require("../shared/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('../core/tokens')[network];

async function main() {
  const { nativeToken } = tokens

  const vestingDuration = 365 * 24 * 60 * 60

  // use AddressZero for the glpManager since GLP mint / burn should be done using
  // the GLP RewardRouter instead
  const glpManager = await contractAt("GlpManager", ethers.constants.AddressZero)
  const glp = await contractAt("GLP", "0x4277f8F2c384827B5273592FF7CeBd9f2C1ac258")

  const gmx = await contractAt("GMX", "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a");
  const esGmx = await contractAt("EsGMX", "0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA");
  const bnGmx = await contractAt("MintableBaseToken", "0x35247165119B69A40edD5304969560D0ef486921");

  const stakedGmxTracker = await contractAt("RewardTracker", "0x908C4D94D34924765f1eDc22A1DD098397c59dD4");
  const bonusGmxTracker = await contractAt("RewardTracker", "0x4d268a7d4C16ceB5a606c173Bd974984343fea13");
  const feeGmxTracker = await contractAt("RewardTracker", "0xd2D1162512F927a7e282Ef43a362659E4F2a728F");

  const feeGlpTracker = await contractAt("RewardTracker", "0x4e971a87900b931fF39d1Aad67697F49835400b6");
  const stakedGlpTracker = await contractAt("RewardTracker", "0x1aDDD80E6039594eE970E5872D247bf0414C8903");

  const gmxVester = await contractAt("Vester", "0x199070DDfd1CFb69173aa2F7e20906F26B363004")
  const glpVester = await contractAt("Vester", "0xA75287d2f8b217273E7FCD7E86eF07D33972042E")

  const govToken = await contractAt("MintableBaseToken", "0x2A29D3a792000750807cc401806d6fd539928481")

  const rewardRouter = await deployContract("RewardRouterV2", [])
  await sendTxn(rewardRouter.initialize(
    nativeToken.address,
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
    glpVester.address,
    govToken.address
  ), "rewardRouter.initialize")

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
