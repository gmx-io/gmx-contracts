const { formatAmount, expandDecimals, bigNumberify } = require("../../test/shared/utilities")

const feeReference = require("../../fee-reference.json")
const uniswapFeeReference = require("../../uniswap-fee-reference.json")

async function main() {
  if (feeReference.refTimestamp !== uniswapFeeReference.refTimestamp) {
    throw new Error("feeReference.refTimestamp !== uniswapFeeReference.refTimestamp")
  }

  if (feeReference.refTimestamp > Date.now()) {
    throw new Error(`refTimestamp is later than current time ${feeReference.refTimestamp}`)
  }

  const allowedDelay = 10 * 60 * 60 * 1000
  if (feeReference.refTimestamp < Date.now() - allowedDelay) {
    throw new Error(`refTimestamp is older than the allowed delay`)
  }

  const uniswapFees = bigNumberify(uniswapFeeReference.delta).mul(feeReference.nativeTokenPrice.arbitrum).div(expandDecimals(1, 18))

  const text = `\n` +
    `Weekly Rewards Info 🔹\n` +
    `\n` +
    `$${formatAmount(feeReference.totalFees, 30, 2, true)} collected in the past 7 days\n` +
    `\n` +
    `$${formatAmount(feeReference.arbFees, 30, 2, true)} (ARB), $${formatAmount(feeReference.avaxFees, 30, 2, true)} (AVAX), $${formatAmount(uniswapFees, 30, 2, true)} (GMX-ETH)\n` +
    `\n` +
    `To buy and stake $GMX / $GLP: https://gmx.io\n` +
    `\n`

  console.info(text)

  const referralText = `Trader Rebates: $${formatAmount(feeReference.traderRebates, 30, 2, true)}\n` +
    `Affiliate Rewards: $${formatAmount(feeReference.affiliateRewards, 30, 2, true)}\n`

  console.info(referralText)
}

main()
