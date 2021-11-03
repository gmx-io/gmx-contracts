const { deployContract, sendTxn } = require("../shared/helpers")

async function main() {
  const admin = { address: "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8" }
  const token = await deployContract("SnapshotToken", ["GMX Snapshot 1", "GMX 1", 0])
  await sendTxn(token.setInPrivateTransferMode(true), "token.setInPrivateTransferMode")
  await sendTxn(token.setMinter(admin.address, true), "token.setMinter")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
