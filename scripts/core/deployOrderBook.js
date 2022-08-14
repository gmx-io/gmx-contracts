const { deployContract, contractAt , sendTxn, writeTmpAddresses } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function initializeOnAvax(orderBook) {
  await sendTxn(orderBook.initialize(
    "0x5F719c2F1095F7B9fc68a68e35B51194f4b6abe8", // router
    "0x9ab2De34A33fB459b538c43f251eB825645e8595", // vault
    nativeToken.address, // weth
    "0xc0253c3cC6aa5Ab407b5795a04c28fB063273894", // usdg
    "10000000000000000", // 0.01 AVAX
    expandDecimals(10, 30) // min purchase token amount usd
  ), "orderBook.initialize");
}

async function initializeOnArbTestnet(orderBook) {
  await sendTxn(orderBook.initialize(
    "0xe0d4662cdfa2d71477A7DF367d5541421FAC2547", // router
    "0xBc9BC47A7aB63db1E0030dC7B60DDcDe29CF4Ffb", // vault
    "0xB47e6A5f8b33b3F17603C83a0535A9dcD7E32681", // weth
    "0xBCDCaF67193Bf5C57be08623278fCB69f4cA9e68", // usdg
    "10000000000000", // 0.00001 WETH, _minExecutionFee
    expandDecimals(10, 30) // 1 usd, min purchase token amount usd
  ), "orderBook.initialize");
}

async function main() {
  const { nativeToken } = tokens

  const orderBook = await deployContract("OrderBook", []);

  if (network === "arbitrumTestnet") {
    await initializeOnArbTestnet(orderBook)
  } else if (network === "avalanche") {
    await initializeOnAvax(orderBook)
  } else {
    throw new Error("Unsupported network " + network)
  }

  // Arbitrum mainnet addresses

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
