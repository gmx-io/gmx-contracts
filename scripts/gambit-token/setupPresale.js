const { contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { getWhitelist } = require("../../data/whitelist")

async function main() {
  const wallet = { address: "0x9f169c2189A2d975C18965DE985936361b4a9De9" }
  const gmt = await contractAt("GMT", "0x99e92123eB77Bc8f999316f622e5222498438784")
  const treasury = await contractAt("Treasury", "0xa44E7252a0C137748F523F112644042E5987FfC7")

  const hasActiveMigration = await gmt.hasActiveMigration()
  if (!hasActiveMigration) {
    throw new Error("GMT migration not started")
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
