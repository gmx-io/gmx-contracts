const fs = require('fs')

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { ArgumentParser } = require('argparse');
const ethers = require('ethers')

const ARBITRUM_SUBGRAPH_ENDPOINT = 'https://api.thegraph.com/subgraphs/name/gdev8317/gmx-arbitrum-referrals-staging'
const AVALANCHE_SUBGRAPH_ENDPOINT = 'https://api.thegraph.com/subgraphs/name/gdev8317/gmx-avalanche-referrals-staging'

const BigNumber = ethers.BigNumber
const SHARE_DIVISOR = BigNumber.from("1000000000000000000") // 1e18

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
        volume
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

  let allReferrersRebateUsd = BigNumber.from(0)
  let totalReferralVolume = BigNumber.from(0)
  let totalRebateUsd = BigNumber.from(0)
  const referrersRebatesData = data.referrerStats.reduce((memo, item) => {
    memo[item.referrer] = memo[item.referrer] || {
      rebateUsd: BigNumber.from(0),
      totalRebateUsd: BigNumber.from(0),
      volume: BigNumber.from(0),
      tradesCount: 0
    }
    const referrerRebatesUsd = BigNumber.from(item.totalRebateUsd).sub(BigNumber.from(item.discountUsd))
    allReferrersRebateUsd = allReferrersRebateUsd.add(referrerRebatesUsd)
    memo[item.referrer].rebateUsd = memo[item.referrer].rebateUsd.add(referrerRebatesUsd)
    memo[item.referrer].totalRebateUsd = memo[item.referrer].totalRebateUsd.add(
      BigNumber.from(item.totalRebateUsd)
    )
    memo[item.referrer].volume = memo[item.referrer].volume.add(BigNumber.from(item.volume))
    memo[item.referrer].tradesCount += Number(item.trades)

    totalRebateUsd = totalRebateUsd.add(BigNumber.from(item.totalRebateUsd))
    totalReferralVolume = totalReferralVolume.add(BigNumber.from(item.volume))
    return memo
  }, {})

  if (allReferrersRebateUsd.eq(0)) {
    console.warn("No rebates on %s", network)
    return
  }

  Object.entries(referrersRebatesData).forEach(([account, data]) => {
    data.allReferrersRebateUsd = allReferrersRebateUsd
    data.account = account
    data.share = data.rebateUsd.mul(SHARE_DIVISOR).div(allReferrersRebateUsd)
  })

  const output = {
    fromTimestamp,
    toTimestamp,
    network,
    totalReferralVolume: totalReferralVolume.toString(),
    totalRebateUsd: totalRebateUsd.toString(),
    shareDivisor: SHARE_DIVISOR.toString(),
    referrers: [],
    referrals: []
  }
  console.log("\nTotal referral volume: %s ($%s)",
    totalReferralVolume.toString(),
    Number(ethers.utils.formatUnits(totalReferralVolume, 30)).toFixed(4)
  )
  console.log("Total fees collected from referral traders: %s ($%s)",
    totalReferralVolume.div(1000).toString(),
    Number(ethers.utils.formatUnits(totalReferralVolume.div(1000), 30)).toFixed(4)
  )
  console.log("Total rebates (for Affiliates + Traders): %s ($%s)",
    totalRebateUsd.toString(),
    Number(ethers.utils.formatUnits(totalRebateUsd, 30)).toFixed(4)
  )

  console.log("\nReferrers (Affiliates):")
  console.log("Rebates sum: %s ($%s)",
    allReferrersRebateUsd.toString(),
    Number(ethers.utils.formatUnits(allReferrersRebateUsd, 30)).toFixed(4)
  )
  for (const data of Object.values(referrersRebatesData)) {
    if (data.share.eq(0)) {
      continue
    }
    console.log("Account: %s Share: %s Volume: %s Trades: %s",
      data.account,
      data.share.toString(),
      data.volume.toString(),
      data.tradesCount
    )
    output.referrers.push({
      account: data.account,
      share: data.share.toString(),
      volume: data.volume.toString(),
      tradesCount: data.tradesCount,
      rebateUsd: data.rebateUsd.toString(),
      totalRebateUsd: data.totalRebateUsd.toString(),
    })
  }

  let allReferralsDiscountUsd = BigNumber.from(0)
  const referralDiscountData = data.referralStats.reduce((memo, item) => {
    memo[item.referral] = memo[item.referral] || {
      discountUsd: BigNumber.from(0),
      volume: BigNumber.from(0)
    }
    memo[item.referral].discountUsd = memo[item.referral].discountUsd.add(BigNumber.from(item.discountUsd))
    memo[item.referral].volume = memo[item.referral].volume.add(BigNumber.from(item.volume))
    allReferralsDiscountUsd = allReferralsDiscountUsd.add(BigNumber.from(item.discountUsd))
    return memo
  }, {})

  Object.entries(referralDiscountData).forEach(([account, data]) => {
    data.allReferralsDiscountUsd = allReferralsDiscountUsd
    data.account = account
    data.share = data.discountUsd.mul(SHARE_DIVISOR).div(allReferralsDiscountUsd)
  })

  console.log("Referrals (Traders):")
  console.log("Discount sum: %s ($%s)",
    allReferralsDiscountUsd.toString(),
    Number(ethers.utils.formatUnits(allReferralsDiscountUsd, 30)).toFixed(4)
  )
  for (const data of Object.values(referralDiscountData)) {
    if (data.share.eq(0)) {
      continue
    }
    console.log("Account: %s Share: %s", data.account, data.share.toString())
    output.referrals.push({
      account: data.account,
      share: data.share.toString(),
      discountUsd: data.discountUsd.toString(),
      volume: data.volume.toString()
    })
  }

  fs.writeFileSync(`./distribution-data-${network}.json`, JSON.stringify(output, null, 4))
}

async function main() {
  const FROM_TIMESTAMP = 1650402000
  const TO_TIMESTAMP = parseInt(Date.now() / 1000)

  const parser = new ArgumentParser({
    description: 'Get distribution data'
  });

  parser.add_argument('-n', '--network', {
    help: 'Network: arbitrum, avalanche',
    required: true
  });
  parser.add_argument('-f', '--from-date', {
    help: 'Date from. E.g. 2022-04-20',
    default: "2022-04-20"
  });
  parser.add_argument('-t', '--to-date', {
    help: 'Date to. Exclusive. E.g. 2022-04-27',
    default: "2022-04-27"
  });

  const args = parser.parse_args()

  const fromDate = new Date(args.from_date)
  const fromTimestamp = parseInt(+fromDate / 1000)
  const toDate = new Date(args.to_date)
  const toTimestamp = parseInt(+toDate / 1000)

  console.log("Running script to get distribution data")
  console.log("Network: %s", args.network)
  console.log("From: %s (timestamp %s)", fromDate.toISOString().substring(0, 10), fromTimestamp)
  console.log("To (exclusively): %s (timestamp %s)", toDate.toISOString().substring(0, 10), toTimestamp)

  await queryDistributionData(args.network, fromTimestamp, toTimestamp)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
