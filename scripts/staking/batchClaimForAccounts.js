const { deployContract, contractAt, sendTxn, writeTmpAddresses } = require("../shared/helpers")

async function main() {
  const accountsList = []

  const batchSize = 30
  let accounts = []

  const rewardManager = await contractAt("RewardManager", "0x4D66F7eaC6FCc1516C963667E8c6FC9eC3c3cd57")
  const feeGmxTracker = await contractAt("RewardTracker", "0xd2D1162512F927a7e282Ef43a362659E4F2a728F")
  // await sendTxn(feeGmxTracker.setHandler(rewardManager.address, true), "feeGmxTracker.setHandler")

  for (let i = 0; i < accountsList.length; i++) {
    accounts.push(accountsList[i])

    if (accounts.length === batchSize) {
      console.log("accounts", accounts)
      console.log("sending batch", i, accounts.length)
      await sendTxn(rewardManager.batchClaimForAccounts(feeGmxTracker.address, accounts, "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8"), "rewardManager.batchClaimForAccounts")

      accounts = []
    }
  }

  if (accounts.length > 0) {
    console.log("sending final batch", accounts.length)
    await sendTxn(rewardManager.batchClaimForAccounts(feeGmxTracker.address, accounts, "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8"), "rewardManager.batchClaimForAccounts")
  }

  await sendTxn(feeGmxTracker.setHandler(rewardManager.address, false), "feeGmxTracker.setHandler")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
