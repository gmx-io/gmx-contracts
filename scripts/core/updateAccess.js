const { contractAt, sendTxn } = require("../shared/helpers")

const wallet = { address: "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8" }
const timelock = { address: "0x4A3930B629F899fE19C1F280C73A376382d61A78" }

async function printRewardTracker(rewardTracker, label) {
  // console.log(label, "inPrivateTransferMode", await rewardTracker.inPrivateTransferMode())
  // console.log(label, "inPrivateStakingMode", await rewardTracker.inPrivateStakingMode())
  // console.log(label, "inPrivateClaimingMode", await rewardTracker.inPrivateClaimingMode())
  console.log(label, "isHandler", await rewardTracker.isHandler(wallet.address))
  console.log(label, "gov", await rewardTracker.gov())
}

async function updateHandler(rewardTracker, label) {
  await sendTxn(rewardTracker.setHandler(wallet.address, false), `${label}, rewardTracker.setHandler`)
}

async function printToken(token, label) {
  console.log(label, "inPrivateTransferMode", await token.inPrivateTransferMode())
  console.log(label, "isHandler", await token.isHandler(wallet.address))
  console.log(label, "isMinter", await token.isMinter(wallet.address))
  console.log(label, "gov", await token.gov())
}

async function printUsdg(token, label) {
  console.log(label, "isVault", await token.vaults(wallet.address))
  console.log(label, "gov", await token.gov())
}

async function updateToken(token, label) {
  // await sendTxn(token.removeAdmin(wallet.address), `${label}, token.removeAdmin`)
  await sendTxn(token.setMinter(wallet.address, false), `${label}, token.setMinter`)
}

async function updateGov(contract, label) {
  await sendTxn(contract.setGov(timelock.address), `${label}.setGov`)
}

async function signalGov(prevGov, contract, nextGov, label) {
  await sendTxn(prevGov.signalSetGov(contract.address, nextGov.address), `${label}.signalSetGov`)
}

async function updateRewardTrackerGov(rewardTracker, label) {
  const distributorAddress = await rewardTracker.distributor()
  const distributor = await contractAt("RewardDistributor", distributorAddress)
  await sendTxn(rewardTracker.setGov(timelock.address), `${label}.setGov`)
  await sendTxn(distributor.setGov(timelock.address), `${label}.distributor.setGov`)
}

async function main() {
  const stakedGmxTracker = await contractAt("RewardTracker", "0x908C4D94D34924765f1eDc22A1DD098397c59dD4")
  const bonusGmxTracker = await contractAt("RewardTracker", "0x4d268a7d4C16ceB5a606c173Bd974984343fea13")
  const feeGmxTracker = await contractAt("RewardTracker", "0xd2D1162512F927a7e282Ef43a362659E4F2a728F")

  const stakedGlpTracker = await contractAt("RewardTracker", "0x1aDDD80E6039594eE970E5872D247bf0414C8903")
  const feeGlpTracker = await contractAt("RewardTracker", "0x4e971a87900b931fF39d1Aad67697F49835400b6")

  // await printRewardTracker(stakedGmxTracker, "stakedGmxTracker")
  // await printRewardTracker(bonusGmxTracker, "bonusGmxTracker")
  // await printRewardTracker(feeGmxTracker, "feeGmxTracker")
  //
  // await printRewardTracker(stakedGlpTracker, "stakedGlpTracker")
  // await printRewardTracker(feeGlpTracker, "feeGlpTracker")

  // await updateHandler(stakedGmxTracker, "stakedGmxTracker")
  // await updateHandler(bonusGmxTracker, "bonusGmxTracker")
  // await updateHandler(feeGmxTracker, "feeGmxTracker")
  // await updateHandler(stakedGlpTracker, "stakedGlpTracker")
  // await updateHandler(feeGlpTracker, "feeGlpTracker")

  const glp = await contractAt("MintableBaseToken", "0x4277f8F2c384827B5273592FF7CeBd9f2C1ac258")
  const usdg = await contractAt("USDG", "0x45096e7aA921f27590f8F19e457794EB09678141")
  const gmx = await contractAt("MintableBaseToken", "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a")
  const esGmx = await contractAt("MintableBaseToken", "0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA")
  const bnGmx = await contractAt("MintableBaseToken", "0x35247165119B69A40edD5304969560D0ef486921")

  // await printToken(glp, "glp")
  // await printUsdg(usdg, "usdg")
  // await printToken(gmx, "gmx")
  // await printToken(esGmx, "esGmx")
  // await printToken(bnGmx, "bnGmx")

  const prevGov = await contractAt("Timelock", "0x4a3930b629f899fe19c1f280c73a376382d61a78")
  const nextGov = await contractAt("Timelock", "0x09214C0A3594fbcad59A58099b0A63E2B29b15B8")

  // await signalGov(prevGov, glp, nextGov, "glp")
  // await signalGov(prevGov, gmx, nextGov, "gmx")
  // await signalGov(prevGov, esGmx, nextGov, "esGmx")
  await signalGov(prevGov, bnGmx, nextGov, "bnGmx")

  // await updateToken(gmx, "gmx")
  // await updateToken(esGmx, "esGmx")
  // await updateToken(bnGmx, "bnGmx")

  // await updateRewardTrackerGov(stakedGmxTracker, "stakedGmxTracker")
  // await updateRewardTrackerGov(bonusGmxTracker, "bonusGmxTracker")
  // await updateRewardTrackerGov(feeGmxTracker, "feeGmxTracker")
  //
  // await updateRewardTrackerGov(stakedGlpTracker, "stakedGlpTracker")
  // await updateRewardTrackerGov(feeGlpTracker, "feeGlpTracker")

  // await updateGov(glp, "glp")
  // await updateGov(usdg, "usdg")
  // await updateGov(gmx, "gmx")
  // await updateGov(esGmx, "esGmx")
  // await updateGov(bnGmx, "bnGmx")

  // const vault = await contractAt("Vault", "0x489ee077994B6658eAfA855C308275EAd8097C4A")
  // const vaultPriceFeedAddress = await vault.priceFeed()
  // const vaultPriceFeed = await contractAt("VaultPriceFeed", vaultPriceFeedAddress)
  // const glpManager = await contractAt("GlpManager", "0x321F653eED006AD1C29D174e17d96351BDe22649")
  // const router = await contractAt("Router", "0xaBBc5F99639c9B6bCb58544ddf04EFA6802F4064")
  //
  // await updateGov(vault, "vault")
  // await updateGov(vaultPriceFeed, "vaultPriceFeed")
  // await updateGov(glpManager, "glpManager")
  // await updateGov(router, "router")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
