const { contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

const { HashZero } = ethers.constants

async function getArbValues() {
  const executionFee = "300000000000000"
  const positionRouter = await contractAt("PositionRouter", "0x3D6bA331e3D9702C5e8A8d254e5d8a285F223aba")
  const usdc = { address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8" }
  const usdcDecimals = 6
  const weth = { address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1" }

  const increaseLongPositionParams = [
    [usdc.address, weth.address], // _path
    weth.address, // _indexToken
    expandDecimals(20, usdcDecimals), // _amountIn
    0, // _minOut
    toUsd(50), // _sizeDelta
    true, // _isLong
    toUsd(5000), // _acceptablePrice
    executionFee, // _executionFee
    HashZero // _referralCode
  ]

  const decreaseLongPositionParams = [
    [weth.address], // _collateralToken
    weth.address, // _indexToken
    toUsd(20), // _collateralDelta
    toUsd(50), // _sizeDelta
    true, // _isLong
    "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8",  // _receiver
    toUsd(2900),  // _acceptablePrice
    0, // _minOut
    executionFee, // _executionFee
    true // _withdrawETH
  ]

  return { positionRouter, executionFee, increaseLongPositionParams, decreaseLongPositionParams }
}

async function getValues() {
  if (network === "arbitrum") {
    return getArbValues()
  }
}

async function main() {
  const { positionRouter, executionFee, increaseLongPositionParams, decreaseLongPositionParams } = await getValues()

  // await sendTxn(positionRouter.createIncreasePosition(...increaseLongPositionParams, { value: executionFee }), "positionRouter.createIncreasePosition(increaseLongPositionParams)")
  // await sendTxn(positionRouter.createIncreasePosition(...increaseLongPositionParams, { value: executionFee }), "positionRouter.createIncreasePosition(increaseLongPositionParams)")
  // await sendTxn(positionRouter.createIncreasePosition(...increaseLongPositionParams, { value: executionFee }), "positionRouter.createIncreasePosition(increaseLongPositionParams)")

  await sendTxn(positionRouter.createIncreasePosition(...increaseLongPositionParams, { value: executionFee }), "positionRouter.createIncreasePosition(increaseLongPositionParams)")
  await sendTxn(positionRouter.createDecreasePosition(...decreaseLongPositionParams, { value: executionFee }), "positionRouter.createDecreasePosition(decreaseLongPositionParams)")
  await sendTxn(positionRouter.createIncreasePosition(...increaseLongPositionParams, { value: executionFee }), "positionRouter.createIncreasePosition(increaseLongPositionParams)")
  await sendTxn(positionRouter.createDecreasePosition(...decreaseLongPositionParams, { value: executionFee }), "positionRouter.createDecreasePosition(decreaseLongPositionParams)")
  await sendTxn(positionRouter.createIncreasePosition(...increaseLongPositionParams, { value: executionFee }), "positionRouter.createIncreasePosition(increaseLongPositionParams)")
  await sendTxn(positionRouter.createDecreasePosition(...decreaseLongPositionParams, { value: executionFee }), "positionRouter.createDecreasePosition(decreaseLongPositionParams)")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
