const { contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals, maxUint256 } = require("../../test/shared/utilities")

async function main() {
  const wallet = { address: "0x56a2a358d687a40E3bFd2BE28E69aB229e0b444e" }
  const router = await contractAt("PancakeRouter", "0xD99D1c33F9fC3444f8101754aBC46c52416550D1")
  const gmt = await contractAt("GMT", "0xedba0360a44f885ed390fad01aa34d00d2532817")
  const xgmt = await contractAt("YieldToken", "0x28cba798eca1a3128ffd1b734afb93870f22e613")
  const usdg = await contractAt("USDG", "0xE14F46Ee1e23B68003bCED6D85465455a309dffF")
  const wbnb = await contractAt("WETH", "0x6A2345E019DB2aCC6007DCD3A69731F51D7Dca52")
  const busd = await contractAt("FaucetToken", "0xae7486c680720159130b71e0f9EF7AFd8f413227")

  await sendTxn(gmt.approve(router.address, maxUint256), "gmt.approve(router)")
  await sendTxn(xgmt.approve(router.address, maxUint256), "xgmt.approve(router)")
  await sendTxn(usdg.approve(router.address, maxUint256), "usdg.approve(router)")
  await sendTxn(wbnb.approve(router.address, maxUint256), "wbnb.approve(router)")
  await sendTxn(busd.approve(router.address, maxUint256), "busd.approve(router)")

  await sendTxn(router.addLiquidity(
    gmt.address, // tokenA
    usdg.address, // tokenB
    expandDecimals(1000, 18), // amountADesired
    expandDecimals(120 * 1000, 18), // amountBDesired
    0, // amountAMin
    0, // amountBMin
    wallet.address, // to
    maxUint256 // deadline
  ), "router.addLiquidity(gmt, usdg)")

  await sendTxn(router.addLiquidity(
    xgmt.address, // tokenA
    usdg.address, // tokenB
    expandDecimals(100, 18), // amountADesired
    expandDecimals(60 * 1000, 18), // amountBDesired
    0, // amountAMin
    0, // amountBMin
    wallet.address, // to
    maxUint256 // deadline
  ), "router.addLiquidity(xgmt, usdg)")

  await sendTxn(router.addLiquidity(
    wbnb.address, // tokenA
    busd.address, // tokenB
    expandDecimals(10, 18), // amountADesired
    expandDecimals(5250, 18), // amountBDesired
    0, // amountAMin
    0, // amountBMin
    wallet.address, // to
    maxUint256 // deadline
  ), "router.addLiquidity(bnb, busd)")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
