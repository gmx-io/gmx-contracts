const { contractAt , sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function getArbValues() {
  const referralStorage = await contractAt("ReferralStorage", "0xe6fab3F0c7199b0d34d7FbE83394fc0e0D06e99d")

  return { referralStorage }
}

async function getAvaxValues() {
  const referralStorage = await contractAt("ReferralStorage", "0x827ED045002eCdAbEb6e2b0d1604cf5fC3d322F8")

  return { referralStorage }
}

async function getValues() {
  if (network === "arbitrum") {
    return getArbValues()
  }

  if (network === "avax") {
    return getAvaxValues()
  }
}

async function main() {
  const { referralStorage } = await getValues()

  const account = "0xD131F1BcDd547e067Af447dD3C36C99d6be9FdEB"
  const tier = 3 // tier 1, 2, 3
  console.log("account", account)

  await sendTxn(referralStorage.setReferrerTier(account, tier - 1), "referralStorage.setReferrerTier")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
