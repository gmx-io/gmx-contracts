const { deployContract } = require("../shared/helpers")

async function main() {
  const batchSender = await deployContract("BatchSender", [])
  return { batchSender }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
