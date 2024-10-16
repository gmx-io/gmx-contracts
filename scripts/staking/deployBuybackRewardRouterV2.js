const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { REWARD_ROUTER_KEEPER_KEY } = require("../../env.json");

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('../core/tokens')[network];
const keeper = new ethers.Wallet(REWARD_ROUTER_KEEPER_KEY)

async function deployForArb() {
  const { nativeToken } = tokens

  // use AddressZero for the glpManager since GLP mint / burn should be done using
  // the GLP RewardRouter instead
  const glpManager = await contractAt("GlpManager", ethers.constants.AddressZero);
  const glp = await contractAt("GLP", "0x4277f8F2c384827B5273592FF7CeBd9f2C1ac258");

  const gmx = await contractAt("GMX", "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a");
  const esGmx = await contractAt("EsGMX", "0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA");
  const bnGmx = await contractAt("MintableBaseToken", "0x35247165119B69A40edD5304969560D0ef486921");

  const stakedGmxTracker = await contractAt("RewardTracker", "0x908C4D94D34924765f1eDc22A1DD098397c59dD4");
  const bonusGmxTracker = await contractAt("RewardTracker", "0x4d268a7d4C16ceB5a606c173Bd974984343fea13");
  const extendedGmxTracker = await contractAt("RewardTracker", "0x0755D33e45eD2B874c9ebF5B279023c8Bd1e5E93");
  const feeGmxTracker = await contractAt("RewardTracker", "0xd2D1162512F927a7e282Ef43a362659E4F2a728F");

  const feeGlpTracker = await contractAt("RewardTracker", "0x4e971a87900b931fF39d1Aad67697F49835400b6");
  const stakedGlpTracker = await contractAt("RewardTracker", "0x1aDDD80E6039594eE970E5872D247bf0414C8903");

  const gmxVester = await contractAt("Vester", "0x199070DDfd1CFb69173aa2F7e20906F26B363004");
  const glpVester = await contractAt("Vester", "0xA75287d2f8b217273E7FCD7E86eF07D33972042E");

  const externalHandlerAddress = "0x389CEf541397e872dC04421f166B5Bc2E0b374a5"; // Full contract doesn't exist in repo, thus just using deployed address

  const govToken = await contractAt("MintableBaseToken", "0x2A29D3a792000750807cc401806d6fd539928481");

  const rewardRouter = await deployContract("RewardRouterV2", []);
  await sendTxn(rewardRouter.initialize([
    nativeToken.address,
    gmx.address,
    esGmx.address,
    bnGmx.address,
    glp.address,
    stakedGmxTracker.address,
    bonusGmxTracker.address,
    extendedGmxTracker.address,
    feeGmxTracker.address,
    feeGlpTracker.address,
    stakedGlpTracker.address,
    glpManager.address,
    gmxVester.address,
    glpVester.address,
    externalHandlerAddress,
    govToken.address
  ]), "rewardRouter.initialize");

  await sendTxn(rewardRouter.setInStrictTransferMode(true), "rewardRouter.setInStrictTransferMode");
  await sendTxn(rewardRouter.setMaxBoostBasisPoints(0), "rewardRouter.setMaxBoostBasisPoints");
  await sendTxn(rewardRouter.setVotingPowerType(1), "rewardRouter.setVotingPowerType");
  await sendTxn(rewardRouter.setInRestakingMode(true), "rewardRouter.setInRestakingMode");
  await sendTxn(rewardRouter.setGov(keeper.address), "rewardRouter.setGov");

  const buybackMigratorAdminAddress = "0x49B373D422BdA4C6BfCdd5eC1E48A9a26fdA2F8b"
  const oldRewardRouter = await contractAt("RewardRouterV2", "0x159854e14A862Df9E39E1D128b8e5F70B4A3cE9B");

  const BuybackMigrator = await deployContract("BuybackMigrator", [
    buybackMigratorAdminAddress,
    stakedGmxTracker.address,
    bonusGmxTracker.address,
    extendedGmxTracker.address,
    feeGmxTracker.address,
    feeGlpTracker.address,
    stakedGlpTracker.address,
    gmxVester.address,
    glpVester.address,
    esGmx.address,
    bnGmx.address,
    oldRewardRouter.address,
    rewardRouter.address
  ]);
}

async function deployForAvax() {
  const { nativeToken } = tokens

  // use AddressZero for the glpManager since GLP mint / burn should be done using
  // the GLP RewardRouter instead
  const glpManager = await contractAt("GlpManager", ethers.constants.AddressZero);
  const glp = await contractAt("GLP", "0x01234181085565ed162a948b6a5e88758CD7c7b8");

  const gmx = await contractAt("GMX", "0x62edc0692BD897D2295872a9FFCac5425011c661");
  const esGmx = await contractAt("EsGMX", "0xFf1489227BbAAC61a9209A08929E4c2a526DdD17");
  const bnGmx = await contractAt("MintableBaseToken", "0x8087a341D32D445d9aC8aCc9c14F5781E04A26d2");

  const stakedGmxTracker = await contractAt("RewardTracker", "0x2bD10f8E93B3669b6d42E74eEedC65dd1B0a1342");
  const bonusGmxTracker = await contractAt("RewardTracker", "0x908C4D94D34924765f1eDc22A1DD098397c59dD4");
  const extendedGmxTracker = await contractAt("RewardTracker", "0xB0D12Bf95CC1341d6C845C978daaf36F70b5910d");
  const feeGmxTracker = await contractAt("RewardTracker", "0x4d268a7d4C16ceB5a606c173Bd974984343fea13");

  const feeGlpTracker = await contractAt("RewardTracker", "0xd2D1162512F927a7e282Ef43a362659E4F2a728F");
  const stakedGlpTracker = await contractAt("RewardTracker", "0x9e295B5B976a184B14aD8cd72413aD846C299660");

  const gmxVester = await contractAt("Vester", "0x472361d3cA5F49c8E633FB50385BfaD1e018b445");
  const glpVester = await contractAt("Vester", "0x62331A7Bd1dfB3A7642B7db50B5509E57CA3154A");

  const externalHandlerAddress = "0xD149573a098223a9185433290a5A5CDbFa54a8A9" // Full contract doesn't exist in repo, thus just using deployed address

  const govToken = await contractAt("MintableBaseToken", "0x0ff183E29f1924ad10475506D7722169010CecCb");

  const rewardRouter = await deployContract("RewardRouterV2", []);
  await sendTxn(rewardRouter.initialize([
    nativeToken.address,
    gmx.address,
    esGmx.address,
    bnGmx.address,
    glp.address,
    stakedGmxTracker.address,
    bonusGmxTracker.address,
    extendedGmxTracker.address,
    feeGmxTracker.address,
    feeGlpTracker.address,
    stakedGlpTracker.address,
    glpManager.address,
    gmxVester.address,
    glpVester.address,
    externalHandlerAddress,
    govToken.address
  ]), "rewardRouter.initialize");

  await sendTxn(rewardRouter.setInStrictTransferMode(true), "rewardRouter.setInStrictTransferMode");
  await sendTxn(rewardRouter.setMaxBoostBasisPoints(0), "rewardRouter.setMaxBoostBasisPoints");
  await sendTxn(rewardRouter.setVotingPowerType(1), "rewardRouter.setVotingPowerType");
  await sendTxn(rewardRouter.setInRestakingMode(true), "rewardRouter.setInRestakingMode");
  await sendTxn(rewardRouter.setGov(keeper.address), "rewardRouter.setGov");

  const buybackMigratorAdminAddress = "0x49B373D422BdA4C6BfCdd5eC1E48A9a26fdA2F8b"
  const oldRewardRouter = await contractAt("RewardRouterV2", "0xa192D0681E2b9484d1fA48083D36B8A2D0Da1809");

  const BuybackMigrator = await deployContract("BuybackMigrator", [
    buybackMigratorAdminAddress,
    stakedGmxTracker.address,
    bonusGmxTracker.address,
    extendedGmxTracker.address,
    feeGmxTracker.address,
    feeGlpTracker.address,
    stakedGlpTracker.address,
    gmxVester.address,
    glpVester.address,
    esGmx.address,
    bnGmx.address,
    oldRewardRouter.address,
    rewardRouter.address
  ]);
}

async function main() {
  if (network === "arbitrum") {
    await deployForArb();
  }

  if (network === "avax") {
    await deployForAvax();
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
