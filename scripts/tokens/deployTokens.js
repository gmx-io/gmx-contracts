const { deployContract, sendTxn, writeTmpAddresses, callWithRetries } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function main() {
  const addresses = {}
  addresses.BTC = (await callWithRetries(deployContract, ["FaucetToken", ["Bitcoin", "BTC", 18, expandDecimals(1000, 18)]])).address
  addresses.USDC = (await callWithRetries(deployContract, ["FaucetToken", ["USDC Coin", "USDC", 18, expandDecimals(1000, 18)]])).address
  addresses.USDT = (await callWithRetries(deployContract, ["FaucetToken", ["Tether", "USDT", 18, expandDecimals(1000, 18)]])).address

  writeTmpAddresses(addresses)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
