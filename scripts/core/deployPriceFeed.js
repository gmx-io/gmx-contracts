const { deployContract, contractAt , sendTxn, readTmpAddresses, writeTmpAddresses } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function main() {
  // const tmpAddresses = readTmpAddresses()

  // const vault = await contractAt("Vault", tmpAddresses.vault)
  // const vaultPriceFeed = await contractAt("VaultPriceFeed", "0x30333ce00AC3025276927672aAeFd80f22E89E54")

  // console.log("vault", vault.address)
  // console.log("vaultPriceFeed", vaultPriceFeed.address)

  const signers = ["0xFb11f15f206bdA02c224EDC744b0E50E46137046"]
  const fastPriceFeedGov = { address: "0xEBa076279F41571f7860661eE36665b54F4cA315" }

  const chainlinkFlags = { address: "0x3C14e07Edd0dC67442FA96f1Ec6999c57E810a83" }
  const secondaryPriceFeed = await deployContract("FastPriceFeed", [5 * 60, 250])
  await sendTxn(secondaryPriceFeed.initialize(1, signers), "secondaryPriceFeed.initialize")

  // const secondaryPriceFeed = await contractAt("FastPriceFeed", "0xfAf8C044FF7A040fBc2c48fC6c3180c1d02f91d1")
  const vaultPriceFeed = await deployContract("VaultPriceFeed", [])

  await sendTxn(vaultPriceFeed.setMaxStrictPriceDeviation(expandDecimals(5, 28)), "vaultPriceFeed.setMaxStrictPriceDeviation") // 0.05 USD
  await sendTxn(vaultPriceFeed.setPriceSampleSpace(1), "vaultPriceFeed.setPriceSampleSpace")
  await sendTxn(vaultPriceFeed.setSecondaryPriceFeed(secondaryPriceFeed.address), "vaultPriceFeed.setSecondaryPriceFeed")
  await sendTxn(vaultPriceFeed.setIsAmmEnabled(false), "vaultPriceFeed.setIsAmmEnabled")
  await sendTxn(vaultPriceFeed.setChainlinkFlags(chainlinkFlags.address), "vaultPriceFeed.setChainlinkFlags")

  const { btc, eth, usdc, link, uni, usdt } = tokens
  const tokenArr = [btc, eth, usdc, link, uni, usdt]

  for (const token of tokenArr) {
    await sendTxn(vaultPriceFeed.setTokenConfig(
      token.address, // _token
      token.priceFeed, // _priceFeed
      token.priceDecimals, // _priceDecimals
      token.isStrictStable // _isStrictStable
    ), `vaultPriceFeed.setTokenConfig(${token.name}) ${token.address} ${token.priceFeed}`)
  }

  await sendTxn(secondaryPriceFeed.setTokens([btc.address, eth.address, link.address, uni.address]), "secondaryPriceFeed.setTokens")
  await sendTxn(secondaryPriceFeed.setGov(fastPriceFeedGov.address), "secondaryPriceFeed.setGov")
  // await sendTxn(vault.setPriceFeed(vaultPriceFeed.address), "vault.setPriceFeed")

  writeTmpAddresses({
    vaultPriceFeed: vaultPriceFeed.address
  })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
