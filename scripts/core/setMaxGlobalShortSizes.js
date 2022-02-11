const { getFrameSigner, deployContract, contractAt, sendTxn, readTmpAddresses, callWithRetries } = require("../shared/helpers")
const { bigNumberify, expandDecimals } = require("../../test/shared/utilities")
const { toChainlinkPrice } = require("../../test/shared/chainlink")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function getArbValues(signer) {
  const vault = await contractAt("Vault", "0x489ee077994B6658eAfA855C308275EAd8097C4A")
  const timelock = await contractAt("Timelock", await vault.gov(), signer)

  const { btc, eth, usdc, link, uni, usdt, mim, frax, dai } = tokens
  const tokenArr = [btc, eth, usdc, link, uni, usdt, mim, frax, dai]

  return { vault, timelock, tokenArr }
}

async function getAvaxValues(signer) {
  const vault = await contractAt("Vault", "0x9ab2De34A33fB459b538c43f251eB825645e8595")
  const timelock = await contractAt("Timelock", await vault.gov(), signer)

  const { avax, eth, btc, mim, usdce, usdc } = tokens
  const tokenArr = [avax, eth, btc]

  return { vault, timelock, tokenArr }
}

async function main() {
  const signer = await getFrameSigner()

  let vault, timelock, tokenArr

  if (network === "arbitrum") {
    ;({ vault, timelock, tokenArr }  = await getArbValues(signer));
  }

  if (network === "avax") {
    ;({ vault, timelock, tokenArr }  = await getAvaxValues(signer));
  }

  console.log("vault", vault.address)
  console.log("timelock", timelock.address)

  for (const [i, tokenItem] of tokenArr.entries()) {
    await sendTxn(timelock.setMaxGlobalShortSize(
      vault.address,
      tokenItem.address,
      expandDecimals(tokenItem.maxGlobalShortSize, 30)
    ), `vault.setMaxGlobalShortSize(${tokenItem.name}) ${tokenItem.address}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
