const { getArbValues, getAvaxValues, getReferralRewardsInfo } = require("./getReferralRewards")

async function getNetworkValues() {
  return [
    await getArbValues(),
    await getAvaxValues()
  ]
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
