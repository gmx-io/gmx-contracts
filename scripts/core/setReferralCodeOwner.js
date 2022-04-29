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

  const code = "discount"
  const encodedCode = ethers.utils.formatBytes32String(code)
  const account = await referralStorage.codeOwners(encodedCode)
  console.log("current account", account)

  if (account !== ethers.constants.AddressZero) {
    throw new Error("Code already taken")
  }

  const newAccount = "0x43e37ae780aac89aadd10097bd90d5a79e1192ed"
  await sendTxn(referralStorage.govSetCodeOwner(encodedCode, newAccount), "referralStorage.govSetCodeOwner")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
