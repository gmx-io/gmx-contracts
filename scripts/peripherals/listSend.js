const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals, bigNumberify } = require("../../test/shared/utilities")
const { LIST } = require("../../data/batchSend/list")

async function main() {
  const list = LIST
  const usdc = await contractAt("Token", "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8")
  const usdcDecimals = 6
  const gmx = await contractAt("Token", "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a")
  const gmxDecimals = 18
  const shouldSendTxn = false

  const minCount = 0
  let count = 0

  let totalUsdc = bigNumberify(0)
  let totalGmx = bigNumberify(0)

  for (let i = 0; i < list.length; i++) {
    const item = list[i]
    if (item.usdc && parseFloat(item.usdc) !== 0) {
      count++
      const amount = ethers.utils.parseUnits(item.usdc, usdcDecimals)
      totalUsdc = totalUsdc.add(amount)
      if (shouldSendTxn && count >= minCount) {
        await sendTxn(usdc.transfer(item.account, amount), `${count}: usdc.transfer(${item.account}, ${amount})`)
      }
    }
    if (item.gmx && parseFloat(item.gmx) !== 0) {
      count++
      const amount = ethers.utils.parseUnits(item.gmx, gmxDecimals)
      totalGmx = totalGmx.add(amount)
      if (shouldSendTxn && count >= minCount) {
        await sendTxn(gmx.transfer(item.account, amount), `${count}: gmx.transfer(${item.account}, ${amount})`)
      }
    }
  }

  console.log("total USDC", ethers.utils.formatUnits(totalUsdc, usdcDecimals))
  console.log("total GMX", ethers.utils.formatUnits(totalGmx, gmxDecimals))
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
