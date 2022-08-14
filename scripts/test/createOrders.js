const ethers = require("ethers")
const { contractAt } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

const orderBookAddress = "0xebD147E5136879520dDaDf1cA8FBa48050EFf016"
const positionRouterAddress = "0xB4bB78cd12B097603e2b55D2556c09C17a5815F8"

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('../core/tokens')[network];

const { btc, usdc } = tokens

async function createIncreaseOrder(orderBook, triggerAboveThreshold = false) {
  console.log("creating increase order triggerAboveThreshold: %s...", triggerAboveThreshold)

  const triggerPrice = triggerAboveThreshold ? 0 : expandDecimals(100000, 30)
  const params = [
    [btc.address],
    expandDecimals(100, btc.decimals).div(24000),
    btc.address, // tokenToken
    0, // minOut
    expandDecimals(1000, 30), // sizeDelta
    btc.address, // collateralToken
    true, // isLong
    triggerPrice,
    triggerAboveThreshold,
    expandDecimals(1, 15),
    false,
    { value: expandDecimals(1, 15) } // fee
  ]
  const tx = await orderBook.createIncreaseOrder(...params)
  console.log("tx hash:", tx.hash)
  const receipt = await tx.wait()
  console.log("done")
}

async function createDecreaseOrder(orderBook, triggerAboveThreshold = true) {
  console.log("creating decrease order triggerAboveThreshold: %s...", triggerAboveThreshold)

  const triggerPrice = triggerAboveThreshold ? 0 : expandDecimals(100000, 30)

  const params = [
    btc.address,
    expandDecimals(10, 30), // sizeDelta
    usdc.address,
    0, // collateralDelta
    false, // isLong
    triggerPrice,
    triggerAboveThreshold,
    { value: expandDecimals(1, 15) } // fee
  ]
  const tx = await orderBook.createDecreaseOrder(...params)
  console.log("tx hash:", tx.hash)
  const receipt = await tx.wait()
  console.log("done")
}

async function increasePosition(positionRouter) {
  console.log("increasing position...")
  const params = [
    [usdc.address],
    btc.address,
    expandDecimals(100, usdc.decimals), // amountIn
    0,
    expandDecimals(1000, 30),
    false,
    expandDecimals(10000, 30), // acceptablePrice
    expandDecimals(1, 15), // executionFee
    ethers.constants.HashZero, // referralCode
    { value: expandDecimals(1, 15) }
  ]
  const tx = await positionRouter.createIncreasePosition(...params)
  console.log("tx hash:", tx.hash)
  const receipt = await tx.wait()
  console.log("done")
}

async function main() {
  // create multiple decrease and increase order to test order executor
  // 1. make sure your account approved tokens to spend
  // 2. and approved PositionManager/OrderBook plugins

  const orderBook = await contractAt("OrderBook", orderBookAddress)
  const positionRouter = await contractAt("PositionRouter", positionRouterAddress)

  await createDecreaseOrder(orderBook, false)
  await createDecreaseOrder(orderBook, false)
  await createDecreaseOrder(orderBook, true)
  await createDecreaseOrder(orderBook, true)

  // create position so decrease order can be executed
  await increasePosition(positionRouter)

  await createIncreaseOrder(orderBook, false)
  await createIncreaseOrder(orderBook, true)
}

main().catch(ex => {
  console.error(ex)
  process.exit(1)
})
