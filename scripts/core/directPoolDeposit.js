const { deployContract, contractAt, sendTxn, callWithRetries } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function main() {
  const { btc, usdc, usdt } = tokens

  let routerAddress
  if (network === "arbitrum") {
    routerAddress = "0xaBBc5F99639c9B6bCb58544ddf04EFA6802F4064"
  } else if (network === "arbitrumTestnet") {
    routerAddress = "0xe0d4662cdfa2d71477A7DF367d5541421FAC2547"
  } else if (network === "avalanche") {
    routerAddress = "0x5F719c2F1095F7B9fc68a68e35B51194f4b6abe8"
  }

  const router = await contractAt("Router", routerAddress)
  // const amount = "300000000000000000"
  for (const token of [btc, usdc, usdt]) {
    const amount = expandDecimals(10000, token.decimals)
    const tokenContract = await contractAt("Token", token.address)
    await sendTxn(tokenContract.approve(router.address, amount), "router.approve")
    await sendTxn(router.directPoolDeposit(token.address, amount), "router.directPoolDeposit")
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
