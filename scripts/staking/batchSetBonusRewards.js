const { getFrameSigner, deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { DISTRIBUTION_LIST } = require("../../data/esGmxDistribution/distributionList1")

async function main() {
  const signer = await getFrameSigner()

  const wallet = { address: "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8" }
  const timelock = await contractAt("Timelock", "0x3F3E77421E30271568eF7A0ab5c5F2667675341e", signer)
  const esGmx = await contractAt("EsGMX", "0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA")
  const glpVester = await contractAt("Vester", "0xA75287d2f8b217273E7FCD7E86eF07D33972042E")
  const distributionList = DISTRIBUTION_LIST

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
      await sendTxn(timelock.batchSetBonusRewards(glpVester.address,  accounts, amounts), "timelock.batchSetBonusRewards")

      accounts = []
      amounts = []
    }
  }

  if (accounts.length > 0) {
    console.log("sending final batch", distributionList.length, accounts.length, amounts.length)
    await sendTxn(timelock.batchSetBonusRewards(glpVester.address,  accounts, amounts), "timelock.batchSetBonusRewards")
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
