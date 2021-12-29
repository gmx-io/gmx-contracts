const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const holderList = require("../../data/holders/vestedGmxHolders.json")

async function main() {
  const gmxVester = await contractAt("Vester", "0x199070DDfd1CFb69173aa2F7e20906F26B363004")
  const data = []

  console.log("holderList", holderList.length)
  for (let i = 0; i < holderList.length; i++) {
    const account = holderList[i]
    const pairAmount = await gmxVester.pairAmounts(account)
    console.log(`${i+1},${account},${ethers.utils.formatUnits(pairAmount, 18)}`)
    data.push([account, ethers.utils.formatUnits(pairAmount, 18)])
  }

  console.log("final data:")
  console.log(data.map((i) => i.join(",")).join("\n"))
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
