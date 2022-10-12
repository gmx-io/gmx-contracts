const { deployContract, contractAt, sendTxn, callWithRetries } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function main() {
  const token = await contractAt("Token", "0x82af49447d8a07e3bd95bd0d56f35241523fbab1")
  const router = await contractAt("Router", "0xaBBc5F99639c9B6bCb58544ddf04EFA6802F4064")
  // const amount = expandDecimals(3000, 6)
  const amount = "300000000000000000"
  await sendTxn(token.approve(router.address, amount), "router.approve")
  await sendTxn(router.directPoolDeposit(token.address, amount), "router.directPoolDeposit")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
