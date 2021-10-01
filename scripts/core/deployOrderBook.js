const { deployContract, contractAt , sendTxn, writeTmpAddresses } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function main() {
  const orderBook = await deployContract("OrderBook", []);

  // Arbitrum mainnet addresses
  await sendTxn(orderBook.initialize(
    "0xaBBc5F99639c9B6bCb58544ddf04EFA6802F4064", // router
    "0x489ee077994B6658eAfA855C308275EAd8097C4A", // vault
    "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // weth
    "0x45096e7aA921f27590f8F19e457794EB09678141", // usdg
    "500000000000000", // 0.0005 ETH
    expandDecimals(10, 30) // min purchase token amount usd
  ), "orderBook.initialize");

  writeTmpAddresses({
    orderBook: orderBook.address
  })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
