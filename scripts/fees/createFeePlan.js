const fs = require('fs')

const { processPeriodV1, processPeriodV2, getPeriod, dateToSeconds } = require('../shared/stats');
const { getArbValues: getArbFeeValues, getAvaxValues: getAvaxFeeValues, getGmxPrice } = require("../peripherals/feeCalculations")
const { getArbValues: getArbServerValues, getAvaxValues: getAvaxServerValues, postFees } = require("../peripherals/serverFees")
const { getArbValues: getArbReferralRewardValues, getAvaxValues: getAvaxReferralRewardValues, getReferralRewardsInfo } = require("../referrals/getReferralRewards")
const { formatAmount, expandDecimals } = require("../shared/utilities")
const { saveDistributionData } = require("../referrals/distributionData")

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000
const MILLISECONDS_PER_WEEK = 7 * MILLISECONDS_PER_DAY

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

const SHOULD_SEND_TXNS = true

const MULTIPLIER = process.env.MULTIPLIER || 10000

// Taken from processFees to retreive balances but maybe should export in processFees and import here to avoid duplication?
const FEE_KEEPER = "0xA70C24C3a6Ac500D7e6B1280c6549F2428367d0B" 

function roundToNearestWeek(timestamp, dayOffset) {
    return parseInt(timestamp / MILLISECONDS_PER_WEEK) * MILLISECONDS_PER_WEEK + dayOffset * MILLISECONDS_PER_DAY
  }

async function getFeeValues() {
  const values = {
      arbitrum: await getArbFeeValues(),
      avax: await getAvaxFeeValues()
  }

  const [start, end] = getPeriod('prev')
  
  values.period = { start, end }

  const arbitrumV1 = await processPeriodV1('prev', 'arbitrum')
  const arbitrumV2 = await processPeriodV2('prev', 'arbitrum')

  values.arbitrum.feesUsd = BigInt(arbitrumV1.fees)
  values.arbitrum.feesUsdV2 = BigInt(arbitrumV2.fees)

  const avalancheV1 = await processPeriodV1('prev', 'avalanche')
  const avalancheV2 = await processPeriodV2('prev', 'avalanche')

  values.avax.feesUsd = BigInt(avalancheV1.fees)
  values.avax.feesUsdV2 = BigInt(avalancheV2.fees)

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

async function saveFeePlan({ feeValues, referralValues, refTimestamp }) {
  const values = feeValues

  const totalWethAvailable = // to add: ARB withdrawableBuybackTokenAmountKey + feeKeeper.balance
  const wethPrice = values.arbitrum.nativeTokenPrice
  const totalWethUsdValue = totalWethAvailable.mul(wethPrice)

  const v1FeesUsdArb = values.arbitrum.feesUsd
  const v2FeesUsdArb = values.arbitrum.feesUsdV2.mul(10).div(100)

  const totalFeesForAllocationUsdArb = v1FeesUsdArb.add(v2FeesUsdArb)

  const treasuryChainlinkWethAmount = totalWethAvailable.mul(v2FeesUsdArb).div(totalFeesForAllocationUsdArb)

  const treasuryWethAmount = treasuryChainlinkWethAmount.mul(88).div(100).mul(MULTIPLIER).div(10000)
  const chainlinkWethAmount = treasuryChainlinkWethAmount.mul(12).div(100).mul(MULTIPLIER).div(10000)

  let remainingWeth = totalWethAvailable.sub((treasuryWethAmount).add(chainlinkWethAmount))

  const keeperCostsUsdArb = values.arbitrum.keeperCostsUsd
  const keeperCostsWeth = keeperCostsUsdArb.div(wethPrice)
  remainingWeth = remainingWeth.sub(keeperCostsWeth)

  const referralRewardsUsdArb = referralValues.arbitrum.allAffiliateUsd.add(referralValues.arbitrum.allDiscountUsd)
  const referralRewardsWeth = referralRewardsUsdArb.div(wethPrice)
  remainingWeth = remainingWeth.sub(referralRewardsWeth)

  const expectedGlpWethAmount = totalWethAvailable.mul((totalFeesForAllocationUsdArb.sub(treasuryChainlinkWethAmount)).div(totalFeesForAllocationUsdArb))

  if (remainingWeth.mul(100).div(expectedGlpWethAmount).lt(80)) {
    throw new Error('GLP fees are less than 80% of expected on Arbitrum. Adjust the multiplier.')
  }

  const totalWavaxAvailable = // to add: ARB withdrawableBuybackTokenAmountKey + feeKeeper.balance
  const wavaxPrice = values.avax.nativeTokenPrice
  const totalWavaxUsdValue = totalWavaxAvailable.mul(wavaxPrice)

  const v1FeesUsdAvax = values.avax.feesUsd
  const v2FeesUsdAvax = values.avax.feesUsdV2.mul(10).div(100)

  const totalFeesForAllocationUsdAvax = v1FeesUsdAvax.add(v2FeesUsdAvax)

  const treasuryChainlinkWavaxAmount = totalWavaxAvailable.mul(v2FeesUsdAvax).div(totalFeesForAllocationUsdAvax)

  const treasuryWavaxAmount = treasuryChainlinkWavaxAmount.mul(88).div(100).mul(MULTIPLIER).div(10000)
  const chainlinkWavaxAmount = treasuryChainlinkWavaxAmount.mul(12).div(100).mul(MULTIPLIER).div(10000)

  let remainingWavax = totalWavaxAvailable.sub((treasuryWavaxAmount).add(chainlinkWavaxAmount))

  const keeperCostsUsdAvax = values.avax.keeperCostsUsd
  const keeperCostsWavax = keeperCostsUsdAvax.div(wavaxPrice)
  remainingWavax = remainingWavax.sub(keeperCostsWavax)

  const referralRewardsUsdAvax = referralValues.avax.allAffiliateUsd.add(referralValues.avax.allDiscountUsd)
  const referralRewardsWavax = referralRewardsUsdAvax.div(wavaxPrice)
  remainingWavax = remainingWavax.sub(referralRewardsWavax)

  const expectedGlpWavaxAmount = totalWavaxAvailable.mul((totalFeesForAllocationUsdAvax.sub(treasuryChainlinkWavaxAmount)).div(totalFeesForAllocationUsdAvax))

  if (remainingWavax.mul(100).div(expectedGlpWavaxAmount).lt(80)) {
    throw new Error('GLP fees are less than 80% of expected on Avalanche. Adjust the multiplier.')
  }

  const data = {
    treasuryFees: {
      arbitrum: treasuryWethAmount.toString(),
      avalanche: treasuryWavaxAmount.toString()
    },
    chainlinkFees: {
      arbitrum: chainlinkWethAmount.toString(),
      avalanche: chainlinkWavaxAmount.toString()
    },
    keeperCosts: {
      arbitrum: keeperCostsWeth.toString(),
      avalanche: keeperCostsWavax.toString()
    },
    referralRewards: {
      arbitrum: referralRewardsWeth.toString(),
      avalanche: referralRewardsWavax.toString()
    },
    glpFees: {
      arbitrum: remainingWeth.toString(),
      avalanche: remainingWavax.toString()
    },
    nativeTokenPrice: {
      arbitrum: values.arbitrum.nativeTokenPrice.toString(),
      avax: values.avax.nativeTokenPrice.toString(),
    },
    gmxPrice: values.gmxPrice.toString(),
    refTimestamp: refTimestamp,
  }

  console.info("data", data)

  console.info(`ETH price: $${formatAmount(data.nativeTokenPrice.arbitrum, 30, 2, true)}`)
  console.info(`AVAX price: $${formatAmount(data.nativeTokenPrice.avax, 30, 2, true)}`)
  
  // more console logs to be added

  const filename = `./fee-plan.json`
  fs.writeFileSync(filename, JSON.stringify(data, null, 4))
}

async function main() {
  const { refTimestamp } = getRefTime()
  const feeValues = await getFeeValues()

  const referralValues = {
    arbitrum: getReferralRewardsInfo((await getArbReferralRewardValues()).data),
    avax: getReferralRewardsInfo((await getAvaxReferralRewardValues()).data)
  }

  await saveFeePlan({ feeValues, referralValues, refTimestamp })
}

main()