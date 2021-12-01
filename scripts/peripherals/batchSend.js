const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { DISTRIBUTION_LIST } = require("../../data/batchSend/competitionNovBatch2")

async function main() {
  const wallet = { address: "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8" }
  const batchSender = await contractAt("BatchSender", "0x401Ab96410BcdCA81b79c68D0D664D478906C184")
  const distributionList = DISTRIBUTION_LIST
  const token = await contractAt("Token", "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8")
  const tokenDecimals = 6

  await sendTxn(token.approve(batchSender.address, expandDecimals(125 * 1000, tokenDecimals)), "token.approve")
  console.log("processing list", distributionList.length)

  const batchSize = 20
  let accounts = []
  let amounts = []

  for (let i = 0; i < distributionList.length; i++) {
    const [account, amount] = distributionList[i]
    accounts.push(account)
    amounts.push(ethers.utils.parseUnits(amount, tokenDecimals))

    if (accounts.length === batchSize) {
      console.log("accounts", accounts)
      console.log("amounts", amounts.map(amount => amount.toString()))
      console.log("sending batch", i, accounts.length, amounts.length)
      await sendTxn(batchSender.send(token.address,  accounts, amounts), "batchSender.send")

      accounts = []
      amounts = []
    }
  }

  if (accounts.length > 0) {
    console.log("sending final batch", distributionList.length, accounts.length, amounts.length)
    await sendTxn(batchSender.send(token.address,  accounts, amounts), "batchSender.send")
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
