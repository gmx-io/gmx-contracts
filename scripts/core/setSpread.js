const { getFrameSigner, deployContract, contractAt, sendTxn, readTmpAddresses, callWithRetries } = require("../shared/helpers")
const { bigNumberify, expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function getArbValues() {
  const vault = await contractAt("Vault", "0x489ee077994B6658eAfA855C308275EAd8097C4A")
  const vaultPriceFeed = await contractAt("VaultPriceFeed", await vault.priceFeed())
  // const vaultPriceFeed = await contractAt("VaultPriceFeed", "0xfe661cbf27Da0656B7A1151a761ff194849C387A")
  const timelock = await contractAt("PriceFeedTimelock", await vaultPriceFeed.gov())

  const { link, uni } = tokens
  const tokenArr = [link, uni]

  return { vault, vaultPriceFeed, timelock, tokenArr }
}

async function getAvaxValues() {
  const vault = await contractAt("Vault", "0x9ab2De34A33fB459b538c43f251eB825645e8595")
  const vaultPriceFeed = await contractAt("VaultPriceFeed", await vault.priceFeed())
  // const vaultPriceFeed = await contractAt("VaultPriceFeed", "0x205646B93B9D8070e15bc113449586875Ed7288E")
  const timelock = await contractAt("PriceFeedTimelock", await vaultPriceFeed.gov())

  const { avax } = tokens
  const tokenArr = [avax]

  return { vault, vaultPriceFeed, timelock, tokenArr }
}

async function getValues() {
  if (network === "arbitrum") {
    return getArbValues()
  }

  if (network === "avax") {
    return getAvaxValues()
  }
}

async function main() {
  // const signer = await getFrameSigner()

  const { vault, vaultPriceFeed, timelock, tokenArr } = await getValues()

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
