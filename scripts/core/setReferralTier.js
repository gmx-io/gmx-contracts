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
  const timelock = await contractAt("Timelock", await referralStorage.gov())

  const account = "0x5cACae1b51d643CD1bc976cCa9B5E05837a6Bb35"
  const tier = 2 // tier 1, 2, 3
  console.log("account", account)

  const currentTier = (await referralStorage.referrerTiers(account)).add(1)
  console.log("currentTier", currentTier.toString())

  if (!currentTier.eq(1)) {
    throw new Error("Current tier is more than 1")
  }

  console.log("updating to tier", tier)
  await sendTxn(timelock.setReferrerTier(referralStorage.address, account, tier - 1), "timelock.setReferrerTier")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
