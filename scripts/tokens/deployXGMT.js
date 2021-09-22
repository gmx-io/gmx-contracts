const { deployContract } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function main() {
  const initialSupply = expandDecimals(100 * 1000, 18)
  const xgmt = await deployContract("YieldToken", ["xGambit", "xGMT", initialSupply])
  return { xgmt }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
