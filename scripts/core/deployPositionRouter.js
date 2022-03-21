const { getFrameSigner, deployContract, contractAt , sendTxn, readTmpAddresses, writeTmpAddresses } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function deployOnArb() {
  const signer = await getFrameSigner()

  const vault = await contractAt("Vault", "0x489ee077994B6658eAfA855C308275EAd8097C4A")
  const timelock = await contractAt("Timelock", await vault.gov(), signer)
  const router = await contractAt("Router", "0xaBBc5F99639c9B6bCb58544ddf04EFA6802F4064", signer)
  const weth = await contractAt("WETH", "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1")
  const referralStorage = await contractAt("ReferralStorage", "0x2249D006A8cCdF4C99Aa6c8B9502a2aeCC923392")
  const depositFee = "30" // 0.3%
  const minExecutionFee = "300000000000000" // 0.0003 ETH

  const positionRouter = await deployContract("PositionRouter", [vault.address, router.address, weth.address, depositFee, minExecutionFee])
  // const positionRouter = await contractAt("PositionRouter", "0x338fF5b9d64484c8890704a76FE7166Ed7d3AEAd")

  await sendTxn(positionRouter.setReferralStorage(referralStorage.address), "positionRouter.setReferralStorage")
  await sendTxn(referralStorage.setHandler(positionRouter.address, true), "referralStorage.setHandler(positionRouter)")

  await sendTxn(router.addPlugin(positionRouter.address), "router.addPlugin")

  await sendTxn(positionRouter.setDelayValues(1, 180, 30 * 60), "positionRouter.setDelayValues")
  await sendTxn(timelock.setContractHandler(positionRouter.address, true), "timelock.setContractHandler(positionRouter)")
}

async function deployOnAvax() {
}

async function main() {
  if (network === "avax") {
    await deployOnAvax()
    return
  }

  await deployOnArb()
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
