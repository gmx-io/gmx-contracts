const { deployContract } = require("../shared/helpers")

async function main() {
  await deployContract("StakeManager", [])
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
