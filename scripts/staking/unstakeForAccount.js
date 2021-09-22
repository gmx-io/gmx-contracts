const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function main() {
  const wallet = { address: "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8" }

  const account = "0x6eA748d14f28778495A3fBa3550a6CdfBbE555f9"
  const unstakeAmount = "79170000000000000000"

  const rewardRouter = await contractAt("RewardRouter", "0x1b8911995ee36F4F95311D1D9C1845fA18c56Ec6")
  const gmx = await contractAt("GMX", "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a");
  const bnGmx = await contractAt("MintableBaseToken", "0x35247165119B69A40edD5304969560D0ef486921");
  const stakedGmxTracker = await contractAt("RewardTracker", "0x908C4D94D34924765f1eDc22A1DD098397c59dD4")
  const bonusGmxTracker = await contractAt("RewardTracker", "0x4d268a7d4C16ceB5a606c173Bd974984343fea13")
  const feeGmxTracker = await contractAt("RewardTracker", "0xd2D1162512F927a7e282Ef43a362659E4F2a728F")

  // const gasLimit = 30000000

  // await sendTxn(feeGmxTracker.setHandler(wallet.address, true, { gasLimit }), "feeGmxTracker.setHandler")
  // await sendTxn(bonusGmxTracker.setHandler(wallet.address, true, { gasLimit }), "bonusGmxTracker.setHandler")
  // await sendTxn(stakedGmxTracker.setHandler(wallet.address, true, { gasLimit }), "stakedGmxTracker.setHandler")

  const stakedAmount = await stakedGmxTracker.stakedAmounts(account)
  console.log(`${account} staked: ${stakedAmount.toString()}`)
  console.log(`unstakeAmount: ${unstakeAmount.toString()}`)

  await sendTxn(feeGmxTracker.unstakeForAccount(account, bonusGmxTracker.address, unstakeAmount, account), "feeGmxTracker.unstakeForAccount")
  await sendTxn(bonusGmxTracker.unstakeForAccount(account, stakedGmxTracker.address, unstakeAmount, account), "bonusGmxTracker.unstakeForAccount")
  await sendTxn(stakedGmxTracker.unstakeForAccount(account, gmx.address, unstakeAmount, account), "stakedGmxTracker.unstakeForAccount")

  await sendTxn(bonusGmxTracker.claimForAccount(account, account), "bonusGmxTracker.claimForAccount")

  const bnGmxAmount = await bnGmx.balanceOf(account)
  console.log(`bnGmxAmount: ${bnGmxAmount.toString()}`)

  await sendTxn(feeGmxTracker.stakeForAccount(account, account, bnGmx.address, bnGmxAmount), "feeGmxTracker.stakeForAccount")

  const stakedBnGmx = await feeGmxTracker.depositBalances(account, bnGmx.address)
  console.log(`stakedBnGmx: ${stakedBnGmx.toString()}`)

  const reductionAmount = stakedBnGmx.mul(unstakeAmount).div(stakedAmount)
  console.log(`reductionAmount: ${reductionAmount.toString()}`)
  await sendTxn(feeGmxTracker.unstakeForAccount(account, bnGmx.address, reductionAmount, account), "feeGmxTracker.unstakeForAccount")
  await sendTxn(bnGmx.burn(account, reductionAmount), "bnGmx.burn")

  const gmxAmount = await gmx.balanceOf(account)
  console.log(`gmxAmount: ${gmxAmount.toString()}`)

  await sendTxn(gmx.burn(account, unstakeAmount), "gmx.burn")
  const nextGmxAmount = await gmx.balanceOf(account)
  console.log(`nextGmxAmount: ${nextGmxAmount.toString()}`)

  const nextStakedAmount = await stakedGmxTracker.stakedAmounts(account)
  console.log(`nextStakedAmount: ${nextStakedAmount.toString()}`)

  const nextStakedBnGmx = await feeGmxTracker.depositBalances(account, bnGmx.address)
  console.log(`nextStakedBnGmx: ${nextStakedBnGmx.toString()}`)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
