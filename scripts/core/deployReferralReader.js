const { deployContract, contractAt, writeTmpAddresses, sendTxn } = require("../shared/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

async function main() {
  await deployContract("ReferralReader", [], "ReferralReader")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
