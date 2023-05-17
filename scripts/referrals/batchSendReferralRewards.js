const path = require("path")

const { contractAt, sendTxn, processBatch, getFrameSigner } = require("../shared/helpers")
const { expandDecimals, bigNumberify } = require("../../test/shared/utilities")
const { getArbValues, getAvaxValues, sendReferralRewards } = require("./referralRewards")

const gmxPrice = expandDecimals("62", 30)

const nativeTokenPrices = {
  arbitrum: expandDecimals("1855", 30),
  avax: expandDecimals("16", 30)
}

const shouldSendTxn = false

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('../core/tokens')[network];
const nativeToken = tokens.nativeToken

const nativeTokenPrice = nativeTokenPrices[network]

async function getValues() {
  if (network === "arbitrum") {
    return getArbValues()
  }

  if (network === "avax") {
    return getAvaxValues()
  }
}

async function main() {
  let signer
  if (shouldSendTxn) {
    signer = await getFrameSigner()
  }

  const values = await getValues()
  await sendReferralRewards({ signer, shouldSendTxn, nativeToken, nativeTokenPrice, gmxPrice, values })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
