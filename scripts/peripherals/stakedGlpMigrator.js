const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function main() {
  const stakedGlpMigrator = await contractAt("StakedGlpMigrator", "0xE469f60b26A58eF88421AE1FB47a98098c39256c")
  await sendTxn(stakedGlpMigrator.transfer("0xFae58B1F4D70619b0810239Ae5382Af2dBB35860", "100000000000000000"), "stakedGlpMigrator.transfer")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
