const { contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toChainlinkPrice } = require("../../test/shared/chainlink")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function main() {
  const vault = await contractAt("Vault", "0x547a29352421e7273eA18Acce5fb8aa308290523")
  const timelock = await contractAt("Timelock", "0x51d2E6c7B6cc67875D388aDbE2BB7A8238EA6353")

  const { btc, eth, bnb, busd} = tokens
  const tokenArr = [bnb, btc, busd, eth]

  for (const token of tokenArr) {
    await sendTxn(timelock.signalVaultSetTokenConfig(
      vault.address,
      token.address, // _token
      token.decimals, // _tokenDecimals
      token.tokenWeight, // _tokenWeight
      token.minProfitBps, // _minProfitBps
      expandDecimals(token.maxUsdgAmount, 18), // _maxUsdoAmount
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
