const { contractAt, sendTxn } = require("../shared/helpers")

async function main() {
  const treasury = await contractAt("Treasury", "0xa44E7252a0C137748F523F112644042E5987FfC7")
  const gmt = await contractAt("GMT", "0x99e92123eB77Bc8f999316f622e5222498438784")

  // await sendTxn(treasury.addLiquidity(), "treasury.addLiquidity")
  await sendTxn(gmt.endMigration(), "gmt.endMigration")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
