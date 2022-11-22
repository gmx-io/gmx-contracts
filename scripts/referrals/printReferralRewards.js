const path = require("path")

const { deployContract, contractAt, sendTxn, processBatch, getFrameSigner } = require("../shared/helpers")
const { expandDecimals, bigNumberify } = require("../../test/shared/utilities")

const avaxPrice = "14"
const gmxPrice = "43"

const shouldSendTxn = false

let arbitrumFile
if (process.env.ARBITRUM_FILE) {
  arbitrumFile = path.join(process.env.PWD, process.env.ARBITRUM_FILE)
} else {
  arbitrumFile = path.join(__dirname, "../../distribution-data-arbitrum.json")
}
console.log("Arbitrum file: %s", arbitrumFile)
const arbitrumData = require(arbitrumFile)

let avalancheFile
if (process.env.AVALANCHE_FILE) {
  avalancheFile = path.join(process.env.PWD, process.env.AVALANCHE_FILE)
} else {
  avalancheFile = path.join(__dirname, "../../distribution-data-avalanche.json")
}
console.log("Avalanche file: %s", avalancheFile)
const avaxData = require(avalancheFile)

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('../core/tokens')[network];

const { AddressZero } = ethers.constants

async function getArbValues() {
  const data = arbitrumData

  return { data }
}

async function getAvaxValues() {
  const data = avaxData

  return { data }
}

async function getNetworkValues() {
  return [
    await getArbValues(),
    await getAvaxValues()
  ]
}

function getReferralRewardsInfo(data) {
  const affiliatesData = data.referrers
  const discountsData = data.referrals

  console.log("affiliates", affiliatesData.length)
  console.log("trader discounts", discountsData.length)

  let allAffiliateUsd = bigNumberify(0)
  let allDiscountUsd = bigNumberify(0)

  for (let i = 0; i < affiliatesData.length; i++) {
    const { rebateUsd } = affiliatesData[i]
    allAffiliateUsd = allAffiliateUsd.add(rebateUsd)
  }

  for (let i = 0; i < discountsData.length; i++) {
    const { discountUsd } = discountsData[i]
    allDiscountUsd = allDiscountUsd.add(discountUsd)
  }

  console.log("all affiliate rewards (USD)", ethers.utils.formatUnits(allAffiliateUsd, 30))
  console.log("all trader rebates (USD)", ethers.utils.formatUnits(allDiscountUsd, 30))

  return {
    allAffiliateUsd,
    allDiscountUsd
  }
}

async function main() {
  const wallet = { address: "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8" }
  const values = await getNetworkValues()

  let totalAffiliateUsd = bigNumberify(0)
  let totalDiscountUsd = bigNumberify(0)

  for (let i = 0; i < values.length; i++) {
    const { data } = values[i]
    const rewardsInfo = getReferralRewardsInfo(data)
    totalAffiliateUsd = totalAffiliateUsd.add(rewardsInfo.allAffiliateUsd)
    totalDiscountUsd = totalDiscountUsd.add(rewardsInfo.allDiscountUsd)
  }

  console.log("Trader Rebates:", ethers.utils.formatUnits(totalDiscountUsd, 30))
  console.log("Affiliate Rewards:", ethers.utils.formatUnits(totalAffiliateUsd, 30))
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
