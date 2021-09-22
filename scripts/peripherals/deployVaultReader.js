const { deployContract, contractAt, writeTmpAddresses } = require("../shared/helpers")

async function main() {
  const contract = await deployContract("VaultReader", ["0xDE3590067c811b6F023b557ed45E4f1067859663"], "VaultReader")

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
