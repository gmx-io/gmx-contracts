const { deployContract, contractAt, writeTmpAddresses, sendTxn } = require("../shared/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

// returns [hasMaxGlobalShortSizes]
function getReaderConfig() {
  if (network === "avax") {
    return [true]
  }
  if (network === "arbitrum") {
    return [false]
  }
}

async function main() {
  const reader = await deployContract("Reader", [], "Reader")
  await sendTxn(reader.setConfig(getReaderConfig()), "Reader.setConfig")

  writeTmpAddresses({
    reader: reader.address
  })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
