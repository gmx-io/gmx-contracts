const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function main() {
  const vaultPriceFeed1 = await contractAt("VaultPriceFeed", "0x776d204065e465168eC469DCd0872609154bb505")
  const vaultPriceFeed2 = await contractAt("VaultPriceFeed", "0x1CF4579904EB2ACDA0E4081E39eC10d0c32B5DE3")
  const usdDecimals = 30

  const { btc, eth, usdc, link, uni, usdt } = tokens
  const tokenArr = [btc, eth, usdc, link, uni, usdt]

  for (let i = 0; i < tokenArr.length; i++) {
    const token = tokenArr[i]
    const maxPrice1 = await vaultPriceFeed1.getPrice(token.address, true, true, true)
    const maxPrice2 = await vaultPriceFeed2.getPrice(token.address, true, true, true)
    const minPrice1 = await vaultPriceFeed1.getPrice(token.address, false, true, true)
    const minPrice2 = await vaultPriceFeed2.getPrice(token.address, false, true, true)
    const diff1 = maxPrice1.sub(minPrice1)
    const diff2 = maxPrice2.sub(minPrice2)
    const spread1 = diff1.mul(1000000).div(minPrice1)
    const spread2 = diff2.mul(1000000).div(minPrice2)

    const delta1 = maxPrice1.gt(maxPrice2) ? maxPrice1.sub(maxPrice2) : maxPrice2.sub(maxPrice1)
    const delta2 = minPrice1.gt(minPrice2) ? minPrice1.sub(minPrice2) : minPrice2.sub(minPrice1)
    const deltaBps1 = delta1.mul(1000000).div(maxPrice1)
    const deltaBps2 = delta2.mul(1000000).div(minPrice1)
    console.log(`------------ ${token.name} ------------`)
    console.log("\n1.")
    console.log(`max1: ${ethers.utils.formatUnits(maxPrice1, usdDecimals)}`)
    console.log(`min1: ${ethers.utils.formatUnits(minPrice1, usdDecimals)}`)
    console.log(`diff1: ${ethers.utils.formatUnits(diff1, usdDecimals)}`)
    console.log(`spread1: ${ethers.utils.formatUnits(spread1, 4)}`)
    console.log("\n2.")
    console.log(`max2: ${ethers.utils.formatUnits(maxPrice2, usdDecimals)}`)
    console.log(`min2: ${ethers.utils.formatUnits(minPrice2, usdDecimals)}`)
    console.log(`diff2: ${ethers.utils.formatUnits(diff2, usdDecimals)}`)
    console.log(`spread2: ${ethers.utils.formatUnits(spread2, 4)}`)
    console.log("\n3.")
    console.log(`delta1: ${ethers.utils.formatUnits(deltaBps1, 4)}`)
    console.log(`delta2: ${ethers.utils.formatUnits(deltaBps2, 4)}`)
    if (parseFloat(ethers.utils.formatUnits(deltaBps1, 4)) > 0.7) {
      throw new Error("delta1 exceeds threshold")
    }
    if (parseFloat(ethers.utils.formatUnits(deltaBps2, 4)) > 0.7) {
      throw new Error("delta2 exceeds threshold")
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
