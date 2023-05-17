const { getArbValues, getAvaxValues, getGmxPrice } = require("./feeCalculations")
const { formatAmount } = require("../../test/shared/utilities")

async function main() {
  const values = {
    arbitrum: await getArbValues(),
    avax: await getAvaxValues()
  }

  const ethPrice = values.arbitrum.nativeTokenPrice
  const avaxPrice = values.avax.nativeTokenPrice
  const gmxPrice = await getGmxPrice(ethPrice)

  const data = [
    ["ETH Price", formatAmount(ethPrice, 30, 2)],
    ["AVAX Price", formatAmount(avaxPrice, 30, 2)],
    ["GMX Price", formatAmount(gmxPrice, 30, 2)],
    ["ARB Fees", formatAmount(values.arbitrum.feesUsd, 30, 2)],
    ["AVAX Fees", formatAmount(values.avax.feesUsd, 30, 2)],
    ["ARB sbfGMX", formatAmount(values.arbitrum.stakedGmxSupply, 18, 2)],
    ["AVAX sbfGMX", formatAmount(values.avax.stakedGmxSupply, 18, 2)],
    ["ARB Keeper Costs", formatAmount(values.arbitrum.keeperCosts, 18, 2)],
    ["AVAX Keeper Costs", formatAmount(values.avax.keeperCosts, 18, 2)],
    ["GLP AUM (ARB)", formatAmount(values.arbitrum.glpAum, 30, 2)],
    ["GLP AUM (AVAX)", formatAmount(values.avax.glpAum, 30, 2)],
  ]

  for (let i = 0; i < data.length; i++) {
    const item = data[i]
    console.log([item[0], item[1]].join(","))
  }
}

main()
