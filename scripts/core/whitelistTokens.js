const { deployContract, contractAt, sendTxn, callWithRetries } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toChainlinkPrice } = require("../../test/shared/chainlink")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function main() {
  const vault = await contractAt("Vault", "0x547a29352421e7273eA18Acce5fb8aa308290523")
  const vaultPriceFeed = await contractAt("VaultPriceFeed", "0x2Ced5a663606592C4e5EF095584D7576682b20F1")
  const timelock = await contractAt("Timelock", "0x51d2E6c7B6cc67875D388aDbE2BB7A8238EA6353")
  console.log("vault", vault.address)
  console.log("vaultPriceFeed", vaultPriceFeed.address)

  const { avax, btc, eth, mim, usdce, usdc, bnb ,busd} = tokens
  const tokenArr = [bnb, btc, busd, eth] // FIXME: Testnet only

  for (const token of tokenArr) {
    // await sendTxn(vaultPriceFeed.setTokenConfig(
    //   token.address, // _token
    //   token.priceFeed, // _priceFeed
    //   token.priceDecimals, // _priceDecimals
    //   token.isStrictStable // _isStrictStable
    // ), `vaultPriceFeed.setTokenConfig(${token.name}) ${token.address} ${token.priceFeed}`)
    console.log( vault.address,
      token.address, // _token
      token.decimals, // _tokenDecimals
      token.tokenWeight, // _tokenWeight
      token.minProfitBps, // _minProfitBps
      expandDecimals(token.maxUsdgAmount, 18), // _maxUsdgAmount
      token.isStable, // _isStable
      token.isShortable // _isShortable
      )
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
