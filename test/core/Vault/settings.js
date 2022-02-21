const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed } = require("../../shared/utilities")
const { toChainlinkPrice } = require("../../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../../shared/units")
const { initVault, getBnbConfig } = require("./helpers")

use(solidity)

describe("Vault.settings", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let vault
  let vaultUtils
  let vaultPriceFeed
  let usdg
  let router
  let bnb
  let bnbPriceFeed
  let btc
  let btcPriceFeed
  let dai
  let daiPriceFeed
  let distributor0
  let yieldTracker0

  beforeEach(async () => {
    bnb = await deployContract("Token", [])
    bnbPriceFeed = await deployContract("PriceFeed", [])

    btc = await deployContract("Token", [])
    btcPriceFeed = await deployContract("PriceFeed", [])

    dai = await deployContract("Token", [])
    daiPriceFeed = await deployContract("PriceFeed", [])

    vault = await deployContract("Vault", [])
    usdg = await deployContract("USDG", [vault.address])
    router = await deployContract("Router", [vault.address, usdg.address, bnb.address])
    vaultPriceFeed = await deployContract("VaultPriceFeed", [])

    const contracts = await initVault(vault, router, usdg, vaultPriceFeed)
    vaultUtils = contracts.vaultUtils

    distributor0 = await deployContract("TimeDistributor", [])
    yieldTracker0 = await deployContract("YieldTracker", [usdg.address])

    await yieldTracker0.setDistributor(distributor0.address)
    await distributor0.setDistribution([yieldTracker0.address], [1000], [bnb.address])

    await bnb.mint(distributor0.address, 5000)
    await usdg.setYieldTrackers([yieldTracker0.address])

    await vaultPriceFeed.setTokenConfig(bnb.address, bnbPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(dai.address, daiPriceFeed.address, 8, false)
  })

  it("inits", async () => {
    expect(await usdg.gov()).eq(wallet.address)
    expect(await usdg.vaults(vault.address)).eq(true)
    expect(await usdg.vaults(user0.address)).eq(false)

    expect(await vault.gov()).eq(wallet.address)
    expect(await vault.isInitialized()).eq(true)
    expect(await vault.router()).eq(router.address)
    expect(await vault.usdg()).eq(usdg.address)
    expect(await vault.priceFeed()).eq(vaultPriceFeed.address)
    expect(await vault.liquidationFeeUsd()).eq(toUsd(5))
    expect(await vault.fundingRateFactor()).eq(600)
    expect(await vault.stableFundingRateFactor()).eq(600)
  })

  it("setVaultUtils", async () => {
    await expect(vault.connect(user0).setVaultUtils(user1.address))
      .to.be.revertedWith("Vault: forbidden")

    await vault.setGov(user0.address)

    expect(await vault.vaultUtils()).eq(vaultUtils.address)
    await vault.connect(user0).setVaultUtils(user1.address)
    expect(await vault.vaultUtils()).eq(user1.address)
  })

  it("setMaxGlobalShortSize", async () => {
    await expect(vault.connect(user0).setMaxGlobalShortSize(bnb.address, 1000))
      .to.be.revertedWith("Vault: forbidden")

    await vault.setGov(user0.address)

    expect(await vault.maxGlobalShortSizes(bnb.address)).eq(0)
    expect(await vault.maxGlobalShortSizes(btc.address)).eq(0)
    await vault.connect(user0).setMaxGlobalShortSize(bnb.address, 1000)
    await vault.connect(user0).setMaxGlobalShortSize(btc.address, 7000)
    expect(await vault.maxGlobalShortSizes(bnb.address)).eq(1000)
    expect(await vault.maxGlobalShortSizes(btc.address)).eq(7000)
  })

  it("setInManagerMode", async () => {
    await expect(vault.connect(user0).setInManagerMode(true))
      .to.be.revertedWith("Vault: forbidden")

    await vault.setGov(user0.address)

    expect(await vault.inManagerMode()).eq(false)
    await vault.connect(user0).setInManagerMode(true)
    expect(await vault.inManagerMode()).eq(true)
  })

  it("setManager", async () => {
    await expect(vault.connect(user0).setManager(user1.address, true))
      .to.be.revertedWith("Vault: forbidden")

    await vault.setGov(user0.address)

    expect(await vault.isManager(user1.address)).eq(false)
    await vault.connect(user0).setManager(user1.address, true)
    expect(await vault.isManager(user1.address)).eq(true)
  })

  it("setInPrivateLiquidationMode", async () => {
    await expect(vault.connect(user0).setInPrivateLiquidationMode(true))
      .to.be.revertedWith("Vault: forbidden")

    await vault.setGov(user0.address)

    expect(await vault.inPrivateLiquidationMode()).eq(false)
    await vault.connect(user0).setInPrivateLiquidationMode(true)
    expect(await vault.inPrivateLiquidationMode()).eq(true)
  })

  it("setIsSwapEnabled", async () => {
    await expect(vault.connect(user0).setIsSwapEnabled(false))
      .to.be.revertedWith("Vault: forbidden")

    await vault.setGov(user0.address)

    expect(await vault.isSwapEnabled()).eq(true)
    await vault.connect(user0).setIsSwapEnabled(false)
    expect(await vault.isSwapEnabled()).eq(false)
  })

  it("setIsLeverageEnabled", async () => {
    await expect(vault.connect(user0).setIsLeverageEnabled(false))
      .to.be.revertedWith("Vault: forbidden")

    await vault.setGov(user0.address)

    expect(await vault.isLeverageEnabled()).eq(true)
    await vault.connect(user0).setIsLeverageEnabled(false)
    expect(await vault.isLeverageEnabled()).eq(false)
  })

  it("setMaxGasPrice", async () => {
    await expect(vault.connect(user0).setMaxGasPrice(20))
      .to.be.revertedWith("Vault: forbidden")

    await vault.setGov(user0.address)

    expect(await vault.maxGasPrice()).eq(0)
    await vault.connect(user0).setMaxGasPrice(20)
    expect(await vault.maxGasPrice()).eq(20)
  })

  it("setGov", async () => {
    await expect(vault.connect(user0).setGov(user1.address))
      .to.be.revertedWith("Vault: forbidden")

    expect(await vault.gov()).eq(wallet.address)

    await vault.setGov(user0.address)
    expect(await vault.gov()).eq(user0.address)

    await vault.connect(user0).setGov(user1.address)
    expect(await vault.gov()).eq(user1.address)
  })

  it("setPriceFeed", async () => {
    await expect(vault.connect(user0).setPriceFeed(user1.address))
      .to.be.revertedWith("Vault: forbidden")

    await vault.setGov(user0.address)

    expect(await vault.priceFeed()).eq(vaultPriceFeed.address)
    await vault.connect(user0).setPriceFeed(user1.address)
    expect(await vault.priceFeed()).eq(user1.address)
  })

  it("setMaxLeverage", async () => {
    await expect(vault.connect(user0).setMaxLeverage(10000))
      .to.be.revertedWith("Vault: forbidden")

    await vault.setGov(user0.address)

    await expect(vault.connect(user0).setMaxLeverage(10000))
      .to.be.revertedWith("Vault: invalid _maxLeverage")

    expect(await vault.maxLeverage()).eq(50 * 10000)
    await vault.connect(user0).setMaxLeverage(10001)
    expect(await vault.maxLeverage()).eq(10001)
  })

  it("setBufferAmount", async () => {
    await expect(vault.connect(user0).setBufferAmount(bnb.address, 700))
      .to.be.revertedWith("Vault: forbidden")

    await vault.setGov(user0.address)

    expect(await vault.bufferAmounts(bnb.address)).eq(0)
    await vault.connect(user0).setBufferAmount(bnb.address, 700)
    expect(await vault.bufferAmounts(bnb.address)).eq(700)
  })

  it("setFees", async () => {
    await expect(vault.connect(user0).setFees(
      90, // _taxBasisPoints
      91, // _stableTaxBasisPoints
      92, // _mintBurnFeeBasisPoints
      93, // _swapFeeBasisPoints
      94, // _stableSwapFeeBasisPoints
      95, // _marginFeeBasisPoints
      toUsd(8), // _liquidationFeeUsd
      96, // _minProfitTime
      true // _hasDynamicFees
    )).to.be.revertedWith("Vault: forbidden")

    await vault.setGov(user0.address)

    expect(await vault.taxBasisPoints()).eq(50)
    expect(await vault.stableTaxBasisPoints()).eq(20)
    expect(await vault.mintBurnFeeBasisPoints()).eq(30)
    expect(await vault.swapFeeBasisPoints()).eq(30)
    expect(await vault.stableSwapFeeBasisPoints()).eq(4)
    expect(await vault.marginFeeBasisPoints()).eq(10)
    expect(await vault.liquidationFeeUsd()).eq(toUsd(5))
    expect(await vault.minProfitTime()).eq(0)
    expect(await vault.hasDynamicFees()).eq(false)
    await vault.connect(user0).setFees(
      90, // _taxBasisPoints
      91, // _stableTaxBasisPoints
      92, // _mintBurnFeeBasisPoints
      93, // _swapFeeBasisPoints
      94, // _stableSwapFeeBasisPoints
      95, // _marginFeeBasisPoints
      toUsd(8), // _liquidationFeeUsd
      96, // _minProfitTime
      true // _hasDynamicFees
    )
    expect(await vault.taxBasisPoints()).eq(90)
    expect(await vault.stableTaxBasisPoints()).eq(91)
    expect(await vault.mintBurnFeeBasisPoints()).eq(92)
    expect(await vault.swapFeeBasisPoints()).eq(93)
    expect(await vault.stableSwapFeeBasisPoints()).eq(94)
    expect(await vault.marginFeeBasisPoints()).eq(95)
    expect(await vault.liquidationFeeUsd()).eq(toUsd(8))
    expect(await vault.minProfitTime()).eq(96)
    expect(await vault.hasDynamicFees()).eq(true)
  })

  it("setFundingRate", async () => {
    await expect(vault.connect(user0).setFundingRate(59 * 60, 10001, 10001))
      .to.be.revertedWith("Vault: forbidden")

    await vault.setGov(user0.address)

    await expect(vault.connect(user0).setFundingRate(59 * 60, 10001, 10001))
      .to.be.revertedWith("Vault: invalid _fundingInterval")

    await expect(vault.connect(user0).setFundingRate(60 * 60, 10001, 10001))
      .to.be.revertedWith("Vault: invalid _fundingRateFactor")

    await expect(vault.connect(user0).setFundingRate(60 * 60, 10000, 10001))
      .to.be.revertedWith("Vault: invalid _stableFundingRateFactor")

    expect(await vault.fundingInterval()).eq(8 * 60 * 60)
    expect(await vault.fundingRateFactor()).eq(600)
    expect(await vault.stableFundingRateFactor()).eq(600)
    await vault.connect(user0).setFundingRate(60 * 60, 10000, 10000)
    expect(await vault.fundingInterval()).eq(60 * 60)
    expect(await vault.fundingRateFactor()).eq(10000)
    expect(await vault.stableFundingRateFactor()).eq(10000)

    await vault.connect(user0).setFundingRate(120 * 60, 1000,2000)
    expect(await vault.fundingInterval()).eq(120 * 60)
    expect(await vault.fundingRateFactor()).eq(1000)
    expect(await vault.stableFundingRateFactor()).eq(2000)
  })

  it("setTokenConfig", async () => {
    const params = [
      bnb.address, // _token
      18, // _tokenDecimals
      10000, // _tokenWeight
      75, // _minProfitBps
      0, // _maxUsdgAmount
      true, // _isStable
      true // _isShortable
    ]

    await expect(vault.connect(user0).setTokenConfig(...params))
      .to.be.revertedWith("Vault: forbidden")

    await expect(vault.setTokenConfig(...params))
      .to.be.revertedWith("VaultPriceFeed: could not fetch price")

    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(300))

    expect(await vault.whitelistedTokenCount()).eq(0)
    expect(await vault.whitelistedTokens(bnb.address)).eq(false)
    expect(await vault.tokenDecimals(bnb.address)).eq(0)
    expect(await vault.tokenWeights(bnb.address)).eq(0)
    expect(await vault.totalTokenWeights()).eq(0)
    expect(await vault.minProfitBasisPoints(bnb.address)).eq(0)
    expect(await vault.maxUsdgAmounts(bnb.address)).eq(0)
    expect(await vault.stableTokens(bnb.address)).eq(false)
    expect(await vault.shortableTokens(bnb.address)).eq(false)
    expect(await vault.allWhitelistedTokensLength()).eq(0)

    await vault.setTokenConfig(...params)

    expect(await vault.whitelistedTokenCount()).eq(1)
    expect(await vault.whitelistedTokens(bnb.address)).eq(true)
    expect(await vault.tokenDecimals(bnb.address)).eq(18)
    expect(await vault.tokenWeights(bnb.address)).eq(10000)
    expect(await vault.totalTokenWeights()).eq(10000)
    expect(await vault.minProfitBasisPoints(bnb.address)).eq(75)
    expect(await vault.maxUsdgAmounts(bnb.address)).eq(0)
    expect(await vault.stableTokens(bnb.address)).eq(true)
    expect(await vault.shortableTokens(bnb.address)).eq(true)
    expect(await vault.allWhitelistedTokensLength()).eq(1)

    await daiPriceFeed.setLatestAnswer(toChainlinkPrice(1))

    await vault.setTokenConfig(
      dai.address, // _token
      2, // _tokenDecimals
      5000, // _tokenWeight
      50, // _minProfitBps
      1000, // _maxUsdgAmount
      false, // _isStable
      false // _isShortable
    )

    expect(await vault.whitelistedTokenCount()).eq(2)
    expect(await vault.whitelistedTokens(dai.address)).eq(true)
    expect(await vault.tokenDecimals(dai.address)).eq(2)
    expect(await vault.tokenWeights(dai.address)).eq(5000)
    expect(await vault.totalTokenWeights()).eq(15000)
    expect(await vault.minProfitBasisPoints(dai.address)).eq(50)
    expect(await vault.maxUsdgAmounts(dai.address)).eq(1000)
    expect(await vault.stableTokens(dai.address)).eq(false)
    expect(await vault.shortableTokens(dai.address)).eq(false)
    expect(await vault.allWhitelistedTokensLength()).eq(2)

    await vault.setTokenConfig(
      dai.address, // _token
      20, // _tokenDecimals
      7000, // _tokenWeight
      10, // _minProfitBps
      500, // _maxUsdgAmount
      true, // _isStable
      false // _isShortable
    )

    expect(await vault.whitelistedTokenCount()).eq(2)
    expect(await vault.whitelistedTokens(dai.address)).eq(true)
    expect(await vault.tokenDecimals(dai.address)).eq(20)
    expect(await vault.tokenWeights(dai.address)).eq(7000)
    expect(await vault.totalTokenWeights()).eq(17000)
    expect(await vault.minProfitBasisPoints(dai.address)).eq(10)
    expect(await vault.maxUsdgAmounts(dai.address)).eq(500)
    expect(await vault.stableTokens(dai.address)).eq(true)
    expect(await vault.shortableTokens(dai.address)).eq(false)
    expect(await vault.allWhitelistedTokensLength()).eq(2)
  })

  it("clearTokenConfig", async () => {
    const params = [
      bnb.address, // _token
      18, // _tokenDecimals
      7000, // _tokenWeight
      75, // _minProfitBps
      500, // _maxUsdgAmount
      true, // _isStable
      true // _isShortable
    ]

    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(300))

    expect(await vault.whitelistedTokenCount()).eq(0)
    expect(await vault.whitelistedTokens(bnb.address)).eq(false)
    expect(await vault.tokenDecimals(bnb.address)).eq(0)
    expect(await vault.tokenWeights(bnb.address)).eq(0)
    expect(await vault.totalTokenWeights()).eq(0)
    expect(await vault.minProfitBasisPoints(bnb.address)).eq(0)
    expect(await vault.maxUsdgAmounts(bnb.address)).eq(0)
    expect(await vault.stableTokens(bnb.address)).eq(false)
    expect(await vault.shortableTokens(bnb.address)).eq(false)

    await vault.setTokenConfig(...params)

    expect(await vault.whitelistedTokenCount()).eq(1)
    expect(await vault.whitelistedTokens(bnb.address)).eq(true)
    expect(await vault.tokenDecimals(bnb.address)).eq(18)
    expect(await vault.tokenWeights(bnb.address)).eq(7000)
    expect(await vault.totalTokenWeights()).eq(7000)
    expect(await vault.minProfitBasisPoints(bnb.address)).eq(75)
    expect(await vault.maxUsdgAmounts(bnb.address)).eq(500)
    expect(await vault.stableTokens(bnb.address)).eq(true)
    expect(await vault.shortableTokens(bnb.address)).eq(true)

    await daiPriceFeed.setLatestAnswer(toChainlinkPrice(1))
    await vault.setTokenConfig(
      dai.address, // _token
      20, // _tokenDecimals
      5000, // _tokenWeight
      10, // _minProfitBps
      500, // _maxUsdgAmount
      true, // _isStable
      false // _isShortable
    )

    expect(await vault.whitelistedTokenCount()).eq(2)
    expect(await vault.whitelistedTokens(bnb.address)).eq(true)
    expect(await vault.tokenDecimals(bnb.address)).eq(18)
    expect(await vault.tokenWeights(bnb.address)).eq(7000)
    expect(await vault.totalTokenWeights()).eq(12000)
    expect(await vault.minProfitBasisPoints(bnb.address)).eq(75)
    expect(await vault.maxUsdgAmounts(bnb.address)).eq(500)
    expect(await vault.stableTokens(bnb.address)).eq(true)
    expect(await vault.shortableTokens(bnb.address)).eq(true)

    await expect(vault.connect(user0).clearTokenConfig(bnb.address))
      .to.be.revertedWith("Vault: forbidden")

    await vault.clearTokenConfig(bnb.address)

    expect(await vault.whitelistedTokenCount()).eq(1)
    expect(await vault.whitelistedTokens(bnb.address)).eq(false)
    expect(await vault.tokenDecimals(bnb.address)).eq(0)
    expect(await vault.tokenWeights(bnb.address)).eq(0)
    expect(await vault.totalTokenWeights()).eq(5000)
    expect(await vault.minProfitBasisPoints(bnb.address)).eq(0)
    expect(await vault.maxUsdgAmounts(bnb.address)).eq(0)
    expect(await vault.stableTokens(bnb.address)).eq(false)
    expect(await vault.shortableTokens(bnb.address)).eq(false)

    await expect(vault.clearTokenConfig(bnb.address))
      .to.be.revertedWith("Vault: token not whitelisted")
  })

  it("addRouter", async () => {
    expect(await vault.approvedRouters(user0.address, user1.address)).eq(false)
    await vault.connect(user0).addRouter(user1.address)
    expect(await vault.approvedRouters(user0.address, user1.address)).eq(true)
  })

  it("removeRouter", async () => {
    expect(await vault.approvedRouters(user0.address, user1.address)).eq(false)
    await vault.connect(user0).addRouter(user1.address)
    expect(await vault.approvedRouters(user0.address, user1.address)).eq(true)
    await vault.connect(user0).removeRouter(user1.address)
    expect(await vault.approvedRouters(user0.address, user1.address)).eq(false)
  })

  it("setUsdgAmount", async () => {
    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(300))
    await vault.setTokenConfig(...getBnbConfig(bnb, bnbPriceFeed))
    await bnb.mint(user0.address, 100)
    await bnb.connect(user0).transfer(vault.address, 100)
    await vault.connect(user0).buyUSDG(bnb.address, user1.address)

    expect(await vault.usdgAmounts(bnb.address)).eq(29700)

    await expect(vault.connect(user0).setUsdgAmount(bnb.address, 50000))
      .to.be.revertedWith("Vault: forbidden")

    await vault.setGov(user0.address)

    expect(await vault.usdgAmounts(bnb.address)).eq(29700)
    await vault.connect(user0).setUsdgAmount(bnb.address, 50000)
    expect(await vault.usdgAmounts(bnb.address)).eq(50000)

    await vault.connect(user0).setUsdgAmount(bnb.address, 10000)
    expect(await vault.usdgAmounts(bnb.address)).eq(10000)
  })

  it("upgradeVault", async () => {
    await bnb.mint(vault.address, 1000)

    await expect(vault.connect(user0).upgradeVault(user1.address, bnb.address, 1000))
      .to.be.revertedWith("Vault: forbidden")

    await vault.setGov(user0.address)

    expect(await bnb.balanceOf(vault.address)).eq(1000)
    expect(await bnb.balanceOf(user1.address)).eq(0)
    await vault.connect(user0).upgradeVault(user1.address, bnb.address, 1000)
    expect(await bnb.balanceOf(vault.address)).eq(0)
    expect(await bnb.balanceOf(user1.address)).eq(1000)
  })

  it("setErrorController", async () => {
    const vaultErrorController = await deployContract("VaultErrorController", [])
    await expect(vaultErrorController.setErrors(vault.address, ["Example Error 1", "Example Error 2"]))
      .to.be.revertedWith("Vault: invalid errorController")

    await expect(vault.connect(user0).setErrorController(vaultErrorController.address))
      .to.be.revertedWith("Vault: forbidden")

    await vault.setGov(user0.address)

    await vault.connect(user0).setErrorController(vaultErrorController.address)
    expect(await vault.errorController()).eq(vaultErrorController.address)

    expect(await vault.errors(0)).eq("Vault: zero error")
    expect(await vault.errors(1)).eq("Vault: already initialized")
    expect(await vault.errors(2)).eq("Vault: invalid _maxLeverage")

    await expect(vaultErrorController.connect(user0).setErrors(vault.address, ["Example Error 1", "Example Error 2"]))
      .to.be.revertedWith("Governable: forbidden")

    await vaultErrorController.setErrors(vault.address, ["Example Error 1", "Example Error 2"])

    expect(await vault.errors(0)).eq("Example Error 1")
    expect(await vault.errors(1)).eq("Example Error 2")
    expect(await vault.errors(2)).eq("Vault: invalid _maxLeverage")
  })
})
