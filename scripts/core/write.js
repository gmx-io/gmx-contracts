const { getFrameSigner, deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function main() {
  const signer = await getFrameSigner()

  // const glpManager = await contractAt("GlpManager", "0x14fB4767dc9E10F96faaF37Ad24DE3E498cC344B")
  // await sendTxn(glpManager.setCooldownDuration(10 * 60), "glpManager.setCooldownDuration")
  // const gmx = await contractAt("GMX", "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a", signer)
  // const esGmx = await contractAt("EsGMX", "0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA")

  // const stakedGmxTracker = await contractAt("RewardTracker", "0x908C4D94D34924765f1eDc22A1DD098397c59dD4")
  // await sendTxn(gmx.approve(stakedGmxTracker.address, 0), "gmx.approve(stakedGmxTracker)")

  // const rewardRouter = await contractAt("RewardRouter", "0x67b789D48c926006F5132BFCe4e976F0A7A63d5D")
  // await sendTxn(rewardRouter.stakeEsGmx(expandDecimals(1, 18)), "rewardRouter.stakeEsGmx")

  // const vaultPriceFeed = await contractAt("VaultPriceFeed", "0x30333ce00AC3025276927672aAeFd80f22E89E54")
  // await sendTxn(vaultPriceFeed.setPriceSampleSpace(2), "vaultPriceFeed.setPriceSampleSpace")

  // const gmx = await contractAt("GMX", "0x62edc0692BD897D2295872a9FFCac5425011c661")
  // await sendTxn(gmx.approve("0x62edc0692BD897D2295872a9FFCac5425011c661", 100, { nonce: 714 }), "gmx.approve")

  const timelock = await contractAt("Timelock", "0xe7e740fa40ca16b15b621b49de8e9f0d69cf4858", signer)
  await sendTxn(timelock.signalApprove("0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a", "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a", 1), "approve")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
