const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

const usdDecimals = 30

async function checkPrices(vaultPriceFeed1, vaultPriceFeed2, tokenArr) {
  for (let i = 0; i < tokenArr.length; i++) {
    const token = tokenArr[i]
    const maxPrice1 = await vaultPriceFeed1.getPrice(token.address, true, true, true)
    const minPrice1 = await vaultPriceFeed1.getPrice(token.address, false, true, true)
    const diff1 = maxPrice1.sub(minPrice1)
    const spread1 = diff1.mul(1000000).div(minPrice1)

    let maxPrice2, minPrice2, diff2, spread2
    if (vaultPriceFeed2) {
      maxPrice2 = await vaultPriceFeed2.getPrice(token.address, true, true, true)
      minPrice2 = await vaultPriceFeed2.getPrice(token.address, false, true, true)
      diff2 = maxPrice2.sub(minPrice2)
      spread2 = diff2.mul(1000000).div(minPrice2)
    }

    if (vaultPriceFeed2) {
      delta1 = maxPrice1.gt(maxPrice2) ? maxPrice1.sub(maxPrice2) : maxPrice2.sub(maxPrice1)
      delta2 = minPrice1.gt(minPrice2) ? minPrice1.sub(minPrice2) : minPrice2.sub(minPrice1)
      deltaBps1 = delta1.mul(1000000).div(maxPrice1)
      deltaBps2 = delta2.mul(1000000).div(minPrice1)
    }

    console.log(`------------ ${token.name} ------------`)
    console.log("\n1.")
    console.log(`max1: ${ethers.utils.formatUnits(maxPrice1, usdDecimals)}`)
    console.log(`min1: ${ethers.utils.formatUnits(minPrice1, usdDecimals)}`)
    console.log(`diff1: ${ethers.utils.formatUnits(diff1, usdDecimals)}`)
    console.log(`spread1: ${ethers.utils.formatUnits(spread1, 4)}`)
    if (vaultPriceFeed2) {
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
}

async function checkPricesAvax() {
  const vaultPriceFeed1 = await contractAt("VaultPriceFeed", "0x131238112aa25c0D8CD237a6c384d1A86D2BB152")
  // let vaultPriceFeed2
  const vaultPriceFeed2 = await contractAt("VaultPriceFeed", "0x105A9c480aCd14ff57aEFb58e2b658d4275436eB")

  const { avax, btc, eth, mim, usdce, usdc } = tokens
  const tokenArr = [avax, btc, eth, mim, usdce, usdc]

  await checkPrices(vaultPriceFeed1, vaultPriceFeed2, tokenArr)
}

async function checkPricesArb() {
  const vaultPriceFeed1 = await contractAt("VaultPriceFeed", "0xEFF37c0969DcBf69B0b142dAc4e56A0930AECBa8")
  // let vaultPriceFeed2
  const vaultPriceFeed2 = await contractAt("VaultPriceFeed", "0xCe0B06775799f5E3B32D21400CAAdC3BAd6BB1b9")

  const { btc, eth, usdc, link, uni, usdt, mim, frax, dai } = tokens
  const tokenArr = [btc, eth, usdc, link, uni, usdt, mim, frax, dai]

  await checkPrices(vaultPriceFeed1, vaultPriceFeed2, tokenArr)
}

async function main() {
  if (network === "avax") {
    await checkPricesAvax()
    return
  }

  await checkPricesArb()
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
