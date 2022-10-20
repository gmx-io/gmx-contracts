const fs = require('fs')
const path = require('path')

const { ArgumentParser } = require('argparse');
const ethers = require('ethers')

const BigNumber = ethers.BigNumber

async function main() {
  const parser = new ArgumentParser({
    description: 'Get other between distribution data (`base-file` - `other-file`)'
  });

  parser.add_argument('-b', '--base-file', {
    help: 'Distribution file with up-to-date data',
    required: true
  });

  parser.add_argument('-o', '--other-file', {
    help: 'Distribution file to subtract',
    required: true
  });

  const args = parser.parse_args()

  const baseData = require(path.join(process.env.PWD, args.base_file))
  const otherData = require(path.join(process.env.PWD, args.other_file))

  if (baseData.fromTimestamp !== otherData.fromTimestamp) {
    throw new Error('`fromTimestamp` does not match')
  }
  if (baseData.toTimestamp !== otherData.toTimestamp) {
    throw new Error('`toTimestamp` does not match')
  }
  if (baseData.network !== otherData.network) {
    throw new Error('`network` does not match')
  }

  const otherTradersDataByAccount = {}
  for (const x of otherData.referrals) {
    if (otherTradersDataByAccount[x.account]) {
      throw new Error(`not unique referral ${x.account}`)
    }
    otherTradersDataByAccount[x.account] = x
  }

  const otherReferrersDataByAccount = {}
  for (const x of otherData.referrers) {
    if (otherReferrersDataByAccount[x.account]) {
      throw new Error(`not unique referrer ${x.account}`)
    }
    otherReferrersDataByAccount[x.account] = x
  }

  const output = {
    gmxPrice: baseData.gmxPrice,
    esgmxRewards: baseData.esgmxRewards,
    fromTimestamp: baseData.fromTimestamp,
    toTimestamp: baseData.toTimestamp,
    network: baseData.network,
    shareDivisor: baseData.shareDivisor,
    totalReferralVolume: BigNumber.from(baseData.totalReferralVolume).sub(
      BigNumber.from(otherData.totalReferralVolume)
    ).toString(),
    baseTotalReferralVolume: baseData.totalReferralVolume,
    otherTotalReferralVolume: otherData.totalReferralVolume,

    totalRebateUsd: BigNumber.from(baseData.totalRebateUsd).sub(
      BigNumber.from(otherData.totalRebateUsd)
    ).toString(),
    baseTotalRebateUsd: baseData.totalRebateUsd,
    otherTotalRebateUsd: otherData.totalRebateUsd,
  }

  output.referrers = baseData.referrers.map(x => {
    const y = otherReferrersDataByAccount[x.account]
    if (!y) {
      return
    }
    return {
      account: x.account,

      volume: BigNumber.from(x.volume).sub(BigNumber.from(y.volume)).toString(),
      baseVolume: x.volume,
      otherVolume: y.volume,

      rebateUsd: BigNumber.from(x.rebateUsd).sub(BigNumber.from(y.rebateUsd)).toString(),
      baseRebateUsd: x.rebateUsd,
      otherRebateUsd: y.rebateUsd,

      totalRebateUsd: BigNumber.from(x.totalRebateUsd).sub(BigNumber.from(y.totalRebateUsd)).toString(),
      baseTotalRebateUsd: x.totalRebateUsd,
      otherTotalRebateUsd: y.totalRebateUsd,

      tradesCount: x.tradesCount - y.tradesCount,
      baseTradesCount: x.tradesCount,
      otherTradesCount: y.tradesCount,

      esgmxRewards: BigNumber.from(x.esgmxRewards || 0).sub(BigNumber.from(y.esgmxRewards || 0)).toString(),
      baseEsgmxRewards: x.esgmxRewards || 0,
      otherEsgmxRewards: y.esgmxRewards || 0,

      esgmxRewardsUsd: BigNumber.from(x.esgmxRewardsUsd || 0).sub(BigNumber.from(y.esgmxRewardsUsd || 0)).toString(),
      baseEsgmxRewardsUsd: x.esgmxRewardsUsd,
      otherEsgmxRewardsUsd: y.esgmxRewardsUsd,

      tierId: x.tierId,
    }
  }).filter(x => x)

  output.referrals = baseData.referrals.map(x => {
    const y = otherTradersDataByAccount[x.account]
    if (!y) {
      return
    }
    return {
      account: x.account,

      volume: BigNumber.from(x.volume).sub(BigNumber.from(y.volume)).toString(),
      baseVolume: x.volume,
      otherVolume: y.volume,

      discountUsd: BigNumber.from(x.discountUsd).sub(BigNumber.from(y.discountUsd)).toString(),
      baseDiscountUsd: x.discountUsd,
      otherDiscountUsd: y.discountUsd,
    }
  }).filter(x => x)

  for (const [prop, precision] of [
    ['volume', 1e30],
    ['esgmxRewards', 1e18],
    ['esgmxRewardsUsd', 1e30],
    ['totalRebateUsd', 1e30],
  ]) {
    const capitalizedProp = prop[0].toUpperCase() + prop.slice(1)
    const totalDiff = output.referrers.reduce((sum, x) => sum.add(x[prop] || 0), BigNumber.from(0))
    const totalBase = output.referrers.reduce((sum, x) => sum.add(x[`base${capitalizedProp}`] || 0), BigNumber.from(0))
    const totalOther = output.referrers.reduce((sum, x) => sum.add(x[`other${capitalizedProp}`] || 0), BigNumber.from(0))
    console.log("\nTotal diff %s %s (%s)\n\tbase: %s (%s)\n\tother: %s (%s)",
      prop,
      (totalDiff.toString() / precision).toFixed(2),
      totalDiff.toString(),
      (totalBase.toString() / precision).toFixed(2),
      totalBase.toString(),
      (totalOther.toString() / precision).toFixed(2),
      totalOther.toString(),
    )
  }

  const network = baseData.network
  const filename = `./distribution-data-${network}-diff.json`
  fs.writeFileSync(filename, JSON.stringify(output, null, 4))
  console.log("Data saved to: %s", filename)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })

