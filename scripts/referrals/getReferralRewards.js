const path = require("path")

const { bigNumberify } = require("../../test/shared/utilities")

let arbitrumFile
if (process.env.ARBITRUM_FILE) {
  arbitrumFile = path.join(process.env.PWD, process.env.ARBITRUM_FILE)
} else {
  arbitrumFile = path.join(__dirname, "../../distribution-data-arbitrum.json")
}
console.log("Arbitrum file: %s", arbitrumFile)

let avalancheFile
if (process.env.AVALANCHE_FILE) {
  avalancheFile = path.join(process.env.PWD, process.env.AVALANCHE_FILE)
} else {
  avalancheFile = path.join(__dirname, "../../distribution-data-avalanche.json")
}
console.log("Avalanche file: %s", avalancheFile)

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('../core/tokens')[network];

const { AddressZero } = ethers.constants

async function getArbValues() {
  const data = require(arbitrumFile)

  return { data }
}

async function getAvaxValues() {
  const data = require(avalancheFile)

  return { data }
}

async function getNetworkValues() {
  return [
    await getArbValues(),
    await getAvaxValues()
  ]
}

function getReferralRewardsInfo(data) {
  // console.log("data", data)
  const affiliatesData = data.affiliates
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

module.exports = {
  getArbValues,
  getAvaxValues,
  getReferralRewardsInfo
}
