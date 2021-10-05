const { deployContract, contractAt, sendTxn, readTmpAddresses, callWithRetries } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toChainlinkPrice } = require("../../test/shared/chainlink")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function main() {
  const vault = await contractAt("Vault", "0x489ee077994B6658eAfA855C308275EAd8097C4A")
  const timelock = await contractAt("Timelock", "0xbb8614a9ad437739c9910a9cb2254c608aa7fdb4")

  console.log("vault", vault.address)
  console.log("timelock", timelock.address)

  const { btc, eth, usdc, link, uni, usdt } = tokens
  const tokenArr = [btc, eth, usdc, link, uni, usdt]

  for (const token of tokenArr) {
    await sendTxn(timelock.setTokenConfig(
      vault.address,
      token.address, // _token
      token.tokenWeight, // _tokenWeight
      token.minProfitBps, // _minProfitBps
      expandDecimals(token.maxUsdgAmount, 18) // _maxUsdgAmount
    ), `vault.setTokenConfig(${token.name}) ${token.address}`)

    await sendTxn(timelock.setBufferAmount(
      vault.address,
      token.address, // _token
      expandDecimals(token.bufferAmount, token.decimals) // _bufferAmount
    ), `vault.setBufferAmount(${token.name}) ${token.address}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
