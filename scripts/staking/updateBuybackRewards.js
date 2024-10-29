const { getFrameSigner, contractAt, sendTxn, updateTokensPerInterval } = require("../shared/helpers")
const { expandDecimals, bigNumberify } = require("../../test/shared/utilities")

async function updateBuybackRewards({ rewardArr, intervalUpdater }) {
  for (let i = 0; i < rewardArr.length; i++) {
    const rewardItem = rewardArr[i]
    const { rewardTracker, rewardToken, transferAmount } = rewardItem
    console.log(`getting rewardDistributorAddress for rewardTracker: ${rewardTracker.address}`)
    const rewardDistributorAddress = await rewardTracker.distributor()
    console.log("getting rewardToken")
    const expectedRewardToken = await rewardTracker.rewardToken()
    if (expectedRewardToken.toLowerCase() !== rewardToken.address.toLowerCase()) {
      throw new Error(`mismatched rewardToken: ${expectedRewardToken}, ${rewardToken.address}`)
    }

    const rewardDistributor = await contractAt("RewardDistributor", rewardDistributorAddress, intervalUpdater)
    console.log("transferAmount", transferAmount)
    const convertedTransferAmount = bigNumberify(transferAmount)
    const rewardsPerInterval = convertedTransferAmount.div(7 * 24 * 60 * 60)
    console.log("rewardDistributorAddress", rewardDistributorAddress)
    console.log("convertedTransferAmount", convertedTransferAmount.toString())
    console.log("rewardsPerInterval", rewardsPerInterval.toString())

    console.log("sendTxn rewardToken.transfer")
    if (process.env.WRITE === "true") {
      await sendTxn(rewardToken.transfer(rewardDistributorAddress, convertedTransferAmount), `rewardToken.transfer ${i}, ${convertedTransferAmount}`)
    }

    console.log("sendTxn updateTokensPerInterval")
    if (process.env.WRITE === "true") {
      await updateTokensPerInterval(rewardDistributor, rewardsPerInterval, "rewardDistributor")
    }
  }
}

module.exports = {
  updateBuybackRewards
}
