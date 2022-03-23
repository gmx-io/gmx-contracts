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

  const positionRouter = await deployContract("PositionRouter", [vault.address, router.address, weth.address, depositFee, minExecutionFee], "PositionRouter", { gasLimit: 125000000 })
  // const positionRouter = await contractAt("PositionRouter", "0x338fF5b9d64484c8890704a76FE7166Ed7d3AEAd")

  await sendTxn(positionRouter.setReferralStorage(referralStorage.address), "positionRouter.setReferralStorage")
  await sendTxn(referralStorage.setHandler(positionRouter.address, true), "referralStorage.setHandler(positionRouter)")

  await sendTxn(router.addPlugin(positionRouter.address), "router.addPlugin")

  await sendTxn(positionRouter.setDelayValues(1, 180, 30 * 60), "positionRouter.setDelayValues")
  await sendTxn(timelock.setContractHandler(positionRouter.address, true), "timelock.setContractHandler(positionRouter)")
}

async function deployOnAvax() {
  const signer = await getFrameSigner()

  const vault = await contractAt("Vault", "0x9ab2De34A33fB459b538c43f251eB825645e8595")
  const timelock = await contractAt("Timelock", await vault.gov(), signer)
  const router = await contractAt("Router", "0x5F719c2F1095F7B9fc68a68e35B51194f4b6abe8", signer)
  const weth = await contractAt("WETH", "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7")
  const referralStorage = await contractAt("ReferralStorage", "0x0e725cB75258c3D8e9FB47267207b8973B882eBF")
  const depositFee = "30" // 0.3%
  const minExecutionFee = "17000000000000000" // 0.017 AVAX

  const positionRouter = await deployContract("PositionRouter", [vault.address, router.address, weth.address, depositFee, minExecutionFee])
  // const positionRouter = await contractAt("PositionRouter", "0xc5BBc613f4617eE4F7E89320081182024F86bd6B")

  await sendTxn(positionRouter.setReferralStorage(referralStorage.address), "positionRouter.setReferralStorage")
  await sendTxn(referralStorage.setHandler(positionRouter.address, true), "referralStorage.setHandler(positionRouter)")

  await sendTxn(router.addPlugin(positionRouter.address), "router.addPlugin")

  await sendTxn(positionRouter.setDelayValues(1, 180, 30 * 60), "positionRouter.setDelayValues")
  await sendTxn(timelock.setContractHandler(positionRouter.address, true), "timelock.setContractHandler(positionRouter)")
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
