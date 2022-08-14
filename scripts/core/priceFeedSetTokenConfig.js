const { getFrameSigner, deployContract, contractAt, sendTxn, readTmpAddresses, callWithRetries } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toChainlinkPrice } = require("../../test/shared/chainlink")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function getArbTestnetValues() {
  const { btc, eth, usdc, usdt } = tokens
  const tokenArr = [btc, eth, usdc, usdt]
   return {
     vaultAddress: "0xBc9BC47A7aB63db1E0030dC7B60DDcDe29CF4Ffb",
     tokenArr
   }
}

async function getArbValues() {
  const signer = await getFrameSigner()
  const { dai } = tokens

  return {
    vaultAddres: "0x489ee077994B6658eAfA855C308275EAd8097C4A",
    tokenArr: [dai],
    signer
  }
}

async function main() {
  let tokenArr, vaultAddress, signer

  if (network === "arbitrum") {
    ({ tokenArr, vaultAddress, signer } = await getArbValues())
  } else if (network === "arbitrumTestnet") {
    ({ tokenArr, vaultAddress, signer } = await getArbTestnetValues())
  } else {
    throw new Error("Unknown network " + network)
  }

  console.log("tokenArr", tokenArr.map(t => t.name))
  console.log("vaultAddress", vaultAddress)

  const vault = await contractAt("Vault", vaultAddress)

  const priceFeed = await contractAt("VaultPriceFeed", await vault.priceFeed())
  const priceFeedGov = await priceFeed.gov()
  const priceFeedTimelock = await contractAt("Timelock", priceFeedGov, signer)

  // const priceFeedMethod = "signalPriceFeedSetTokenConfig"
  const priceFeedMethod = "priceFeedSetTokenConfig"

  console.log("vault", vault.address)
  console.log("priceFeed", priceFeed.address)
  console.log("priceFeedTimelock", priceFeedTimelock.address)
  console.log("priceFeedMethod", priceFeedMethod)

  for (const token of tokenArr) {
    await sendTxn(priceFeedTimelock[priceFeedMethod](
      priceFeed.address, // _vaultPriceFeed
      token.address, // _token
      token.priceFeed, // _priceFeed
      token.priceDecimals, // _priceDecimals
      token.isStrictStable // _isStrictStable
    ), `priceFeed.${priceFeedMethod}(${token.name}) ${token.address}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
