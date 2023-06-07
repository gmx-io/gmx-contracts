const fs = require('fs')

const { getArbValues: getArbFeeValues, getAvaxValues: getAvaxFeeValues, getGmxPrice } = require("../peripherals/feeCalculations")
const { getArbValues: getArbServerValues, getAvaxValues: getAvaxServerValues, postFees } = require("../peripherals/serverFees")
const { getArbValues: getArbReferralRewardValues, getAvaxValues: getAvaxReferralRewardValues, getReferralRewardsInfo } = require("../referrals/getReferralRewards")
const { formatAmount, expandDecimals } = require("../../test/shared/utilities")
const { saveDistributionData } = require("../referrals/distributionData")

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000
const MILLISECONDS_PER_WEEK = 7 * MILLISECONDS_PER_DAY

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

const SHOULD_SEND_TXNS = true

function roundToNearestWeek(timestamp, dayOffset) {
  return parseInt(timestamp / MILLISECONDS_PER_WEEK) * MILLISECONDS_PER_WEEK + dayOffset * MILLISECONDS_PER_DAY
}

async function createReferralRewardsRef({ refTimestamp, gmxPrice }) {
  const toTimestampMs = refTimestamp
  const fromTimestampMs = toTimestampMs - MILLISECONDS_PER_WEEK
  const toTimestamp = toTimestampMs / 1000
  const fromTimestamp = fromTimestampMs / 1000

  const account = undefined
  const esGmxRewards = "5000"

  await saveDistributionData(
    "arbitrum",
    fromTimestamp,
    toTimestamp,
    account,
    gmxPrice,
    esGmxRewards
  )

  await saveDistributionData(
    "avalanche",
    fromTimestamp,
    toTimestamp,
    account,
    gmxPrice,
    esGmxRewards
  )
}

async function getFeeValues() {
  const values = {
    arbitrum: await getArbFeeValues(),
    avax: await getAvaxFeeValues()
  }

  const ethPrice = values.arbitrum.nativeTokenPrice
  values.gmxPrice = await getGmxPrice(ethPrice)

  return values
}

function getRefTime() {
  const refTimestamp = roundToNearestWeek(Date.now(), 6)
  const refDate = new Date(refTimestamp)
  const dayName = DAY_NAMES[refDate.getDay()]
  if (dayName !== "Wednesday") {
    throw new Error(`unexpected day: ${dayName}`)
  }

  if (refTimestamp > Date.now()) {
    throw new Error(`refTimestamp is later than current time ${refTimestamp}`)
  }

  const allowedDelay = 6 * 60 * 60 * 1000
  if (refTimestamp < Date.now() - allowedDelay) {
    throw new Error(`refTimestamp is older than the allowed delay`)
  }

  return { refTimestamp, refDate }
}

async function updateServerFees({ feeValues, refTimestamp }) {
  const arbValues = await getArbServerValues()
  const avaxValues = await getAvaxServerValues()

  arbValues.feeUsd = formatAmount(feeValues.arbitrum.feesUsd, 30, 2)
  avaxValues.feeUsd = formatAmount(feeValues.avax.feesUsd, 30, 2)

  const networkValues = [arbValues, avaxValues]

  for (let i = 0; i < networkValues.length; i++) {
    const { apiKey, feeUrl, feeUsd } = networkValues[i]
    console.info("postFees", apiKey, feeUrl, feeUsd, refTimestamp / 1000)
    if (SHOULD_SEND_TXNS) {
      await postFees({
        apiKey,
        feeUrl,
        feeUsd,
        timestamp: refTimestamp / 1000
      })
    }
  }
}

async function saveFeeReference({ feeValues, referralValues, refTimestamp }) {
  const values = feeValues

  // for distribution of accumulated handler fees
  // values.arbitrum.feesUsd = values.arbitrum.feesUsd.add(expandDecimals(206_795, 30))
  // values.avax.feesUsd = values.avax.feesUsd.add(expandDecimals(18_564, 30))

  const keeperCostsArbitrumUsd = values.arbitrum.keeperCosts.mul(values.arbitrum.nativeTokenPrice).div(expandDecimals(1, 18))
  const keeperCostsAvaxUsd = values.avax.keeperCosts.mul(values.avax.nativeTokenPrice).div(expandDecimals(1, 18))

  const feesForGmxAndGlp = {
    arbitrum: values.arbitrum.feesUsd
      .sub(referralValues.arbitrum.allAffiliateUsd)
      .sub(referralValues.arbitrum.allDiscountUsd)
      .sub(keeperCostsArbitrumUsd),
    avax: values.avax.feesUsd
      .sub(referralValues.avax.allAffiliateUsd)
      .sub(referralValues.avax.allDiscountUsd)
      .sub(keeperCostsAvaxUsd)
  }

  const totalStakedGmx = values.arbitrum.stakedGmxSupply.add(values.avax.stakedGmxSupply)
  const glpFees = {
    arbitrum: feesForGmxAndGlp.arbitrum.mul(70).div(100),
    avax: feesForGmxAndGlp.avax.mul(70).div(100)
  }

  const feesForGmx = feesForGmxAndGlp.arbitrum.add(feesForGmxAndGlp.avax).sub(glpFees.arbitrum).sub(glpFees.avax)

  const gmxFees = {
    arbitrum: feesForGmx.mul(values.arbitrum.stakedGmxSupply).div(totalStakedGmx),
    avax: feesForGmx.mul(values.avax.stakedGmxSupply).div(totalStakedGmx)
  }

  const requiredWavaxUsd = glpFees.avax
    .add(gmxFees.avax)
    .add(referralValues.avax.allAffiliateUsd)
    .add(referralValues.avax.allDiscountUsd)
    .add(keeperCostsAvaxUsd)

  const requiredWavaxBalance = requiredWavaxUsd.mul(expandDecimals(1, 18)).div(values.avax.nativeTokenPrice)

  const data = {
    totalFees: values.arbitrum.feesUsd.add(values.avax.feesUsd).toString(),
    arbFees: values.arbitrum.feesUsd.toString(),
    avaxFees: values.avax.feesUsd.toString(),
    requiredWavaxBalance: requiredWavaxBalance.toString(),
    gmxFees: {
      arbitrum: gmxFees.arbitrum.mul(expandDecimals(1, 18)).div(values.arbitrum.nativeTokenPrice).toString(),
      avax: gmxFees.avax.mul(expandDecimals(1, 18)).div(values.avax.nativeTokenPrice).toString(),
    },
    glpFees: {
      arbitrum: glpFees.arbitrum.mul(expandDecimals(1, 18)).div(values.arbitrum.nativeTokenPrice).toString(),
      avax: glpFees.avax.mul(expandDecimals(1, 18)).div(values.avax.nativeTokenPrice).toString(),
    },
    nativeTokenPrice: {
      arbitrum: values.arbitrum.nativeTokenPrice.toString(),
      avax: values.avax.nativeTokenPrice.toString(),
    },
    gmxPrice: values.gmxPrice.toString(),
    traderRebates: referralValues.arbitrum.allDiscountUsd.add(referralValues.avax.allDiscountUsd).toString(),
    affiliateRewards: referralValues.arbitrum.allAffiliateUsd.add(referralValues.avax.allAffiliateUsd).toString(),
    refTimestamp: refTimestamp,
  }

  console.info("data", data)

  const filename = `./fee-reference.json`
  fs.writeFileSync(filename, JSON.stringify(data, null, 4))
}

async function main() {
  const { refTimestamp } = getRefTime()
  const feeValues = await getFeeValues()
  await createReferralRewardsRef({
    refTimestamp,
    gmxPrice: Math.ceil(formatAmount(feeValues.gmxPrice, 30, 2)).toString()
  })

  const referralValues = {
    arbitrum: getReferralRewardsInfo((await getArbReferralRewardValues()).data),
    avax: getReferralRewardsInfo((await getAvaxReferralRewardValues()).data)
  }

  await saveFeeReference({ feeValues, referralValues, refTimestamp })

  await updateServerFees({ feeValues, refTimestamp })
}

main()
