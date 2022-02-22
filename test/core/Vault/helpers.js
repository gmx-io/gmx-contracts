const { expandDecimals } = require("../../shared/utilities")
const { toUsd } = require("../../shared/units")
const { deployContract } = require("../../shared/fixtures")

const errors = [
  "Vault: zero error",
  "Vault: already initialized",
  "Vault: invalid _maxLeverage",
  "Vault: invalid _taxBasisPoints",
  "Vault: invalid _stableTaxBasisPoints",
  "Vault: invalid _mintBurnFeeBasisPoints",
  "Vault: invalid _swapFeeBasisPoints",
  "Vault: invalid _stableSwapFeeBasisPoints",
  "Vault: invalid _marginFeeBasisPoints",
  "Vault: invalid _liquidationFeeUsd",
  "Vault: invalid _fundingInterval",
  "Vault: invalid _fundingRateFactor",
  "Vault: invalid _stableFundingRateFactor",
  "Vault: token not whitelisted",
  "Vault: _token not whitelisted",
  "Vault: invalid tokenAmount",
  "Vault: _token not whitelisted",
  "Vault: invalid tokenAmount",
  "Vault: invalid usdgAmount",
  "Vault: _token not whitelisted",
  "Vault: invalid usdgAmount",
  "Vault: invalid redemptionAmount",
  "Vault: invalid amountOut",
  "Vault: swaps not enabled",
  "Vault: _tokenIn not whitelisted",
  "Vault: _tokenOut not whitelisted",
  "Vault: invalid tokens",
  "Vault: invalid amountIn",
  "Vault: leverage not enabled",
  "Vault: insufficient collateral for fees",
  "Vault: invalid position.size",
  "Vault: empty position",
  "Vault: position size exceeded",
  "Vault: position collateral exceeded",
  "Vault: invalid liquidator",
  "Vault: empty position",
  "Vault: position cannot be liquidated",
  "Vault: invalid position",
  "Vault: invalid _averagePrice",
  "Vault: collateral should be withdrawn",
  "Vault: _size must be more than _collateral",
  "Vault: invalid msg.sender",
  "Vault: mismatched tokens",
  "Vault: _collateralToken not whitelisted",
  "Vault: _collateralToken must not be a stableToken",
  "Vault: _collateralToken not whitelisted",
  "Vault: _collateralToken must be a stableToken",
  "Vault: _indexToken must not be a stableToken",
  "Vault: _indexToken not shortable",
  "Vault: invalid increase",
  "Vault: reserve exceeds pool",
  "Vault: max USDG exceeded",
  "Vault: reserve exceeds pool",
  "Vault: forbidden",
  "Vault: forbidden",
  "Vault: maxGasPrice exceeded"
]

async function initVaultErrors(vault) {
  const vaultErrorController = await deployContract("VaultErrorController", [])
  await vault.setErrorController(vaultErrorController.address)
  await vaultErrorController.setErrors(vault.address, errors);
  return vaultErrorController
}

async function initVaultUtils(vault) {
  const vaultUtils = await deployContract("VaultUtils", [vault.address])
  await vault.setVaultUtils(vaultUtils.address)
  return vaultUtils
}

async function initVault(vault, router, usdg, priceFeed) {
  await vault.initialize(
    router.address, // router
    usdg.address, // usdg
    priceFeed.address, // priceFeed
    toUsd(5), // liquidationFeeUsd
    600, // fundingRateFactor
    600 // stableFundingRateFactor
  )

  const vaultUtils = await initVaultUtils(vault)
  const vaultErrorController = await initVaultErrors(vault)

  return { vault, vaultUtils, vaultErrorController }
}

async function validateVaultBalance(expect, vault, token, offset) {
  if (!offset) { offset = 0 }
  const poolAmount = await vault.poolAmounts(token.address)
  const feeReserve = await vault.feeReserves(token.address)
  const balance = await token.balanceOf(vault.address)
  let amount = poolAmount.add(feeReserve)
  expect(balance).gt(0)
  expect(poolAmount.add(feeReserve).add(offset)).eq(balance)
}

function getBnbConfig(bnb, bnbPriceFeed) {
  return [
    bnb.address, // _token
    18, // _tokenDecimals
    10000, // _tokenWeight
    75, // _minProfitBps,
    0, // _maxUsdgAmount
    false, // _isStable
    true // _isShortable
  ]
}

function getEthConfig(eth, ethPriceFeed) {
  return [
    eth.address, // _token
    18, // _tokenDecimals
    10000, // _tokenWeight
    75, // _minProfitBps
    0, // _maxUsdgAmount
    false, // _isStable
    true // _isShortable
  ]
}

function getBtcConfig(btc, btcPriceFeed) {
  return [
    btc.address, // _token
    8, // _tokenDecimals
    10000, // _tokenWeight
    75, // _minProfitBps
    0, // _maxUsdgAmount
    false, // _isStable
    true // _isShortable
  ]
}

function getDaiConfig(dai, daiPriceFeed) {
  return [
    dai.address, // _token
    18, // _tokenDecimals
    10000, // _tokenWeight
    75, // _minProfitBps
    0, // _maxUsdgAmount
    true, // _isStable
    false // _isShortable
  ]
}

module.exports = {
  errors,
  initVault,
  validateVaultBalance,
  getBnbConfig,
  getBtcConfig,
  getEthConfig,
  getDaiConfig
}
