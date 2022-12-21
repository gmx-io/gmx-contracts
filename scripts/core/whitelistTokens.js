const { deployContract, contractAt, sendTxn, callWithRetries } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toChainlinkPrice } = require("../../test/shared/chainlink")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function main() {
  const vault = await contractAt("Vault", "0xA57F00939D8597DeF1965FF4708921c56D9A36f3")
  const vaultPriceFeed = await contractAt("VaultPriceFeed", "0xeaE0398FBD233f8b50bCC3Ba9e81F92598B77dd0")
  const timelock = await contractAt("Timelock", "0xa9BF7705162246c7F627eC91866372eA36D8b39D")
  console.log("vault", vault.address)
  console.log("vaultPriceFeed", vaultPriceFeed.address)

  const { avax, btc, eth, mim, usdce, usdc, bnb ,busd} = tokens
  const tokenArr = [ bnb, btc, busd] // FIXME: Testnet only

  for (const token of tokenArr) {
    // await sendTxn(vaultPriceFeed.setTokenConfig(
    //   token.address, // _token
    //   token.priceFeed, // _priceFeed
    //   token.priceDecimals, // _priceDecimals
    //   token.isStrictStable // _isStrictStable
    // ), `vaultPriceFeed.setTokenConfig(${token.name}) ${token.address} ${token.priceFeed}`)

    await sendTxn(timelock.vaultSetTokenConfig(
      vault.address,
      token.address, // _token
      token.decimals, // _tokenDecimals
      token.tokenWeight, // _tokenWeight
      token.minProfitBps, // _minProfitBps
      expandDecimals(token.maxUsdgAmount, 18), // _maxUsdgAmount
      token.isStable, // _isStable
      token.isShortable // _isShortable
    ), `vault.setTokenConfig(${token.name}) ${token.address}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
