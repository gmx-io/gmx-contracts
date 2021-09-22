const { deployContract, contractAt , sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function main() {
  const gov = await contractAt("Timelock", "0xa870b459ba1f206bbcb0df90ef887b19fcde66ae")
  const vaultPriceFeed = await contractAt("VaultPriceFeed", "0x82b1fa2741a6591d30e61830b1cfda0e7ba3abd3")
  const tokenKeys = ["btc", "eth", "bnb"]

  for (let i = 0; i < tokenKeys.length; i++) {
    const key = tokenKeys[i]
    const token = tokens[key]
    const adjustmentBasisPoints = await vaultPriceFeed.adjustmentBasisPoints(token.address)
    const isAdditive = await vaultPriceFeed.isAdjustmentAdditive(token.address)

    console.log(`${key}: ${isAdditive ? "+" : "-"}${adjustmentBasisPoints}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
