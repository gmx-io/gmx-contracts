const { deployContract, contractAt, writeTmpAddresses } = require("../shared/helpers")

async function main() {
  const orderBookReader = await deployContract("OrderBookReader", [])

  writeTmpAddresses({
    orderBookReader: orderBookReader.address
  })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
