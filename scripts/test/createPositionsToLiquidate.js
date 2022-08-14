const ethers = require("ethers")
const { contractAt } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

const positionRouterAddress = "0xB4bB78cd12B097603e2b55D2556c09C17a5815F8"
const vaultAddress = "0xBc9BC47A7aB63db1E0030dC7B60DDcDe29CF4Ffb"

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('../core/tokens')[network];

const BASIS_POINTS_DIVISOR = 10000

const { usdc, btc } = tokens

let vaultMaxLeverage
async function getMaxLeverage(vault) {
  if (!vaultMaxLeverage) {
    vaultMaxLeverage = await vault.maxLeverage()
  }
  return vaultMaxLeverage
}

async function increasePosition(positionRouter, vault, collateralToken, indexToken, sizeDelta, isLong) {
  console.log("increasing position...")
  const collateralTokenPrice = await (isLong ? vault.getMaxPrice(collateralToken.address) : vault.getMinPrice(collateralToken.address))

  const maxLeverage = await getMaxLeverage(vault)
  // calculate amountIn to match levarage slightly less than max leverage
  const amountIn = sizeDelta
    .div(maxLeverage.div(BASIS_POINTS_DIVISOR))
    .mul(BASIS_POINTS_DIVISOR).div(BASIS_POINTS_DIVISOR - 20) // 99.8% of max lev
    .add(sizeDelta.div(1000)) // for margin fees
    .mul(expandDecimals(1, collateralToken.decimals))
    .div(collateralTokenPrice)

  // console.log(amountIn.toString() / 1e8 * (collateralTokenPrice.toString() / 1e30))

  const acceptablePrice = isLong ? expandDecimals(100000, 30) : expandDecimals(1, 30)

  const executionFee = expandDecimals(1, 15)
  const params = [
    [collateralToken.address],
    indexToken.address,
    amountIn,
    0,
    sizeDelta,
    isLong,
    acceptablePrice,
    executionFee,
    ethers.constants.HashZero, // referralCode
    { value: executionFee }
  ]
  console.log("params %j", params)
  const tx = await positionRouter.createIncreasePosition(...params)
  console.log("tx hash:", tx.hash)
  const receipt = await tx.wait()
  console.log("done")
}

async function main() {
  // 1. make sure your account approved tokens to spend
  // 2. and approved PositionManager/OrderBook plugins

  const vault = await contractAt("Vault", vaultAddress)
  const positionRouter = await contractAt("PositionRouter", positionRouterAddress)

  await increasePosition(positionRouter, vault, usdc, btc, expandDecimals(1000, 30), false)
  await increasePosition(positionRouter, vault, btc, btc, expandDecimals(1000, 30), true)
}

main().catch(ex => {
  console.error(ex)
  process.exit(1)
})
