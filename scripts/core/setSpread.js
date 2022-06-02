const { getFrameSigner, deployContract, contractAt, sendTxn, readTmpAddresses, callWithRetries } = require("../shared/helpers")
const { bigNumberify, expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function getArbValues(signer) {
  const vault = await contractAt("Vault", "0x489ee077994B6658eAfA855C308275EAd8097C4A")
  const vaultPriceFeed = await contractAt("VaultPriceFeed", await vault.priceFeed())
  // const vaultPriceFeed = await contractAt("VaultPriceFeed", "0xa18BB1003686d0854EF989BB936211c59EB6e363")
  const timelock = await contractAt("Timelock", await vaultPriceFeed.gov(), signer)

  const { link, uni } = tokens
  const tokenArr = [link, uni]

  return { vault, vaultPriceFeed, timelock, tokenArr }
}

async function getAvaxValues(signer) {
  const vault = await contractAt("Vault", "0x9ab2De34A33fB459b538c43f251eB825645e8595")
  const vaultPriceFeed = await contractAt("VaultPriceFeed", await vault.priceFeed())
  // const vaultPriceFeed = await contractAt("VaultPriceFeed", "0x81b7e71A1D9E08a6Ca016A0F4D6Fa50DBCE89Ee3")
  const timelock = await contractAt("Timelock", await vaultPriceFeed.gov(), signer)

  const { avax } = tokens
  const tokenArr = [avax]

  return { vault, vaultPriceFeed, timelock, tokenArr }
}

async function getValues(signer) {
  if (network === "arbitrum") {
    return getArbValues(signer)
  }

  if (network === "avax") {
    return getAvaxValues(signer)
  }
}

async function main() {
  const signer = await getFrameSigner()

  const { vault, vaultPriceFeed, timelock, tokenArr } = await getValues(signer)

  console.log("vault", vault.address)
  console.log("timelock", timelock.address)

  const shouldSendTxn = true

  for (const [i, tokenItem] of tokenArr.entries()) {
    if (shouldSendTxn) {
      await sendTxn(timelock.setSpreadBasisPoints(
        vaultPriceFeed.address,
        tokenItem.address, // _token
        tokenItem.spreadBasisPoints // _spreadBasisPoints
      ), `vaultPriceFeed.setSpreadBasisPoints(${tokenItem.name}) ${tokenItem.spreadBasisPoints}`)
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
