const fs = require('fs')

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { ArgumentParser } = require('argparse');
const ethers = require('ethers')

const ARBITRUM_SUBGRAPH_ENDPOINT = 'https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/gmx-arbitrum-referrals/api'
const AVALANCHE_SUBGRAPH_ENDPOINT = 'https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/gmx-avalanche-referrals/api'

const BigNumber = ethers.BigNumber
const { formatUnits, parseUnits } = ethers.utils
const SHARE_DIVISOR = BigNumber.from("1000000000") // 1e9
const BONUS_TIER = 2 // for EsGMX distributions
const USD_DECIMALS = 30
const GMX_DECIMALS = 18

function stringToFixed(s, n) {
  return Number(s).toFixed(n)
}

function bigNumberify(n) {
  return ethers.BigNumber.from(n)
}

function expandDecimals(n, decimals) {
  return bigNumberify(n).mul(bigNumberify(10).pow(decimals))
}

function getSubgraphEndpoint(network) {
  return {
    avalanche: AVALANCHE_SUBGRAPH_ENDPOINT,
    arbitrum: ARBITRUM_SUBGRAPH_ENDPOINT
  }[network]
}

async function requestSubgraph(network, query) {
  const subgraphEndpoint = getSubgraphEndpoint(network)

  if (!subgraphEndpoint) {
    throw new Error("Unknown network " + network)
  }

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

  return j.data
}

async function getAffiliatesTiers(network) {
  const data = await requestSubgraph(network, `{
    affiliates(first: 1000, where: { tierId_in: ["2", "1"]}) {
      id,
      tierId
    }
  }`)

  return data.affiliates.reduce((memo, item) => {
    memo[item.id] = parseInt(item.tierId)
    return memo
  }, {})
}

async function saveDistributionData(network, fromTimestamp, toTimestamp, account, gmxPrice, esgmxRewards) {
  if (gmxPrice) {
    gmxPrice = parseUnits(gmxPrice, USD_DECIMALS)
  }
  if (esgmxRewards) {
    esgmxRewards = parseUnits(esgmxRewards, GMX_DECIMALS)
  }
  let affiliateCondition = ""
  let referralCondition = ""
  if (account) {
    affiliateCondition = `,affiliate: "${account.toLowerCase()}"`
    referralCondition = `,referral: "${account.toLowerCase()}"`
  }

  const getAffiliateStatsQuery = (skip) => `affiliateStats(first: 1000, skip: ${skip}, where: {
      period: daily,
      timestamp_gte: ${fromTimestamp},
      timestamp_lt: ${toTimestamp},
      discountUsd_gt: 0
      ${affiliateCondition}
    }) {
      id
      timestamp
      affiliate
      v1Data {
        totalRebateUsd
        discountUsd
        volume
        trades
      }
    }`

  const getReferralStatsQuery = (skip) => `referralStats(first: 1000, skip: ${skip}, where: {
      period: daily,
      timestamp_gte: ${fromTimestamp},
      timestamp_lt: ${toTimestamp},
      discountUsd_gt: 0
      ${referralCondition}
    }) {
      id
      timestamp
      referral
      v1Data {
        discountUsd
        volume
      }
    }`

  const query = `{
    affiliateStats0: ${getAffiliateStatsQuery(0)}
    affiliateStats1: ${getAffiliateStatsQuery(1000)}
    affiliateStats2: ${getAffiliateStatsQuery(2000)}
    affiliateStats3: ${getAffiliateStatsQuery(3000)}
    affiliateStats4: ${getAffiliateStatsQuery(4000)}
    affiliateStats5: ${getAffiliateStatsQuery(5000)}

    referralStats0: ${getReferralStatsQuery(0)}
    referralStats1: ${getReferralStatsQuery(1000)}
    referralStats2: ${getReferralStatsQuery(2000)}
    referralStats3: ${getReferralStatsQuery(3000)}
    referralStats4: ${getReferralStatsQuery(4000)}
    referralStats5: ${getReferralStatsQuery(5000)}
  }`

  let [data, affiliatesTiers] = await Promise.all([
    requestSubgraph(network, query),
    getAffiliatesTiers(network)
  ])

  const affiliateStats = [
    ...data.affiliateStats0,
    ...data.affiliateStats1,
    ...data.affiliateStats2,
    ...data.affiliateStats3,
    ...data.affiliateStats4,
    ...data.affiliateStats5,
  ]

  const referralStats = [
    ...data.referralStats0,
    ...data.referralStats1,
    ...data.referralStats2,
    ...data.referralStats3,
    ...data.referralStats4,
    ...data.referralStats5,
  ]

  if (referralStats.length === 6000) {
    throw new Error("Referrals stats should be paginated")
  }

  if (affiliateStats.length === 6000) {
    throw new Error("Affiliates stats should be paginated")
  }

  let allAffiliatesRebateUsd = BigNumber.from(0)
  let totalReferralVolume = BigNumber.from(0)
  let bonusTierReferralVolume = BigNumber.from(0)
  let totalRebateUsd = BigNumber.from(0)
  const affiliatesRebatesData = affiliateStats.reduce((memo, item) => {
    const tierId = affiliatesTiers[item.affiliate] || 0
    memo[item.affiliate] = memo[item.affiliate] || {
      rebateUsd: BigNumber.from(0),
      totalRebateUsd: BigNumber.from(0),
      volume: BigNumber.from(0),
      tradesCount: 0,
      tierId
    }
    const affiliateRebatesUsd = BigNumber.from(item.v1Data.totalRebateUsd).sub(BigNumber.from(item.v1Data.discountUsd))
    allAffiliatesRebateUsd = allAffiliatesRebateUsd.add(affiliateRebatesUsd)
    memo[item.affiliate].rebateUsd = memo[item.affiliate].rebateUsd.add(affiliateRebatesUsd)
    memo[item.affiliate].totalRebateUsd = memo[item.affiliate].totalRebateUsd.add(
      BigNumber.from(item.v1Data.totalRebateUsd)
    )
    memo[item.affiliate].volume = memo[item.affiliate].volume.add(BigNumber.from(item.v1Data.volume))
    memo[item.affiliate].tradesCount += Number(item.v1Data.trades)

    totalRebateUsd = totalRebateUsd.add(BigNumber.from(item.v1Data.totalRebateUsd))
    totalReferralVolume = totalReferralVolume.add(BigNumber.from(item.v1Data.volume))
    if (tierId === BONUS_TIER) {
      bonusTierReferralVolume = bonusTierReferralVolume.add(BigNumber.from(item.v1Data.volume))
    }
    return memo
  }, {})

  if (allAffiliatesRebateUsd.eq(0)) {
    console.warn("No rebates on %s", network)
    return
  }

  Object.entries(affiliatesRebatesData).forEach(([account, data]) => {
    data.allAffiliatesRebateUsd = allAffiliatesRebateUsd
    data.account = account
    data.share = data.rebateUsd.mul(SHARE_DIVISOR).div(allAffiliatesRebateUsd)
    data.esgmxUsd
  })
  if (gmxPrice && esgmxRewards) {
    const esgmxRewardsUsdLimit = esgmxRewards.mul(gmxPrice).div(expandDecimals(1, GMX_DECIMALS))
    let esgmxRewardsUsdTotal = BigNumber.from(0)
    Object.values(affiliatesRebatesData).forEach(data => {
      if (data.tierId !== BONUS_TIER) {
        return
      }
      data.esgmxRewardsUsd = data.volume.div(1000).div(20) // 0.1% margin fee, 0.05% of fee is EsGMX bonus rewards
      data.esgmxRewards = data.esgmxRewardsUsd
        .mul(expandDecimals(1, USD_DECIMALS))
        .div(gmxPrice)
        .div(expandDecimals(1, 12))
      esgmxRewardsUsdTotal = esgmxRewardsUsdTotal.add(data.esgmxRewardsUsd)
    })

    if (esgmxRewardsUsdTotal.gt(esgmxRewardsUsdLimit)) {
      const denominator = esgmxRewardsUsdTotal.mul(USD_DECIMALS).div(esgmxRewardsUsdLimit)
      Object.values(affiliatesRebatesData).forEach(data => {
        data.esgmxRewardsUsd = data.esgmxRewardsUsd.mul(USD_DECIMALS).div(denominator)
        data.esgmxRewards = data.esgmxRewardsUsd
          .mul(expandDecimals(1, USD_DECIMALS))
          .div(gmxPrice)
          .div(expandDecimals(1, 12))
      })
    }
  }

  const output = {
    fromTimestamp,
    toTimestamp,
    network,
    totalReferralVolume: totalReferralVolume.toString(),
    totalRebateUsd: totalRebateUsd.toString(),
    shareDivisor: SHARE_DIVISOR.toString(),
    affiliates: [],
    referrals: [],
    gmxPrice,
    esgmxRewards
  }
  console.log("\nTotal referral volume: %s ($%s)",
    totalReferralVolume.toString(),
    Number(formatUnits(totalReferralVolume, USD_DECIMALS)).toFixed(4)
  )
  console.log("Total fees collected from referral traders: %s ($%s)",
    totalReferralVolume.div(1000).toString(),
    Number(formatUnits(totalReferralVolume.div(1000), USD_DECIMALS)).toFixed(4)
  )
  console.log("Total rebates (for Affiliates + Traders): %s ($%s)",
    totalRebateUsd.toString(),
    Number(formatUnits(totalRebateUsd, USD_DECIMALS)).toFixed(4)
  )

  console.log("\nAffiliates (Affiliates):")
  console.log("Rebates sum: %s ($%s)",
    allAffiliatesRebateUsd.toString(),
    Number(formatUnits(allAffiliatesRebateUsd, USD_DECIMALS)).toFixed(4)
  )
  let consoleData = []
  for (const data of Object.values(affiliatesRebatesData)) {
    if (data.share.eq(0)) {
      continue
    }
    consoleData.push({
      affiliate: data.account,
      "share, %": stringToFixed(formatUnits(data.share, 7), 4),
      "volume, $": stringToFixed(formatUnits(data.volume, USD_DECIMALS), 4),
      "rebateUsd, $": stringToFixed(formatUnits(data.rebateUsd, USD_DECIMALS), 4),
      trades: data.tradesCount,
      tierId: data.tierId,
      "esgmxRewards, $": data.esgmxRewardsUsd ? formatUnits(data.esgmxRewardsUsd, USD_DECIMALS) : null,
      esgmxRewards: data.esgmxRewards ? formatUnits(data.esgmxRewards, GMX_DECIMALS) : null,
    })
    output.affiliates.push({
      account: data.account,
      share: data.share.toString(),
      volume: data.volume.toString(),
      tradesCount: data.tradesCount,
      rebateUsd: data.rebateUsd.toString(),
      totalRebateUsd: data.totalRebateUsd.toString(),
      tierId: data.tierId,
      esgmxRewards: data.esgmxRewards ? data.esgmxRewards.toString() : null,
      esgmxRewardsUsd: data.esgmxRewardsUsd ? data.esgmxRewardsUsd.toString() : null,
    })
  }
  console.table(consoleData)

  let allReferralsDiscountUsd = BigNumber.from(0)
  const referralDiscountData = referralStats.reduce((memo, item) => {
    memo[item.referral] = memo[item.referral] || {
      discountUsd: BigNumber.from(0),
      volume: BigNumber.from(0)
    }
    memo[item.referral].discountUsd = memo[item.referral].discountUsd.add(BigNumber.from(item.v1Data.discountUsd))
    memo[item.referral].volume = memo[item.referral].volume.add(BigNumber.from(item.v1Data.volume))
    allReferralsDiscountUsd = allReferralsDiscountUsd.add(BigNumber.from(item.v1Data.discountUsd))
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
    Number(formatUnits(allReferralsDiscountUsd, USD_DECIMALS)).toFixed(4)
  )
  consoleData = []
  for (const data of Object.values(referralDiscountData)) {
    if (data.share.eq(0)) {
      continue
    }
    consoleData.push({
      referral: data.account,
      "share, %": stringToFixed(formatUnits(data.share, 7), 4),
      "volume, $": stringToFixed(formatUnits(data.volume, USD_DECIMALS), 4),
      "discountUsd, $": stringToFixed(formatUnits(data.discountUsd, USD_DECIMALS), 4),
    })
    output.referrals.push({
      account: data.account,
      share: data.share.toString(),
      discountUsd: data.discountUsd.toString(),
      volume: data.volume.toString()
    })
  }
  console.table(consoleData)

  const filename = `./distribution-data-${network}.json`
  fs.writeFileSync(filename, JSON.stringify(output, null, 4))
  console.log("Data saved to: %s", filename)
}

module.exports = {
  saveDistributionData
}
