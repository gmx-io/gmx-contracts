const { getFrameSigner, deployContract, contractAt, sendTxn, readTmpAddresses, callWithRetries } = require("../shared/helpers")
const { bigNumberify, expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function getArbValues(signer) {
  const vault = await contractAt("Vault", "0x489ee077994B6658eAfA855C308275EAd8097C4A")
  const vaultPriceFeed = await contractAt("VaultPriceFeed", await vault.priceFeed())
  const timelock = await contractAt("Timelock", await vaultPriceFeed.gov(), signer)

  const { link, uni } = tokens
  const tokenArr = [link, uni]

  return { vault, vaultPriceFeed, timelock, tokenArr }
}

async function getAvaxValues(signer) {
  const vault = await contractAt("Vault", "0x9ab2De34A33fB459b538c43f251eB825645e8595")
  const vaultPriceFeed = await contractAt("VaultPriceFeed", await vault.priceFeed())
  const timelock = await contractAt("Timelock", await vaultPriceFeed.gov(), signer)

  const { avax } = tokens
  const tokenArr = [avax]

  return { vault, vaultPriceFeed, timelock, tokenArr }
}

async function main() {
  const signer = await getFrameSigner()

  let vault, vaultPriceFeed, timelock, tokenArr

  if (network === "arbitrum") {
    ;({ vault, vaultPriceFeed, timelock, tokenArr }  = await getArbValues(signer));
  }

  if (network === "avax") {
    ;({ vault, vaultPriceFeed, timelock, tokenArr }  = await getAvaxValues(signer));
  }

  console.log("vault", vault.address)
  console.log("timelock", timelock.address)

  const shouldSendTxn = true

  for (const [i, tokenItem] of tokenArr.entries()) {
    if (shouldSendTxn) {
      await sendTxn(timelock.setSpreadBasisPoints(
        vaultPriceFeed.address,
        tokenItem.address, // _token
        tokenItem.spreadBasisPoints // _spreadBasisPoints
      ), `vault.setSpreadBasisPoints(${tokenItem.name}) ${tokenItem.spreadBasisPoints}`)
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
