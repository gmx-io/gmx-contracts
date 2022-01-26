const { deployContract, contractAt, sendTxn, readTmpAddresses, callWithRetries } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toChainlinkPrice } = require("../../test/shared/chainlink")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function getArbValues(signer) {
  const vault = await contractAt("Vault", "0x489ee077994B6658eAfA855C308275EAd8097C4A")
  const timelock = await contractAt("Timelock", "0xd89EfBEB054340e9c2fe4BCe8f36D1f8a4ae6E0c", signer)

  const { btc, eth, usdc, link, uni, usdt, mim, frax, dai } = tokens
  const tokenArr = [usdc, mim]

  return { vault, timelock, tokenArr }
}

async function getAvaxValues(signer) {
  const vault = await contractAt("Vault", "0x9ab2De34A33fB459b538c43f251eB825645e8595")
  const timelock = await contractAt("Timelock", "0x59c46156ED614164eC66A3CFa5822797f533c902", signer)

  const { avax, btc, eth, mim, usdce, usdc } = tokens
  const tokenArr = [mim, usdce]

  return { vault, timelock, tokenArr }
}

async function main() {
  const frame = new ethers.providers.JsonRpcProvider("http://127.0.0.1:1248")
  const signer = frame.getSigner()

  let vault, timelock, tokenArr

  if (network === "arbitrum") {
    ;({ vault, timelock, tokenArr }  = await getArbValues(signer));
  }

  if (network === "avax") {
    ;({ vault, timelock, tokenArr }  = await getAvaxValues(signer));
  }

  console.log("vault", vault.address)
  console.log("timelock", timelock.address)

  for (const token of tokenArr) {
    await sendTxn(timelock.setTokenConfig(
      vault.address,
      token.address, // _token
      token.tokenWeight, // _tokenWeight
      token.minProfitBps, // _minProfitBps
      expandDecimals(token.maxUsdgAmount, 18) // _maxUsdgAmount
    ), `vault.setTokenConfig(${token.name}) ${token.address}`)

    // await sendTxn(timelock.setBufferAmount(
    //   vault.address,
    //   token.address, // _token
    //   expandDecimals(token.bufferAmount, token.decimals) // _bufferAmount
    // ), `vault.setBufferAmount(${token.name}) ${token.address}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
