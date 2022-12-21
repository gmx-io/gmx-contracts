const { deployContract, contractAt, sendTxn, getFrameSigner } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

async function getArbValues() {
  const tokenManager = { address: "0xddDc546e07f1374A07b270b7d863371e575EA96A" }

  return { tokenManager }
}

async function getAvaxValues() {
  const tokenManager = { address: "0x8b25Ba1cAEAFaB8e9926fabCfB6123782e3B4BC2" }

  return { tokenManager }
}

async function getTestnetValues() {
  const tokenManager = { address: "0x15f54d599ADF24b809de9B9C917061Ce0cB7617f" }

  return { tokenManager }
}

async function getValues() {
  if (network === "arbitrum") {
    return getArbValues()
  }

  if (network === "avax") {
    return getAvaxValues()
  }

  if (network === "testnet") {
    return getTestnetValues()
  }
}

async function main() {

  const admin = "0x2CC6D07871A1c0655d6A7c9b0Ad24bED8f940517"
  const buffer = network === "testnet" ? 60 : 24 * 60 * 60

  const { tokenManager } = await getValues()

  const timelock = await deployContract("PriceFeedTimelock", [
    admin,
    buffer,
    tokenManager.address
  ], "Timelock")

  const deployedTimelock = await contractAt("PriceFeedTimelock", timelock.address)

  const signers = [
    "0x0EaEA9558eFF1d4b76b347A39f54d8CDf01F990F", // account test 1
    "0x33EDbEc831AD335f26fFC06EB07311cC99F50084", // account test 2
    "0x3134d254202E5dd2d98E4ba10CaE3703199c3FB0", // account test 3
    "0x6f8e190d41c6D5F0Dc18122b01C339761A4deDbe", // account test 4
    "0x5287a0ad42b2Cfdd14265949ab4cb9Ac5867FD27" // account test 5
  ]

  for (let i = 0; i < signers.length; i++) {
    const signer = signers[i]
    await sendTxn(deployedTimelock.setContractHandler(signer, true), `deployedTimelock.setContractHandler(${signer})`)
  }

  const keepers = [
    "0x2CC6D07871A1c0655d6A7c9b0Ad24bED8f940517", // deployer
    "0x9B82B9Ab7570Ae452D9FF5411F1bE2bad08EF4c4"
  ]

  for (let i = 0; i < keepers.length; i++) {
    const keeper = keepers[i]
    await sendTxn(deployedTimelock.setKeeper(keeper, true), `deployedTimelock.setKeeper(${keeper})`)
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
