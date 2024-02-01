const { contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const compoundGmxList = require("../../data/staking/compoundGmxList.json")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

async function getArbValues() {
  const rewardRouter = await contractAt("RewardRouter", "0x159854e14A862Df9E39E1D128b8e5F70B4A3cE9B")
  return { rewardRouter }
}

async function getAvaxValues() {
  const rewardRouter = await contractAt("RewardRouter", "0xa192D0681E2b9484d1fA48083D36B8A2D0Da1809")
  return { rewardRouter }
}

async function getValues() {
  if (network === "arbitrum") {
    return getArbValues()
  }

  if (network === "avax") {
    return getAvaxValues()
  }
}


async function main() {
  const wallet = { address: "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8" }
  const { rewardRouter } = await getValues()

  console.log("processing list", compoundGmxList.length)
  const startIndex = process.env.START_INDEX ? parseInt(process.env.START_INDEX) : 0

  const batchSize = 20
  let accounts = []

  for (let i = startIndex; i < compoundGmxList.length; i++) {
    accounts.push(compoundGmxList[i])

    if (accounts.length === batchSize) {
      console.log("accounts", accounts)
      console.log("sending batch", i, accounts.length)
      await sendTxn(rewardRouter.batchCompoundForAccounts(accounts), "rewardRouter.batchCompoundForAccounts")

      accounts = []
    }
  }

  if (accounts.length > 0) {
    console.log("sending final batch", compoundGmxList.length, accounts.length)
    await sendTxn(rewardRouter.batchCompoundForAccounts(accounts), "rewardRouter.batchCompoundForAccounts")
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
