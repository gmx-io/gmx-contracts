const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function main() {
  const stakedGlpMigrator = await contractAt("StakedGlpMigrator", "0xb6336626c56d72EA501B6d14D1AbD356c8AbA240")
  const receiver = "0x7877AdFaDEd756f3248a0EBfe8Ac2E2eF87b75Ac"

  await sendTxn(stakedGlpMigrator.transfer(receiver, "3481836859727875056534554"), "stakedGlpMigrator.transfer")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
