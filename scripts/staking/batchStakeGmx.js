const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const stakeGmxList = require("../../data/gmxMigration/stakeGmxList6.json")

async function main() {
  const wallet = { address: "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8" }
  const gmx = await contractAt("GMX", "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a");
  const rewardRouter = await contractAt("RewardRouter", "0xc73d553473dC65CE56db96c58e6a091c20980fbA")
  const stakedGmxTracker = await contractAt("RewardTracker", "0x908C4D94D34924765f1eDc22A1DD098397c59dD4")
  const shouldStake = false

  console.log("processing list", stakeGmxList.length)

  // await sendTxn(gmx.setMinter(wallet.address, true), "gmx.setMinter")
  // await sendTxn(gmx.mint(wallet.address, expandDecimals(5500000, 18)), "gmx.mint")
  // await sendTxn(gmx.approve(stakedGmxTracker.address, expandDecimals(5500000, 18)), "gmx.approve(stakedGmxTracker)")
  // await sendTxn(rewardRouter.batchStakeGmxForAccount(["0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8"], [1], { gasLimit: 30000000 }), "rewardRouter.batchStakeGmxForAccount")

  if (!shouldStake) {
    for (let i = 0; i < stakeGmxList.length; i++) {
      const item = stakeGmxList[i]
      const account = item.address
      const stakedAmount = await stakedGmxTracker.stakedAmounts(account)
      console.log(`${account} : ${stakedAmount.toString()}`)
    }
    return
  }

  const batchSize = 30
  let accounts = []
  let amounts = []

  for (let i = 0; i < stakeGmxList.length; i++) {
    const item = stakeGmxList[i]
    accounts.push(item.address)
    amounts.push(item.balance)

    if (accounts.length === batchSize) {
      console.log("accounts", accounts)
      console.log("amounts", amounts)
      console.log("sending batch", i, accounts.length, amounts.length)
      await sendTxn(rewardRouter.batchStakeGmxForAccount(accounts, amounts), "rewardRouter.batchStakeGmxForAccount")

      const account = accounts[0]
      const amount = amounts[0]
      const stakedAmount = await stakedGmxTracker.stakedAmounts(account)
      console.log(`${account}: ${amount.toString()}, ${stakedAmount.toString()}`)

      accounts = []
      amounts = []
    }
  }

  if (accounts.length > 0) {
    console.log("sending final batch", stakeGmxList.length, accounts.length, amounts.length)
    await sendTxn(rewardRouter.batchStakeGmxForAccount(accounts, amounts), "rewardRouter.batchStakeGmxForAccount")
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
