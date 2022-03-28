const { deployContract, contractAt, writeTmpAddresses } = require("../shared/helpers")

async function main() {
  const contract = await deployContract("VaultReader", [], "VaultReader")

  writeTmpAddresses({
    reader: contract.address
  })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
