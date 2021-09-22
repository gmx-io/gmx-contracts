const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function main() {
  const btcPriceFeed = await contractAt("PriceFeed", "0x264990fbd0A4796A3E3d8E37C4d5F87a3aCa5Ebf")
  const ethPriceFeed = await contractAt("PriceFeed", "0x9ef1B8c0E4F7dc8bF5719Ea496883DC6401d5b2e")
  const bnbPriceFeed = await contractAt("PriceFeed", "0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE")
  const busdPriceFeed = await contractAt("PriceFeed", "0xcBb98864Ef56E9042e7d2efef76141f15731B82f")
  const usdcPriceFeed = await contractAt("PriceFeed", "0x51597f405303C4377E36123cBc172b13269EA163")
  const usdtPriceFeed = await contractAt("PriceFeed", "0xB97Ad0E74fa7d920791E90258A6E2085088b4320")
  const priceDecimals = 8

  const btc = {
    symbol: "BTC",
    address: "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c",
    priceFeed: btcPriceFeed
  }
  const eth = {
    symbol: "ETH",
    address: "0x2170ed0880ac9a755fd29b2688956bd959f933f8",
    priceFeed: ethPriceFeed
  }
  const bnb = {
    symbol: "BNB",
    address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    priceFeed: bnbPriceFeed
  }
  const busd = {
    symbol: "BUSD",
    address: "0xe9e7cea3dedca5984780bafc599bd69add087d56",
    priceFeed: busdPriceFeed
  }
  const usdc = {
    symbol: "USDC",
    address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
    priceFeed: usdcPriceFeed
  }
  const usdt = {
    symbol: "USDT",
    address: "0x55d398326f99059fF775485246999027B3197955",
    priceFeed: usdtPriceFeed
  }

  const tokens = [btc, eth, bnb, busd, usdc, usdt]

  const now = parseInt(Date.now() / 1000)

  for (let i = 0; i < tokens.length; i++) {
    const { symbol, priceFeed } = tokens[i]
    const latestRound = await priceFeed.latestRound()

    for (let j = 0; j < 5; j++) {
      const roundData = await priceFeed.getRoundData(latestRound.sub(j))
      const answer = roundData[1]
      const updatedAt = roundData[3]
      console.log(`${symbol} ${j}: ${ethers.utils.formatUnits(answer, priceDecimals)}, ${updatedAt}, ${updatedAt.sub(now).toString()}s, ${updatedAt.sub(now).div(60).toString()}m`)
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
