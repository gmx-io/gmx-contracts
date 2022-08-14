const { deployContract, sendTxn, writeTmpAddresses, callWithRetries } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function main() {
  const addresses = {}
  addresses.BTC = (await callWithRetries(deployContract, ["FaucetToken", ["Bitcoin (GMX)", "BTC", 8, expandDecimals(1000, 8)]])).address
  addresses.USDC = (await callWithRetries(deployContract, ["FaucetToken", ["USDC Coin (GMX)", "USDC", 6, expandDecimals(1000, 6)]])).address
  addresses.USDT = (await callWithRetries(deployContract, ["FaucetToken", ["Tether (GMX)", "USDT", 6, expandDecimals(1000, 6)]])).address

  writeTmpAddresses(addresses)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
