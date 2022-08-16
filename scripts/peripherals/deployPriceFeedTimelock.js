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

async function getValues() {
  if (network === "arbitrum") {
    return getArbValues()
  }

  if (network === "avax") {
    return getAvaxValues()
  }
}

async function main() {
  const signer = await getFrameSigner()

  const admin = "0x49B373D422BdA4C6BfCdd5eC1E48A9a26fdA2F8b"
  const buffer = 24 * 60 * 60

  const { tokenManager } = await getValues()

  const timelock = await deployContract("PriceFeedTimelock", [
    admin,
    buffer,
    tokenManager.address
  ], "Timelock")

  const deployedTimelock = await contractAt("PriceFeedTimelock", timelock.address, signer)

  const signers = [
    "0x82429089e7c86B7047b793A9E7E7311C93d2b7a6", // coinflipcanada
    "0xD7941C4Ca57a511F21853Bbc7FBF8149d5eCb398", // G
    "0xfb481D70f8d987c1AE3ADc90B7046e39eb6Ad64B", // kr
    "0x99Aa3D1b3259039E8cB4f0B33d0Cfd736e1Bf49E", // quat
    "0x6091646D0354b03DD1e9697D33A7341d8C93a6F5" // xhiroz
  ]

  for (let i = 0; i < signers.length; i++) {
    const signer = signers[i]
    await sendTxn(deployedTimelock.setContractHandler(signer, true), `deployedTimelock.setContractHandler(${signer})`)
  }

  const keepers = [
    "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8" // X
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
