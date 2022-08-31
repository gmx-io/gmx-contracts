const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function checkTokenConfig(tokenArr) {
  for (let i = 0; i < tokenArr.length; i++) {
    const tokenInfo = tokenArr[i]
    const token = await contractAt("Token", tokenInfo.address)
    const name = await token.name()
    const symbol = await token.symbol()
    const decimals = await token.decimals()
    const priceFeed = await contractAt("PriceFeed", tokenInfo.priceFeed)
    const priceDecimals = await priceFeed.decimals()

    if (tokenInfo.decimals.toString() !== decimals.toString())  {
      throw new Error(`Invalid decimals, ${tokenInfo.decimals.toString()}, ${decimals.toString()}`)
    }

    if (tokenInfo.priceDecimals.toString() !== priceDecimals.toString())  {
      throw new Error(`Invalid price decimals, ${tokenInfo.priceDecimals.toString()}, ${priceDecimals.toString()}`)
    }

    console.log(`${tokenInfo.name}, ${name}, ${symbol}, ${token.address}`)
    console.log(`token decimals: ${tokenInfo.decimals}, ${decimals.toString()}`)
    console.log(`price decimals: ${tokenInfo.priceDecimals}, ${priceDecimals.toString()}`)
    console.log(`price feed: ${await priceFeed.description()}`)
    console.log(`isShortable: ${tokenInfo.isShortable}, isStable: ${tokenInfo.isStable}, isStrictStable: ${tokenInfo.isStrictStable}`)
    console.log("\n-------\n")
  }
}

async function checkTokenConfigAvax() {
  const { avax, btc, btcb, eth, mim, usdce, usdc } = tokens
  const tokenArr = [avax, btc, btcb, eth, mim, usdce, usdc]

  await checkTokenConfig(tokenArr)
}

async function checkTokenConfigArb() {
  const { btc, eth, usdc, link, uni, usdt, mim, frax, dai } = tokens
  const tokenArr = [btc, eth, usdc, link, uni, usdt, mim, frax, dai]

  await checkTokenConfig(tokenArr)
}

async function main() {
  if (network === "avax") {
    await checkTokenConfigAvax()
    return
  }

  await checkTokenConfigArb()
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
