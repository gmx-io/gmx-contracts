const { getFrameSigner, deployContract, contractAt , sendTxn, readTmpAddresses, writeTmpAddresses } = require("../shared/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

async function runArbTestnet() {
  const vaultPriceFeed = await contractAt("VaultPriceFeed", "0x95c648267229b27C74180C0c1f0FA94e49567ECB")
  const gov = await vaultPriceFeed.gov()
  const timelock = await contractAt("Timelock", gov)
  const newGov = "0xFb11f15f206bdA02c224EDC744b0E50E46137046"
  // await sendTxn(timelock.signalSetGov(vaultPriceFeed.address, newGov), `timelock.signalSetGov(${vaultPriceFeed.address}, ${newGov})`)
  // await sendTxn(timelock.setGov(vaultPriceFeed.address, newGov), `timelock.setGov(${vaultPriceFeed.address}, ${newGov})`)

  const fastPriceFeedAddress = "0xE3A717D9C08f17b59D242E36d7322f62F85A83aA"
  await sendTxn(vaultPriceFeed.setSecondaryPriceFeed(fastPriceFeedAddress), `vaultPriceFeed.setSecondaryPriceFeed(${fastPriceFeedAddress})`)
}

async function main() {
  if (network === "arbitrumTestnet") {
    await runArbTestnet()
    return
  }

  throw new Error("Unsupported network " + network)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })

