const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function main() {
  const buffer = 24 * 60 * 60
  // const gmx = { address: "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a" }
  const tokenManager = { address: "0x4E29d2ee6973E5Bd093df40ef9d0B28BD56C9e4E" }
  const maxTokenSupply = expandDecimals("13250000", 18)
  const timelock = await deployContract("Timelock", [buffer, tokenManager.address, maxTokenSupply])
  // await sendTxn(timelock.addExcludedToken(gmx.address), "timelock.addExcludedToken(gmx)")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
