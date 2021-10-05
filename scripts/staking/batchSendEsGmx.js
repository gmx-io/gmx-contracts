const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { DISTRIBUTION_LIST } = require("../../data/esGmxDistribution/distributionList1")

async function main() {
  const wallet = { address: "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8" }
  const esGmx = await contractAt("EsGMX", "0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA")
  const batchSender = await contractAt("BatchSender", "0x401Ab96410BcdCA81b79c68D0D664D478906C184")
  const distributionList = DISTRIBUTION_LIST

  await sendTxn(esGmx.approve(batchSender.address, expandDecimals(100 * 1000, 18)), "esGmx.approve")
  console.log("processing list", distributionList.length)

  const batchSize = 30
  let accounts = []
  let amounts = []

  for (let i = 0; i < distributionList.length; i++) {
    const [account, amount] = distributionList[i]
    accounts.push(account)
    amounts.push(ethers.utils.parseUnits(amount, 18))

    if (accounts.length === batchSize) {
      console.log("accounts", accounts)
      console.log("amounts", amounts.map(amount => amount.toString()))
      console.log("sending batch", i, accounts.length, amounts.length)
      await sendTxn(batchSender.send(esGmx.address,  accounts, amounts), "batchSender.send")

      accounts = []
      amounts = []
    }
  }

  if (accounts.length > 0) {
    console.log("sending final batch", distributionList.length, accounts.length, amounts.length)
    await sendTxn(batchSender.send(esGmx.address,  accounts, amounts), "batchSender.send")
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
