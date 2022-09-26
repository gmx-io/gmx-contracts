const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed } = require("../../shared/utilities")
const { toChainlinkPrice } = require("../../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../../shared/units")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig, validateVaultBalance } = require("./helpers")

use(solidity)

describe("Vault.liquidateShortPosition", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let vault
  let glpManager
  let vaultPriceFeed
  let glp
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
    glp = await deployContract("GLP", [])
    usdg = await deployContract("USDG", [vault.address])
    router = await deployContract("Router", [vault.address, usdg.address, bnb.address])
    vaultPriceFeed = await deployContract("VaultPriceFeed", [])

    await initVault(vault, router, usdg, vaultPriceFeed)
    glpManager = await deployContract("GlpManager", [vault.address, usdg.address, glp.address, ethers.constants.AddressZero, 24 * 60 * 60])

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

  it("liquidate short", async () => {
    await vault.setFees(
      50, // _taxBasisPoints
      10, // _stableTaxBasisPoints
      4, // _mintBurnFeeBasisPoints
      30, // _swapFeeBasisPoints
      4, // _stableSwapFeeBasisPoints
      10, // _marginFeeBasisPoints
      toUsd(5), // _liquidationFeeUsd
      0, // _minProfitTime
      false // _hasDynamicFees
    )

    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(300))
    await vault.setTokenConfig(...getBnbConfig(bnb, bnbPriceFeed))

    await daiPriceFeed.setLatestAnswer(toChainlinkPrice(1))
    await vault.setTokenConfig(...getDaiConfig(dai, daiPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await vault.setTokenConfig(...getBtcConfig(btc, btcPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(41000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))

    await expect(vault.connect(user0).liquidatePosition(user0.address, dai.address, btc.address, false, user2.address))
      .to.be.revertedWith("Vault: empty position")

    expect(await vault.globalShortSizes(btc.address)).eq(0)
    expect(await vault.globalShortAveragePrices(btc.address)).eq(0)
    expect(await glpManager.getAumInUsdg(true)).eq(0)

    await dai.mint(user0.address, expandDecimals(1000, 18))
    await dai.connect(user0).transfer(vault.address, expandDecimals(100, 18))
    await vault.buyUSDG(dai.address, user1.address)

    await dai.connect(user0).transfer(vault.address, expandDecimals(10, 18))
    await vault.connect(user0).increasePosition(user0.address, dai.address, btc.address, toUsd(90), false)

    let position = await vault.getPosition(user0.address, dai.address, btc.address, false)
    expect(position[0]).eq(toUsd(90)) // size
    expect(position[1]).eq(toUsd(9.91)) // collateral, 10 - 90 * 0.1%
    expect(position[2]).eq(toNormalizedPrice(40000)) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(expandDecimals(90, 18)) // reserveAmount

    expect(await vault.globalShortSizes(btc.address)).eq(toUsd(90))
    expect(await vault.globalShortAveragePrices(btc.address)).eq(toNormalizedPrice(40000))
    expect(await glpManager.getAumInUsdg(false)).eq("99960000000000000000") // 99.96

    expect((await vault.validateLiquidation(user0.address, dai.address, btc.address, false, false))[0]).eq(0)

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(39000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(39000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(39000))

    let delta = await vault.getPositionDelta(user0.address, dai.address, btc.address, false)
    expect(delta[0]).eq(true)
    expect(delta[1]).eq(toUsd(2.25)) // 1000 / 40,000 * 90
    expect((await vault.validateLiquidation(user0.address, dai.address, btc.address, false, false))[0]).eq(0)

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(41000))
    delta = await vault.getPositionDelta(user0.address, dai.address, btc.address, false)
    expect(delta[0]).eq(false)
    expect(delta[1]).eq(toUsd(2.25))
    expect((await vault.validateLiquidation(user0.address, dai.address, btc.address, false, false))[0]).eq(0)

    await expect(vault.liquidatePosition(user0.address, dai.address, btc.address, false, user2.address))
      .to.be.revertedWith("Vault: position cannot be liquidated")

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(42500))
    delta = await vault.getPositionDelta(user0.address, dai.address, btc.address, false)
    expect(delta[0]).eq(false)
    expect(delta[1]).eq("5625000000000000000000000000000") // 2500 / 40,000 * 90 => 5.625
    expect((await vault.validateLiquidation(user0.address, dai.address, btc.address, false, false))[0]).eq(1)

    position = await vault.getPosition(user0.address, dai.address, btc.address, false)
    expect(position[0]).eq(toUsd(90)) // size
    expect(position[1]).eq(toUsd(9.91)) // collateral, 10 - 90 * 0.1%
    expect(position[2]).eq(toNormalizedPrice(40000)) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(expandDecimals(90, 18)) // reserveAmount

    expect(await vault.feeReserves(dai.address)).eq("130000000000000000") // 0.13
    expect(await vault.reservedAmounts(dai.address)).eq(expandDecimals(90, 18))
    expect(await vault.guaranteedUsd(dai.address)).eq(0)
    expect(await vault.poolAmounts(dai.address)).eq("99960000000000000000")
    expect(await dai.balanceOf(user2.address)).eq(0)

    const tx = await vault.liquidatePosition(user0.address, dai.address, btc.address, false, user2.address)
    await reportGasUsed(provider, tx, "liquidatePosition gas used")

    position = await vault.getPosition(user0.address, dai.address, btc.address, false)
    expect(position[0]).eq(0) // size
    expect(position[1]).eq(0) // collateral
    expect(position[2]).eq(0) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(0) // reserveAmount

    expect(await vault.feeReserves(dai.address)).eq("220000000000000000") // 0.22
    expect(await vault.reservedAmounts(dai.address)).eq(0)
    expect(await vault.guaranteedUsd(dai.address)).eq(0)
    expect(await vault.poolAmounts(dai.address)).eq("104780000000000000000") // 104.78
    expect(await dai.balanceOf(user2.address)).eq(expandDecimals(5, 18))

    expect(await vault.globalShortSizes(btc.address)).eq(0)
    expect(await vault.globalShortAveragePrices(btc.address)).eq(toNormalizedPrice(40000))
    expect(await glpManager.getAumInUsdg(true)).eq("104780000000000000000") // 104.78

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(50000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(50000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(50000))

    await dai.connect(user0).transfer(vault.address, expandDecimals(20, 18))
    await vault.connect(user0).increasePosition(user0.address, dai.address, btc.address, toUsd(100), false)

    expect(await vault.globalShortSizes(btc.address)).eq(toUsd(100))
    expect(await vault.globalShortAveragePrices(btc.address)).eq(toNormalizedPrice(50000))
    expect(await glpManager.getAumInUsdg(true)).eq("104780000000000000000") // 104.78

    position = await vault.getPosition(user0.address, dai.address, btc.address, false)
    await validateVaultBalance(expect, vault, dai, position[1].mul(expandDecimals(10, 18)).div(expandDecimals(10, 30)))
  })

  it("automatic stop-loss", async () => {
    await vault.setFees(
      50, // _taxBasisPoints
      10, // _stableTaxBasisPoints
      4, // _mintBurnFeeBasisPoints
      30, // _swapFeeBasisPoints
      4, // _stableSwapFeeBasisPoints
      10, // _marginFeeBasisPoints
      toUsd(5), // _liquidationFeeUsd
      0, // _minProfitTime
      false // _hasDynamicFees
    )

    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(300))
    await vault.setTokenConfig(...getBnbConfig(bnb, bnbPriceFeed))

    await daiPriceFeed.setLatestAnswer(toChainlinkPrice(1))
    await vault.setTokenConfig(...getDaiConfig(dai, daiPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await vault.setTokenConfig(...getBtcConfig(btc, btcPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(41000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))

    await expect(vault.connect(user0).liquidatePosition(user0.address, dai.address, btc.address, false, user2.address))
      .to.be.revertedWith("Vault: empty position")

    expect(await vault.globalShortSizes(btc.address)).eq(0)
    expect(await vault.globalShortAveragePrices(btc.address)).eq(0)
    expect(await glpManager.getAumInUsdg(true)).eq(0)

    await dai.mint(user0.address, expandDecimals(1001, 18))
    await dai.connect(user0).transfer(vault.address, expandDecimals(1001, 18))
    await vault.buyUSDG(dai.address, user1.address)

    await dai.mint(user0.address, expandDecimals(100, 18))
    await dai.connect(user0).transfer(vault.address, expandDecimals(100, 18))
    await vault.connect(user0).increasePosition(user0.address, dai.address, btc.address, toUsd(1000), false)

    let position = await vault.getPosition(user0.address, dai.address, btc.address, false)
    expect(position[0]).eq(toUsd(1000)) // size
    expect(position[1]).eq(toUsd(99)) // collateral, 10 - 90 * 0.1%
    expect(position[2]).eq(toNormalizedPrice(40000)) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(expandDecimals(1000, 18)) // reserveAmount

    expect(await vault.globalShortSizes(btc.address)).eq(toUsd(1000))
    expect(await vault.globalShortAveragePrices(btc.address)).eq(toNormalizedPrice(40000))
    expect(await glpManager.getAumInUsdg(false)).eq("1000599600000000000000") // 1000.5996

    expect((await vault.validateLiquidation(user0.address, dai.address, btc.address, false, false))[0]).eq(0)

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(39000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(39000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(39000))

    let delta = await vault.getPositionDelta(user0.address, dai.address, btc.address, false)
    expect(delta[0]).eq(true)
    expect(delta[1]).eq(toUsd(25)) // 1000 / 40,000 * 1000
    expect((await vault.validateLiquidation(user0.address, dai.address, btc.address, false, false))[0]).eq(0)

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(41000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(41000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(41000))
    delta = await vault.getPositionDelta(user0.address, dai.address, btc.address, false)
    expect(delta[0]).eq(false)
    expect(delta[1]).eq(toUsd(25))
    expect((await vault.validateLiquidation(user0.address, dai.address, btc.address, false, false))[0]).eq(0)

    await expect(vault.liquidatePosition(user0.address, dai.address, btc.address, false, user2.address))
      .to.be.revertedWith("Vault: position cannot be liquidated")

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(45000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(45000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(45000))
    delta = await vault.getPositionDelta(user0.address, dai.address, btc.address, false)
    expect(delta[0]).eq(false)
    expect(delta[1]).eq(toUsd(125)) // 5000 / 40,000 * 1000 => 125
    expect((await vault.validateLiquidation(user0.address, dai.address, btc.address, false, false))[0]).eq(1)

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(43600))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(43600))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(43600))
    delta = await vault.getPositionDelta(user0.address, dai.address, btc.address, false)
    expect(delta[0]).eq(false)
    expect(delta[1]).eq(toUsd(90)) // 3600 / 40,000 * 1000 => 90
    expect((await vault.validateLiquidation(user0.address, dai.address, btc.address, false, false))[0]).eq(2)

    position = await vault.getPosition(user0.address, dai.address, btc.address, false)
    expect(position[0]).eq(toUsd(1000)) // size
    expect(position[1]).eq(toUsd(99)) // collateral, 10 - 90 * 0.1%
    expect(position[2]).eq(toNormalizedPrice(40000)) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(expandDecimals(1000, 18)) // reserveAmount

    expect(await vault.feeReserves(dai.address)).eq("1400400000000000000") // 1.4004
    expect(await vault.reservedAmounts(dai.address)).eq(expandDecimals(1000, 18))
    expect(await vault.guaranteedUsd(dai.address)).eq(0)
    expect(await vault.poolAmounts(dai.address)).eq("1000599600000000000000") // 1000.5996
    expect(await dai.balanceOf(wallet.address)).eq(0)
    expect(await dai.balanceOf(user0.address)).eq(0)
    expect(await dai.balanceOf(user1.address)).eq(0)
    expect(await dai.balanceOf(user2.address)).eq(0)
    expect(await vault.globalShortSizes(btc.address)).eq(toUsd(1000))
    expect(await vault.globalShortAveragePrices(btc.address)).eq(toNormalizedPrice(40000))
    expect(await glpManager.getAumInUsdg(true)).eq("1090599600000000000000") // 1090.5996

    const tx = await vault.liquidatePosition(user0.address, dai.address, btc.address, false, user2.address)
    await reportGasUsed(provider, tx, "liquidatePosition gas used")

    position = await vault.getPosition(user0.address, dai.address, btc.address, false)
    expect(position[0]).eq(0) // size
    expect(position[1]).eq(0) // collateral
    expect(position[2]).eq(0) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(0) // reserveAmount

    expect(await vault.feeReserves(dai.address)).eq("2400400000000000000") // 2.4004
    expect(await vault.reservedAmounts(dai.address)).eq(0)
    expect(await vault.guaranteedUsd(dai.address)).eq(0)
    expect(await vault.poolAmounts(dai.address)).eq("1090599600000000000000") // 1090.5996
    expect(await dai.balanceOf(wallet.address)).eq(0)
    expect(await dai.balanceOf(user0.address)).eq(expandDecimals(8, 18))
    expect(await dai.balanceOf(user1.address)).eq(0)
    expect(await dai.balanceOf(user2.address)).eq(0)

    expect(await vault.globalShortSizes(btc.address)).eq(0)
    expect(await vault.globalShortAveragePrices(btc.address)).eq(toNormalizedPrice(40000))
    expect(await glpManager.getAumInUsdg(true)).eq("1090599600000000000000") // 1090.5996

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(50000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(50000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(50000))

    await dai.mint(user0.address, expandDecimals(20, 18))
    await dai.connect(user0).transfer(vault.address, expandDecimals(20, 18))
    await vault.connect(user0).increasePosition(user0.address, dai.address, btc.address, toUsd(100), false)

    expect(await vault.globalShortSizes(btc.address)).eq(toUsd(100))
    expect(await vault.globalShortAveragePrices(btc.address)).eq(toNormalizedPrice(50000))
    expect(await glpManager.getAumInUsdg(true)).eq("1090599600000000000000") // 1090.5996

    position = await vault.getPosition(user0.address, dai.address, btc.address, false)
    await validateVaultBalance(expect, vault, dai, position[1].mul(expandDecimals(10, 18)).div(expandDecimals(10, 30)))
  })

  it("global AUM", async () => {
    await vault.setFees(
      50, // _taxBasisPoints
      10, // _stableTaxBasisPoints
      4, // _mintBurnFeeBasisPoints
      30, // _swapFeeBasisPoints
      4, // _stableSwapFeeBasisPoints
      10, // _marginFeeBasisPoints
      toUsd(5), // _liquidationFeeUsd
      0, // _minProfitTime
      false // _hasDynamicFees
    )

    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(300))
    await vault.setTokenConfig(...getBnbConfig(bnb, bnbPriceFeed))

    await daiPriceFeed.setLatestAnswer(toChainlinkPrice(1))
    await vault.setTokenConfig(...getDaiConfig(dai, daiPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await vault.setTokenConfig(...getBtcConfig(btc, btcPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(41000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))

    await expect(vault.connect(user0).liquidatePosition(user0.address, dai.address, btc.address, false, user2.address))
      .to.be.revertedWith("Vault: empty position")

    expect(await vault.globalShortSizes(btc.address)).eq(0)
    expect(await vault.globalShortAveragePrices(btc.address)).eq(0)
    expect(await glpManager.getAumInUsdg(true)).eq(0)

    await dai.mint(user0.address, expandDecimals(1001, 18))
    await dai.connect(user0).transfer(vault.address, expandDecimals(1001, 18))
    await vault.buyUSDG(dai.address, user1.address)

    await dai.mint(user0.address, expandDecimals(100, 18))
    await dai.connect(user0).transfer(vault.address, expandDecimals(100, 18))
    await vault.connect(user0).increasePosition(user0.address, dai.address, btc.address, toUsd(1000), false)

    let position = await vault.getPosition(user0.address, dai.address, btc.address, false)
    expect(position[0]).eq(toUsd(1000)) // size
    expect(position[1]).eq(toUsd(99)) // collateral, 10 - 90 * 0.1%
    expect(position[2]).eq(toNormalizedPrice(40000)) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(expandDecimals(1000, 18)) // reserveAmount

    expect(await vault.globalShortSizes(btc.address)).eq(toUsd(1000))
    expect(await vault.globalShortAveragePrices(btc.address)).eq(toNormalizedPrice(40000))
    expect(await glpManager.getAumInUsdg(false)).eq("1000599600000000000000") // 1000.5996

    expect((await vault.validateLiquidation(user0.address, dai.address, btc.address, false, false))[0]).eq(0)

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(39000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(39000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(39000))

    let delta = await vault.getPositionDelta(user0.address, dai.address, btc.address, false)
    expect(delta[0]).eq(true)
    expect(delta[1]).eq(toUsd(25)) // 1000 / 40,000 * 1000
    expect((await vault.validateLiquidation(user0.address, dai.address, btc.address, false, false))[0]).eq(0)

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(41000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(41000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(41000))
    delta = await vault.getPositionDelta(user0.address, dai.address, btc.address, false)
    expect(delta[0]).eq(false)
    expect(delta[1]).eq(toUsd(25))
    expect((await vault.validateLiquidation(user0.address, dai.address, btc.address, false, false))[0]).eq(0)

    await expect(vault.liquidatePosition(user0.address, dai.address, btc.address, false, user2.address))
      .to.be.revertedWith("Vault: position cannot be liquidated")

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(45000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(45000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(45000))
    delta = await vault.getPositionDelta(user0.address, dai.address, btc.address, false)
    expect(delta[0]).eq(false)
    expect(delta[1]).eq(toUsd(125)) // 5000 / 40,000 * 1000 => 125
    expect((await vault.validateLiquidation(user0.address, dai.address, btc.address, false, false))[0]).eq(1)

    position = await vault.getPosition(user0.address, dai.address, btc.address, false)
    expect(position[0]).eq(toUsd(1000)) // size
    expect(position[1]).eq(toUsd(99)) // collateral, 10 - 90 * 0.1%
    expect(position[2]).eq(toNormalizedPrice(40000)) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(expandDecimals(1000, 18)) // reserveAmount

    expect(await vault.feeReserves(dai.address)).eq("1400400000000000000") // 1.4004
    expect(await vault.reservedAmounts(dai.address)).eq(expandDecimals(1000, 18))
    expect(await vault.guaranteedUsd(dai.address)).eq(0)
    expect(await vault.poolAmounts(dai.address)).eq("1000599600000000000000") // 1000.5996
    expect(await dai.balanceOf(wallet.address)).eq(0)
    expect(await dai.balanceOf(user0.address)).eq(0)
    expect(await dai.balanceOf(user1.address)).eq(0)
    expect(await dai.balanceOf(user2.address)).eq(0)
    expect(await vault.globalShortSizes(btc.address)).eq(toUsd(1000))
    expect(await vault.globalShortAveragePrices(btc.address)).eq(toNormalizedPrice(40000))
    expect(await glpManager.getAumInUsdg(true)).eq("1125599600000000000000") // 1125.5996

    const tx = await vault.liquidatePosition(user0.address, dai.address, btc.address, false, user2.address)
    await reportGasUsed(provider, tx, "liquidatePosition gas used")

    position = await vault.getPosition(user0.address, dai.address, btc.address, false)
    expect(position[0]).eq(0) // size
    expect(position[1]).eq(0) // collateral
    expect(position[2]).eq(0) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(0) // reserveAmount

    expect(await vault.feeReserves(dai.address)).eq("2400400000000000000") // 2.4004
    expect(await vault.reservedAmounts(dai.address)).eq(0)
    expect(await vault.guaranteedUsd(dai.address)).eq(0)
    expect(await vault.poolAmounts(dai.address)).eq("1093599600000000000000") // 1093.5996
    expect(await dai.balanceOf(wallet.address)).eq(0)
    expect(await dai.balanceOf(user0.address)).eq(0)
    expect(await dai.balanceOf(user1.address)).eq(0)
    expect(await dai.balanceOf(user2.address)).eq(expandDecimals(5, 18))

    expect(await vault.globalShortSizes(btc.address)).eq(0)
    expect(await vault.globalShortAveragePrices(btc.address)).eq(toNormalizedPrice(40000))
    expect(await glpManager.getAumInUsdg(true)).eq("1093599600000000000000") // 1093.5996

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(50000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(50000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(50000))

    await dai.mint(user0.address, expandDecimals(20, 18))
    await dai.connect(user0).transfer(vault.address, expandDecimals(20, 18))
    await vault.connect(user0).increasePosition(user0.address, dai.address, btc.address, toUsd(100), false)

    expect(await vault.globalShortSizes(btc.address)).eq(toUsd(100))
    expect(await vault.globalShortAveragePrices(btc.address)).eq(toNormalizedPrice(50000))
    expect(await glpManager.getAumInUsdg(true)).eq("1093599600000000000000") // 1093.5996

    position = await vault.getPosition(user0.address, dai.address, btc.address, false)
    await validateVaultBalance(expect, vault, dai, position[1].mul(expandDecimals(10, 18)).div(expandDecimals(10, 30)))
  })
})
