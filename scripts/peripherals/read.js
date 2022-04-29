const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function readVaultTokenInfo(vault, tokens, usdgAmount) {
  console.log("vault.priceFeed", await vault.priceFeed())

  const priceFeed = await contractAt("VaultPriceFeed", await vault.priceFeed())

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    console.log("vault.poolAmounts", (await vault.poolAmounts(token)).toString())
    console.log("vault.reservedAmounts", (await vault.reservedAmounts(token)).toString())
    console.log("vault.usdgAmounts", (await vault.usdgAmounts(token)).toString())
    console.log("vault.getRedemptionAmount", (await vault.getRedemptionAmount(token, usdgAmount)).toString())
    console.log("vault.getMinPrice", (await vault.getMinPrice(token)).toString())
    console.log("vault.getMaxPrice", (await vault.getMaxPrice(token)).toString())
    console.log("vault.guaranteedUsd", (await vault.guaranteedUsd(token)).toString())
    console.log("priceFeed.getPrice", (await priceFeed.getPrice(token, false, false, false)).toString())
    console.log("priceFeed.getPrice", (await priceFeed.getPrice(token, true, false, false)).toString())
  }
}

async function readFees(vault, weth, usdc) {
  // const result = await reader.getMaxAmountIn(vault.address, weth.address, usdc.address)
  // const result = await reader.getMaxAmountIn(vault.address, usdc.address, weth.address)
  // const result = await reader.getAmountOut(vault.address, weth.address, usdc.address, expandDecimals(1, 18))
  // const result = await reader.getAmountOut(vault.address, usdc.address, weth.address, expandDecimals(10, 6))
  const result = await reader.getFeeBasisPoints(vault.address, usdc.address, weth.address, expandDecimals(10, 6))
  console.log("result[0]", result[0].toString())
  console.log("result[1]", result[1].toString())
  console.log("result[2]", result[2].toString())

  const ethTargetAmount = await vault.getTargetUsdgAmount(weth.address);
  const usdcTargetAmount = await vault.getTargetUsdgAmount(usdc.address);
  console.log("ethTargetAmount", ethTargetAmount.toString())
  console.log("usdcTargetAmount", usdcTargetAmount.toString())

  const initialAmount0 = await vault.usdgAmounts(usdc.address)
  console.log("initialAmount0", initialAmount0.toString())

  const feeBasisPoints0 = await vault.getFeeBasisPoints(usdc.address, expandDecimals(10, 18), 20, 20, true)
  console.log("feeBasisPoints0", feeBasisPoints0.toString())
}

async function readMinProfitBps(vault, tokens) {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    console.log("vault.minProfitBasisPoints", (await vault.minProfitBasisPoints(token)).toString())
  }
}

async function readFeeConfig(vault) {
  console.log("vault.taxBasisPoints", (await vault.taxBasisPoints()).toString())
  console.log("vault.stableTaxBasisPoints", (await vault.stableTaxBasisPoints()).toString())
  console.log("vault.mintBurnFeeBasisPoints", (await vault.mintBurnFeeBasisPoints()).toString())
  console.log("vault.swapFeeBasisPoints", (await vault.swapFeeBasisPoints()).toString())
  console.log("vault.stableSwapFeeBasisPoints", (await vault.stableSwapFeeBasisPoints()).toString())
  console.log("vault.marginFeeBasisPoints", (await vault.marginFeeBasisPoints()).toString())
  console.log("vault.liquidationFeeUsd", (await vault.liquidationFeeUsd()).toString())
  console.log("vault.minProfitTime", (await vault.minProfitTime()).toString())
  console.log("vault.hasDynamicFees", (await vault.hasDynamicFees()).toString())
}

async function readGlpManager(glpManager) {
  console.log("glpManager.cooldownDuration", (await glpManager.cooldownDuration()).toString())
}

async function getPool(tokenAddress0, tokenAddress1, fees) {
  const factory = await contractAt("UniFactory", "0x1F98431c8aD98523631AE4a59f267346ea31F984")
  const result = await factory.getPool(tokenAddress0, tokenAddress1, fees)
  console.log("result", result)
}

async function main() {
  // const reader = await contractAt("Reader", "0xbD8F00AabeC361ce52486431433FB196c53C5101")
  // const vault = await contractAt("Vault", "0xDE3590067c811b6F023b557ed45E4f1067859663")
  // const weth = { address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1" }
  // const usdc = { address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8" }
  // const gmx = { address: "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a" }
  // const tokens = ["0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f"]
  // const usdgAmount = expandDecimals(1, 18)
  // const glpManager = await contractAt("GlpManager", "0x91425Ac4431d068980d497924DD540Ae274f3270")

  // await readGlpManager(glpManager)

  // await getPool(weth.address, usdc.address, 500)
  // await getPool(weth.address, gmx.address, 10000)

  const vault = await contractAt("Vault", "0x489ee077994B6658eAfA855C308275EAd8097C4A")
  const glpManager = await contractAt("GlpManager", "0x321F653eED006AD1C29D174e17d96351BDe22649")
  let startTime = Date.now()
  await vault.getMinPrice("0x82aF49447D8a07e3bd95BD0d56f35241523fBab1")
  console.log("vault.getMinPrice", Date.now() - startTime)

  startTime = Date.now()
  await glpManager.getAums()
  console.log("glpManager.getAums", Date.now() - startTime)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
