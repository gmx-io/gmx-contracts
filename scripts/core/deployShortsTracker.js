const { getFrameSigner, deployContract, contractAt , sendTxn, readTmpAddresses, writeTmpAddresses } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units");
const { getArgumentForSignature } = require("typechain");

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function getArbTestnetValues() {
  return { vaultAddress: "0xBc9BC47A7aB63db1E0030dC7B60DDcDe29CF4Ffb", gasLimit: 12500000 }
}

async function getArbValues() {
  return { vaultAddress: "0x489ee077994B6658eAfA855C308275EAd8097C4A", gasLimit: 12500000 }
}

async function getAvaxValues() {
  return { vaultAddress: "0x9ab2De34A33fB459b538c43f251eB825645e8595" }
}

async function getValues() {
  if (network === "avax") {
    return await getAvaxValues()
  } else if (network === "arbitrumTestnet") {
    return await getArbTestnetValues()
  } else {
    return await getArbValues()
  }
}

async function main() {
  const { vaultAddress, gasLimit } = await getValues()
  const gov = { address: "0x49B373D422BdA4C6BfCdd5eC1E48A9a26fdA2F8b" }
  const shortsTracker = await deployContract("ShortsTracker", [vaultAddress], "ShortsTracker", { gasLimit })
  await sendTxn(shortsTracker.setGov(gov.address), "shortsTracker.setGov")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
