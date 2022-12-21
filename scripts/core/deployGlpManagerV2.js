const { deployContract, contractAt , sendTxn, writeTmpAddresses, callWithRetries } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function getArbValues() {
  const vault = { address: "0x489ee077994B6658eAfA855C308275EAd8097C4A" }
  const usdg = { address: "0x45096e7aA921f27590f8F19e457794EB09678141" }
  const glp = { address: "0x4277f8F2c384827B5273592FF7CeBd9f2C1ac258" }
  const shortsTracker = { address: "0xf58eEc83Ba28ddd79390B9e90C4d3EbfF1d434da" }

  return { vault, usdg, glp, shortsTracker }
}

async function getAvaxValues() {
  const vault = { address: "0x9ab2De34A33fB459b538c43f251eB825645e8595" }
  const usdg = { address: "0xc0253c3cC6aa5Ab407b5795a04c28fB063273894" }
  const glp = { address: "0x01234181085565ed162a948b6a5e88758CD7c7b8" }
  const shortsTracker = { address: "0x9234252975484D75Fd05f3e4f7BdbEc61956D73a" }

  return { vault, usdg, glp, shortsTracker }
}

async function getTestnetValues(){
  const vault = { address: "0xA57F00939D8597DeF1965FF4708921c56D9A36f3" }
  const usdg = { address: "0x3eE22225949541aaACCBd1B43289147fb3ad97f1" }
  const glp = { address: "0xC6012955CEF9137FE9B1C01361c41FBf7E8dFfD9" }
  const shortsTracker = { address: "0x230a476D100Bba2f76edBDF1300df3f963d943Dd" }

  return { vault, usdg, glp, shortsTracker }
}

async function getValues() {
  if (network === "arbitrum") {
    return getArbValues()
  }

  if (network === "avax") {
    return getAvaxValues()
  }

  if (network ==="testnet"){
    return getTestnetValues()
  }
}

async function main() {
  const { vault, usdg, glp, shortsTracker } = await getValues()

  const cooldownDuration = 0
  const glpManager = await deployContract("GlpManager", [vault.address, usdg.address, glp.address, shortsTracker.address, cooldownDuration])

  await sendTxn(glpManager.setInPrivateMode(true), "glpManager.setInPrivateMode")

  writeTmpAddresses({
    glpManager: glpManager.address
  })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
