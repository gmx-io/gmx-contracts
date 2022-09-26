const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed } = require("../../shared/utilities")
const { toChainlinkPrice } = require("../../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../../shared/units")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig } = require("./helpers")

use(solidity)

describe("Vault.decreaseShortPosition", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let vault
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

  let glpManager
  let glp

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

    await initVault(vault, router, usdg, vaultPriceFeed)

    distributor0 = await deployContract("TimeDistributor", [])
    yieldTracker0 = await deployContract("YieldTracker", [usdg.address])

    await yieldTracker0.setDistributor(distributor0.address)
    await distributor0.setDistribution([yieldTracker0.address], [1000], [bnb.address])

    await bnb.mint(distributor0.address, 5000)
    await usdg.setYieldTrackers([yieldTracker0.address])

    await vaultPriceFeed.setTokenConfig(bnb.address, bnbPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(dai.address, daiPriceFeed.address, 8, false)

    glp = await deployContract("GLP", [])

    glpManager = await deployContract("GlpManager", [
      vault.address,
      usdg.address,
      glp.address,
      ethers.constants.AddressZero,
      24 * 60 * 60
    ])
  })

  it("decreasePosition short", async () => {
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

    await expect(vault.connect(user1).decreasePosition(user0.address, btc.address, btc.address, 0, 0, false, user2.address))
      .to.be.revertedWith("Vault: invalid msg.sender")

    await daiPriceFeed.setLatestAnswer(toChainlinkPrice(1))
    await vault.setTokenConfig(...getDaiConfig(dai, daiPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))
    await vault.setTokenConfig(...getBtcConfig(btc, btcPriceFeed))

    await expect(vault.connect(user0).decreasePosition(user0.address, dai.address, btc.address, 0, toUsd(1000), false, user2.address))
      .to.be.revertedWith("Vault: empty position")

    await dai.mint(user0.address, expandDecimals(1000, 18))
    await dai.connect(user0).transfer(vault.address, expandDecimals(100, 18))
    await vault.buyUSDG(dai.address, user1.address)

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(41000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))

    expect(await glpManager.getAumInUsdg(false), "aum min 0").eq("99960000000000000000") // 99.96
    expect(await glpManager.getAumInUsdg(true), "aum max 0").eq("99960000000000000000") // 99.96

    await dai.connect(user0).transfer(vault.address, expandDecimals(10, 18))
    await vault.connect(user0).increasePosition(user0.address, dai.address, btc.address, toUsd(90), false)

    expect(await glpManager.getAumInUsdg(false), "aum min 1").eq("99960000000000000000") // 99.96
    expect(await glpManager.getAumInUsdg(true), "aum max 1").eq("102210000000000000000") // 102.21

    let position = await vault.getPosition(user0.address, dai.address, btc.address, false)
    expect(position[0]).eq(toUsd(90)) // size
    expect(position[1]).eq(toUsd(9.91)) // collateral, 10 - 90 * 0.1%
    expect(position[2]).eq(toNormalizedPrice(40000)) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(expandDecimals(90, 18)) // reserveAmount
    expect(position[5]).eq(0) // pnl
    expect(position[6]).eq(true) // hasRealisedProfit

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(44000))
    let delta = await vault.getPositionDelta(user0.address, dai.address, btc.address, false)
    expect(delta[0]).eq(false)
    expect(delta[1]).eq(toUsd(9))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(1))
    delta = await vault.getPositionDelta(user0.address, dai.address, btc.address, false)
    expect(delta[0]).eq(false)
    expect(delta[1]).eq(toUsd(9))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(1))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(1))
    delta = await vault.getPositionDelta(user0.address, dai.address, btc.address, false)
    expect(delta[0]).eq(true)
    expect(delta[1]).eq(toUsd(89.99775))

    let leverage = await vault.getPositionLeverage(user0.address, dai.address, btc.address, false)
    expect(leverage).eq(90817) // ~9X leverage

    await expect(vault.connect(user0).decreasePosition(user0.address, dai.address, btc.address, 0, toUsd(100), false, user2.address))
      .to.be.revertedWith("Vault: position size exceeded")

    await expect(vault.connect(user0).decreasePosition(user0.address, dai.address, btc.address, toUsd(5), toUsd(50), false, user2.address))
      .to.be.revertedWith("Vault: liquidation fees exceed collateral")

    expect(await vault.feeReserves(dai.address)).eq("130000000000000000") // 0.13, 0.4 + 0.9
    expect(await vault.reservedAmounts(dai.address)).eq(expandDecimals(90, 18))
    expect(await vault.guaranteedUsd(dai.address)).eq(0)
    expect(await vault.poolAmounts(dai.address)).eq("99960000000000000000") // 99.96
    expect(await dai.balanceOf(user2.address)).eq(0)

    expect(await glpManager.getAumInUsdg(false), "aum min 2").eq("9962250000000000000") // 9.96225
    expect(await glpManager.getAumInUsdg(true), "aum max 2").eq("9962250000000000000") // 9.96225

    const tx = await vault.connect(user0).decreasePosition(user0.address, dai.address, btc.address, toUsd(3), toUsd(50), false, user2.address)
    await reportGasUsed(provider, tx, "decreasePosition gas used")

    expect(await glpManager.getAumInUsdg(false), "aum min 3").eq("9962250000000000000") // 9.96225
    expect(await glpManager.getAumInUsdg(true), "aum max 3").eq("9962250000000000000") // 9.96225

    position = await vault.getPosition(user0.address, dai.address, btc.address, false)
    expect(position[0]).eq(toUsd(40)) // size
    expect(position[1]).eq(toUsd(9.91 - 3)) // collateral
    expect(position[2]).eq(toNormalizedPrice(40000)) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(expandDecimals(40, 18)) // reserveAmount
    expect(position[5]).eq(toUsd(49.99875)) // pnl
    expect(position[6]).eq(true) // hasRealisedProfit

    expect(await vault.feeReserves(dai.address)).eq("180000000000000000") // 0.18, 0.4 + 0.9 + 0.5
    expect(await vault.reservedAmounts(dai.address)).eq(expandDecimals(40, 18))
    expect(await vault.guaranteedUsd(dai.address)).eq(0)
    expect(await vault.poolAmounts(dai.address)).eq("49961250000000000000") // 49.96125
    expect(await dai.balanceOf(user2.address)).eq("52948750000000000000") // 52.94875

    // (9.91-3) + 0.44 + 49.70125 + 52.94875 => 110

    leverage = await vault.getPositionLeverage(user0.address, dai.address, btc.address, false)
    expect(leverage).eq(57887) // ~5.8X leverage
  })

  it("decreasePosition short minProfitBasisPoints", async () => {
    await vault.setFees(
      50, // _taxBasisPoints
      10, // _stableTaxBasisPoints
      4, // _mintBurnFeeBasisPoints
      30, // _swapFeeBasisPoints
      4, // _stableSwapFeeBasisPoints
      10, // _marginFeeBasisPoints
      toUsd(5), // _liquidationFeeUsd
      60 * 60, // _minProfitTime
      false // _hasDynamicFees
    )

    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(300))
    await vault.setTokenConfig(...getBnbConfig(bnb, bnbPriceFeed))

    await expect(vault.connect(user1).decreasePosition(user0.address, btc.address, btc.address, 0, 0, false, user2.address))
      .to.be.revertedWith("Vault: invalid msg.sender")

    await daiPriceFeed.setLatestAnswer(toChainlinkPrice(1))
    await vault.setTokenConfig(...getDaiConfig(dai, daiPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))
    await vault.setTokenConfig(...getBtcConfig(btc, btcPriceFeed))

    await expect(vault.connect(user0).decreasePosition(user0.address, dai.address, btc.address, 0, toUsd(1000), false, user2.address))
      .to.be.revertedWith("Vault: empty position")

    await dai.mint(user0.address, expandDecimals(1000, 18))
    await dai.connect(user0).transfer(vault.address, expandDecimals(100, 18))
    await vault.buyUSDG(dai.address, user1.address)

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(41000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))

    expect(await glpManager.getAumInUsdg(false), "aum min 4").eq("99960000000000000000") // 99.96
    expect(await glpManager.getAumInUsdg(true), "aum max 4").eq("99960000000000000000") // 99.96

    await dai.connect(user0).transfer(vault.address, expandDecimals(10, 18))
    await vault.connect(user0).increasePosition(user0.address, dai.address, btc.address, toUsd(90), false)

    expect(await glpManager.getAumInUsdg(false), "aum min 5").eq("99960000000000000000") // 99.96
    expect(await glpManager.getAumInUsdg(true), "aum max 5").eq("102210000000000000000") // 102.21

    let position = await vault.getPosition(user0.address, dai.address, btc.address, false)
    expect(position[0]).eq(toUsd(90)) // size
    expect(position[1]).eq(toUsd(9.91)) // collateral, 10 - 90 * 0.1%
    expect(position[2]).eq(toNormalizedPrice(40000)) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(expandDecimals(90, 18)) // reserveAmount
    expect(position[5]).eq(0) // pnl
    expect(position[6]).eq(true) // hasRealisedProfit

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(39701)) // 40,000 * (100 - 0.75)% => 39700
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(39701))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(39701))
    let delta = await vault.getPositionDelta(user0.address, dai.address, btc.address, false)
    expect(delta[0]).eq(true)
    expect(delta[1]).eq(toUsd(0))

    await increaseTime(provider, 50 * 60)
    await mineBlock(provider)

    delta = await vault.getPositionDelta(user0.address, dai.address, btc.address, false)
    expect(delta[0]).eq(true)
    expect(delta[1]).eq("0")

    await increaseTime(provider, 10 * 60 + 10)
    await mineBlock(provider)

    delta = await vault.getPositionDelta(user0.address, dai.address, btc.address, false)
    expect(delta[0]).eq(true)
    expect(delta[1]).eq("672750000000000000000000000000") // 0.67275
  })

  it("decreasePosition short with loss", async () => {
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

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))
    await vault.setTokenConfig(...getBtcConfig(btc, btcPriceFeed))

    await dai.mint(user0.address, expandDecimals(1000, 18))
    await dai.connect(user0).transfer(vault.address, expandDecimals(100, 18))
    await vault.buyUSDG(dai.address, user1.address)

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(41000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))

    expect(await glpManager.getAumInUsdg(false), "aum min 6").eq("99960000000000000000") // 99.96
    expect(await glpManager.getAumInUsdg(true), "aum max 6").eq("99960000000000000000") // 99.96

    await dai.connect(user0).transfer(vault.address, expandDecimals(10, 18))
    await vault.connect(user0).increasePosition(user0.address, dai.address, btc.address, toUsd(90), false)

    expect(await glpManager.getAumInUsdg(false), "aum min 7").eq("99960000000000000000") // 99.96
    expect(await glpManager.getAumInUsdg(true), "aum max 7").eq("102210000000000000000") // 102.21

    let position = await vault.getPosition(user0.address, dai.address, btc.address, false)
    expect(position[0]).eq(toUsd(90)) // size
    expect(position[1]).eq(toUsd(9.91)) // collateral, 10 - 90 * 0.1%
    expect(position[2]).eq(toNormalizedPrice(40000)) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(expandDecimals(90, 18)) // reserveAmount
    expect(position[5]).eq(0) // pnl
    expect(position[6]).eq(true) // hasRealisedProfit

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40400))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40400))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40400))
    let delta = await vault.getPositionDelta(user0.address, dai.address, btc.address, false)
    expect(delta[0]).eq(false)
    expect(delta[1]).eq(toUsd(0.9))

    let leverage = await vault.getPositionLeverage(user0.address, dai.address, btc.address, false)
    expect(leverage).eq(90817) // ~9X leverage

    expect(await vault.feeReserves(dai.address)).eq("130000000000000000") // 0.13
    expect(await vault.reservedAmounts(dai.address)).eq(expandDecimals(90, 18))
    expect(await vault.guaranteedUsd(dai.address)).eq(0)
    expect(await vault.poolAmounts(dai.address)).eq("99960000000000000000") // 99.96
    expect(await dai.balanceOf(user2.address)).eq(0)

    await expect(vault.connect(user0).decreasePosition(user0.address, dai.address, btc.address, toUsd(4), toUsd(50), false, user2.address))
      .to.be.revertedWith("Vault: liquidation fees exceed collateral")

    expect(await glpManager.getAumInUsdg(false), "aum min 7").eq("100860000000000000000") // 100.86
    expect(await glpManager.getAumInUsdg(true), "aum max 7").eq("100860000000000000000") // 100.86

    await vault.connect(user0).decreasePosition(user0.address, dai.address, btc.address, toUsd(0), toUsd(50), false, user2.address)

    expect(await glpManager.getAumInUsdg(false), "aum min 8").eq("100860000000000000000") // 100.86
    expect(await glpManager.getAumInUsdg(true), "aum max 8").eq("100860000000000000000") // 100.86

    position = await vault.getPosition(user0.address, dai.address, btc.address, false)
    expect(position[0]).eq(toUsd(40)) // size
    expect(position[1]).eq(toUsd(9.36)) // collateral, 9.91 - 0.5 (losses) - 0.05 (fees)
    expect(position[2]).eq(toNormalizedPrice(40000)) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(expandDecimals(40, 18)) // reserveAmount
    expect(position[5]).eq(toUsd(0.5)) // pnl
    expect(position[6]).eq(false) // hasRealisedProfit

    expect(await vault.feeReserves(dai.address)).eq("180000000000000000") // 0.18
    expect(await vault.reservedAmounts(dai.address)).eq(expandDecimals(40, 18)) // 40
    expect(await vault.guaranteedUsd(dai.address)).eq(0)
    expect(await vault.poolAmounts(dai.address)).eq("100460000000000000000") // 100.46
    expect(await dai.balanceOf(user2.address)).eq(0)

    await vault.connect(user0).decreasePosition(user0.address, dai.address, btc.address, toUsd(0), toUsd(40), false, user2.address)

    position = await vault.getPosition(user0.address, dai.address, btc.address, false)
    expect(position[0]).eq(0) // size
    expect(position[1]).eq(0) // collateral
    expect(position[2]).eq(0) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(0) // reserveAmount
    expect(position[5]).eq(0) // pnl
    expect(position[6]).eq(true) // hasRealisedProfit

    expect(await vault.feeReserves(dai.address)).eq("220000000000000000") // 0.22
    expect(await vault.reservedAmounts(dai.address)).eq(0)
    expect(await vault.guaranteedUsd(dai.address)).eq(0)
    expect(await vault.poolAmounts(dai.address)).eq("100860000000000000000") // 100.86
    expect(await dai.balanceOf(user2.address)).eq("8920000000000000000") // 8.92
  })
})
