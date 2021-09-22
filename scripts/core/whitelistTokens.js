const { deployContract, contractAt, sendTxn, readTmpAddresses, callWithRetries } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toChainlinkPrice } = require("../../test/shared/chainlink")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function main() {
  const tmpAddresses = readTmpAddresses()

  const vault = await contractAt("Vault", tmpAddresses.vault)
  const vaultPriceFeed = await contractAt("VaultPriceFeed", tmpAddresses.vaultPriceFeed)
  console.log("vault", vault.address)
  console.log("vaultPriceFeed", vaultPriceFeed.address)

  const { btc, eth, usdc } = tokens
  const tokenArr = [btc, eth, usdc]

  for (const token of tokenArr) {
    // await sendTxn(vaultPriceFeed.setTokenConfig(
    //   token.address, // _token
    //   priceFeed.address, // _priceFeed
    //   8, // _priceDecimals
    //   isStrictStable // _isStrictStable
    // ), `vaultPriceFeed.setTokenConfig(${name}) ${token.address} ${priceFeed.address}`)

    await sendTxn(vault.setTokenConfig(
      token.address, // _token
      token.decimals, // _tokenDecimals
      token.tokenWeight, // _tokenWeight
      token.minProfitBps, // _minProfitBps
      token.maxUsdgAmount, // _maxUsdgAmount
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
