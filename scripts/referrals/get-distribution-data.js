const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const ethers = require('ethers')

const ARBITRUM_SUBGRAPH_ENDPOINT = 'https://api.thegraph.com/subgraphs/name/gdev8317/gmx-arbitrum-referrals-staging'
const AVALANCHE_SUBGRAPH_ENDPOINT = 'https://api.thegraph.com/subgraphs/name/gdev8317/gmx-avalanche-referrals-staging'

const BigNumber = ethers.BigNumber
const BASIS_POINTS_DIVISOR = 10000

async function queryDistributionData(network, fromTimestamp, toTimestamp) {
  const subgraphEndpoint = {
    avalanche: AVALANCHE_SUBGRAPH_ENDPOINT,
    arbitrum: ARBITRUM_SUBGRAPH_ENDPOINT
  }[network]

  if (!subgraphEndpoint) {
    throw new Error("Unknown network " + network)
  }

  const query = `
    {
      referrerStats(where: {
        period: daily,
        timestamp_gte: ${fromTimestamp},
        timestamp_lt: ${toTimestamp}
      }) {
        id
        totalRebateUsd
        discountUsd
        timestamp
        volume
        tradedReferralsCount
        trades
        referrer
      }
      referralStats(where: {
        period: daily,
        timestamp_gte: ${fromTimestamp},
        timestamp_lt: ${toTimestamp}
      }) {
        id
        discountUsd
        timestamp
        referral
      }
    }
  `
  const payload = JSON.stringify({query})
  const res = await fetch(subgraphEndpoint, {
    method: 'POST',
    body: payload,
    headers: {'Content-Type': 'application/json'}
  })

  const j = await res.json()
  if (j.errors) {
    throw new Error(JSON.stringify(j))
  }

  const data = j.data

  let allReferrersRebatesUsd = BigNumber.from(0)
  const referrersRebatesData = data.referrerStats.reduce((memo, item) => {
    memo[item.referrer] = memo[item.referrer] || {
      rebatesUsd: BigNumber.from(0),
      volume: BigNumber.from(0),
      tradesCount: 0
    }
    const referrerRebatesUsd = BigNumber.from(item.totalRebateUsd).sub(BigNumber.from(item.discountUsd))
    allReferrersRebatesUsd = allReferrersRebatesUsd.add(referrerRebatesUsd)
    memo[item.referrer].rebatesUsd = memo[item.referrer].rebatesUsd.add(referrerRebatesUsd)
    memo[item.referrer].volume = memo[item.referrer].volume.add(BigNumber.from(item.volume))
    memo[item.referrer].tradesCount += Number(item.trades)
    return memo
  }, {})

  if (allReferrersRebatesUsd.eq(0)) {
    console.warn("No rebates on %s", network)
    return
  }

  Object.entries(referrersRebatesData).forEach(([account, data]) => {
    data.allReferrersRebatesUsd = allReferrersRebatesUsd
    data.account = account
    data.share = data.rebatesUsd.mul(BASIS_POINTS_DIVISOR).div(allReferrersRebatesUsd)
  })

  console.log("\nNetwork: %s", network)

  console.log("Referrers (Affiliates):")
  console.log("Rebates sum: %s ($%s)",
    allReferrersRebatesUsd.toString(),
    ethers.utils.formatUnits(allReferrersRebatesUsd, 30)
  )
  for (const data of Object.values(referrersRebatesData)) {
    console.log("Account: %s Share: %s Volume: %s Trades: %s",
      data.account,
      data.share.toString(),
      data.volume.toString(),
      data.tradesCount
    )
  }

  let allReferralsDiscountUsd = BigNumber.from(0)
  const referralDiscountData = data.referralStats.reduce((memo, item) => {
    memo[item.referral] = memo[item.referral] || {discountUsd: BigNumber.from(0)}
    memo[item.referral].discountUsd = memo[item.referral].discountUsd.add(BigNumber.from(item.discountUsd))
    allReferralsDiscountUsd = allReferralsDiscountUsd.add(BigNumber.from(item.discountUsd))
    return memo
  }, {})

  Object.entries(referralDiscountData).forEach(([account, data]) => {
    data.allReferralsDiscountUsd = allReferralsDiscountUsd
    data.account = account
    data.share = data.discountUsd.mul(BASIS_POINTS_DIVISOR).div(allReferralsDiscountUsd)
  })

  console.log("Referrals (Traders):")
  console.log("Discount sum: %s ($%s)",
    allReferralsDiscountUsd.toString(),
    ethers.utils.formatUnits(allReferralsDiscountUsd, 30)
  )
  for (const data of Object.values(referralDiscountData)) {
    console.log("Account: %s Share: %s", data.account, data.share.toString())
  }

  return { referralDiscountData, referrersRebatesData }
}

async function main() {
  const FROM_TIMESTAMP = 1650402000
  const TO_TIMESTAMP = parseInt(Date.now() / 1000)
  await queryDistributionData("avalanche", FROM_TIMESTAMP, TO_TIMESTAMP)
  await queryDistributionData("arbitrum", FROM_TIMESTAMP, TO_TIMESTAMP)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
