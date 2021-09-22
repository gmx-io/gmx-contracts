const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function main() {
  const usdg = await contractAt("USDG", "0x85E76cbf4893c1fbcB34dCF1239A91CE2A4CF5a7")
  const wbnb = await contractAt("WETH", "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c")
  const xgmt = await contractAt("YieldToken", "0xe304ff0983922787Fd84BC9170CD21bF78B16B10")

  const autoUsdgPair = { address: "0x0523FD5C53ea5419B4DAF656BC1b157dDFE3ce50" }
  const autoUsdgFarm = await deployContract("YieldFarm", ["AUTO-USDG Farm", "AUTO-USDG:FARM", autoUsdgPair.address], "autoUsdgFarm")

  const autoUsdgFarmYieldTrackerXgmt = await deployContract("YieldTracker", [autoUsdgFarm.address], "autoUsdgFarmYieldTrackerXgmt")
  const autoUsdgFarmDistributorXgmt = await deployContract("TimeDistributor", [], "autoUsdgFarmDistributorXgmt")

  await sendTxn(autoUsdgFarmYieldTrackerXgmt.setDistributor(autoUsdgFarmDistributorXgmt.address), "autoUsdgFarmYieldTrackerXgmt.setDistributor")
  await sendTxn(autoUsdgFarmDistributorXgmt.setDistribution([autoUsdgFarmYieldTrackerXgmt.address], ["0"], [xgmt.address]), "autoUsdgFarmDistributorXgmt.setDistribution")

  const autoUsdgFarmYieldTrackerWbnb = await deployContract("YieldTracker", [autoUsdgFarm.address], "autoUsdgFarmYieldTrackerWbnb")
  const autoUsdgFarmDistributorWbnb = await deployContract("TimeDistributor", [], "autoUsdgFarmDistributorWbnb")

  await sendTxn(autoUsdgFarmYieldTrackerWbnb.setDistributor(autoUsdgFarmDistributorWbnb.address), "autoUsdgFarmYieldTrackerWbnb.setDistributor")
  await sendTxn(autoUsdgFarmDistributorWbnb.setDistribution([autoUsdgFarmYieldTrackerWbnb.address], ["0"], [wbnb.address]), "autoUsdgFarmDistributorWbnb.setDistribution")

  await sendTxn(autoUsdgFarm.setYieldTrackers([autoUsdgFarmYieldTrackerXgmt.address, autoUsdgFarmYieldTrackerWbnb.address]), "autoUsdgFarm.setYieldTrackers")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
