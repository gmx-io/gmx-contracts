const { deployContract, contractAt , sendTxn, writeTmpAddresses, callWithRetries } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function main() {
  const {
    nativeToken
  } = tokens

  const vault = await contractAt("Vault", "0xA57F00939D8597DeF1965FF4708921c56D9A36f3")
  const usdg = await contractAt("USDG", "0x3eE22225949541aaACCBd1B43289147fb3ad97f1")
  const glp = await contractAt("OAP", "0xC6012955CEF9137FE9B1C01361c41FBf7E8dFfD9")

  const glpManager = await contractAt("GlpManager", "0xD3ce791f179C7e6DCF641F98417fC10f47Fc986b")

  await sendTxn(glp.setMinter(glpManager.address, true), "glp.setMinter")
  await sendTxn(usdg.addVault(glpManager.address), "usdg.removeVault")
  await sendTxn(vault.setManager(glpManager.address, true), "vault.setManager")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
