const { deployContract, contractAt, sendTxn, readTmpAddresses, callWithRetries } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toChainlinkPrice } = require("../../test/shared/chainlink")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function main() {
  const vault = await contractAt("Vault", "0x489ee077994B6658eAfA855C308275EAd8097C4A")
  const timelock = await contractAt("Timelock", "0xbb8614a9ad437739c9910a9cb2254c608aa7fdb4")
  const method = "signalVaultSetTokenConfig"
  // const method = "vaultSetTokenConfig"

  console.log("vault", vault.address)
  console.log("timelock", timelock.address)
  console.log("method", method)

  const tokenWeight = 100
  const maxUsdgAmount = "50000000000000000000"

  const { link, uni, usdt } = tokens
  const tokenArr = [link, uni, usdt]

  for (const token of tokenArr) {
    await sendTxn(timelock[method](
      vault.address,
      token.address, // _token
      token.decimals, // _tokenDecimals
      tokenWeight, // _tokenWeight
      token.minProfitBps, // _minProfitBps
      maxUsdgAmount, // _maxUsdgAmount
      token.isStable, // _isStable
      token.isShortable // _isShortable
    ), `vault.signalVaultSetTokenConfig(${token.name}) ${token.address}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
