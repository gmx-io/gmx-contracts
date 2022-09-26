const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed } = require("../../shared/utilities")
const { toChainlinkPrice } = require("../../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../../shared/units")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig } = require("./helpers")

use(solidity)

describe("Vault.increaseShortPosition", function () {
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

    const initVaultResult = await initVault(vault, router, usdg, vaultPriceFeed)
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

  it("increasePosition short validations", async () => {
    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(300))
    await vault.setTokenConfig(...getBnbConfig(bnb, bnbPriceFeed))
    await expect(vault.connect(user1).increasePosition(user0.address, dai.address, btc.address, 0, false))
      .to.be.revertedWith("Vault: invalid msg.sender")
    await expect(vault.connect(user0).increasePosition(user0.address, dai.address, btc.address, toUsd(1000), false))
      .to.be.revertedWith("Vault: _collateralToken not whitelisted")
    await expect(vault.connect(user0).increasePosition(user0.address, bnb.address, bnb.address, toUsd(1000), false))
      .to.be.revertedWith("Vault: _collateralToken must be a stableToken")
    await daiPriceFeed.setLatestAnswer(toChainlinkPrice(1))
    await vault.setTokenConfig(...getDaiConfig(dai, daiPriceFeed))

    await expect(vault.connect(user0).increasePosition(user0.address, dai.address, dai.address, toUsd(1000), false))
      .to.be.revertedWith("Vault: _indexToken must not be a stableToken")

    await expect(vault.connect(user0).increasePosition(user0.address, dai.address, btc.address, toUsd(1000), false))
      .to.be.revertedWith("Vault: _indexToken not shortable")

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))
    await vault.setTokenConfig(
      btc.address, // _token
      8, // _tokenDecimals
      10000, // _tokenWeight
      75, // _minProfitBps
      0, // _maxUsdgAmount
      false, // _isStable
      false // _isShortable
    )

    await expect(vault.connect(user0).increasePosition(user0.address, dai.address, btc.address, toUsd(1000), false))
      .to.be.revertedWith("Vault: _indexToken not shortable")

    await vault.setTokenConfig(...getBtcConfig(btc, btcPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(50000))

    await expect(vault.connect(user0).increasePosition(user0.address, dai.address, btc.address, toUsd(1000), false))
      .to.be.revertedWith("Vault: insufficient collateral for fees")
    await expect(vault.connect(user0).increasePosition(user0.address, dai.address, btc.address, 0, false))
      .to.be.revertedWith("Vault: invalid position.size")

    await dai.mint(user0.address, expandDecimals(1000, 18))
    await dai.connect(user0).transfer(vault.address, expandDecimals(9, 17))

    await expect(vault.connect(user0).increasePosition(user0.address, dai.address, btc.address, toUsd(1000), false))
      .to.be.revertedWith("Vault: insufficient collateral for fees")

    await dai.connect(user0).transfer(vault.address, expandDecimals(4, 18))

    await expect(vault.connect(user0).increasePosition(user0.address, dai.address, btc.address, toUsd(1000), false))
      .to.be.revertedWith("Vault: losses exceed collateral")

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(41000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))

    await expect(vault.connect(user0).increasePosition(user0.address, dai.address, btc.address, toUsd(100), false))
      .to.be.revertedWith("Vault: liquidation fees exceed collateral")

    await dai.connect(user0).transfer(vault.address, expandDecimals(6, 18))

    await expect(vault.connect(user0).increasePosition(user0.address, dai.address, btc.address, toUsd(8), false))
      .to.be.revertedWith("Vault: _size must be more than _collateral")

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))

    await expect(vault.connect(user0).increasePosition(user0.address, dai.address, btc.address, toUsd(600), false))
      .to.be.revertedWith("Vault: maxLeverage exceeded")

    await expect(vault.connect(user0).increasePosition(user0.address, dai.address, btc.address, toUsd(100), false))
      .to.be.revertedWith("Vault: reserve exceeds pool")
  })

  it("increasePosition short", async () => {
    await vault.setMaxGlobalShortSize(btc.address, toUsd(300))

    let globalDelta = await vault.getGlobalShortDelta(btc.address)
    expect(await globalDelta[0]).eq(false)
    expect(await globalDelta[1]).eq(0)
    expect(await glpManager.getAumInUsdg(true)).eq(0)
    expect(await glpManager.getAumInUsdg(false)).eq(0)

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

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))
    await vault.setTokenConfig(...getBtcConfig(btc, btcPriceFeed))

    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(1000))
    await vault.setTokenConfig(...getBnbConfig(bnb, bnbPriceFeed))

    await daiPriceFeed.setLatestAnswer(toChainlinkPrice(1))
    await vault.setTokenConfig(...getDaiConfig(dai, daiPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))

    await dai.mint(user0.address, expandDecimals(1000, 18))
    await dai.connect(user0).transfer(vault.address, expandDecimals(500, 18))

    await expect(vault.connect(user0).increasePosition(user0.address, dai.address, btc.address, toUsd(99), false))
      .to.be.revertedWith("Vault: _size must be more than _collateral")

    await expect(vault.connect(user0).increasePosition(user0.address, dai.address, btc.address, toUsd(501), false))
      .to.be.revertedWith("Vault: reserve exceeds pool")

    expect(await vault.feeReserves(dai.address)).eq(0)
    expect(await vault.usdgAmounts(dai.address)).eq(0)
    expect(await vault.poolAmounts(dai.address)).eq(0)

    expect(await vault.getRedemptionCollateralUsd(dai.address)).eq(0)
    await vault.buyUSDG(dai.address, user1.address)
    expect(await vault.getRedemptionCollateralUsd(dai.address)).eq("499800000000000000000000000000000")

    expect(await vault.feeReserves(dai.address)).eq("200000000000000000") // 0.2
    expect(await vault.usdgAmounts(dai.address)).eq("499800000000000000000") // 499.8
    expect(await vault.poolAmounts(dai.address)).eq("499800000000000000000") // 499.8

    globalDelta = await vault.getGlobalShortDelta(btc.address)
    expect(await globalDelta[0]).eq(false)
    expect(await globalDelta[1]).eq(0)
    expect(await glpManager.getAumInUsdg(true)).eq("499800000000000000000")
    expect(await glpManager.getAumInUsdg(false)).eq("499800000000000000000")

    await dai.connect(user0).transfer(vault.address, expandDecimals(20, 18))
    await expect(vault.connect(user0).increasePosition(user0.address, dai.address, btc.address, toUsd(501), false))
      .to.be.revertedWith("Vault: reserve exceeds pool")

    expect(await vault.reservedAmounts(btc.address)).eq(0)
    expect(await vault.guaranteedUsd(btc.address)).eq(0)

    let position = await vault.getPosition(user0.address, dai.address, btc.address, false)
    expect(position[0]).eq(0) // size
    expect(position[1]).eq(0) // collateral
    expect(position[2]).eq(0) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(0) // reserveAmount
    expect(position[5]).eq(0) // realisedPnl
    expect(position[6]).eq(true) // hasProfit
    expect(position[7]).eq(0) // lastIncreasedTime

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(41000))
    const tx = await vault.connect(user0).increasePosition(user0.address, dai.address, btc.address, toUsd(90), false)
    await reportGasUsed(provider, tx, "increasePosition gas used")

    expect(await vault.poolAmounts(dai.address)).eq("499800000000000000000")
    expect(await vault.reservedAmounts(dai.address)).eq(expandDecimals(90, 18))
    expect(await vault.guaranteedUsd(dai.address)).eq(0)
    expect(await vault.getRedemptionCollateralUsd(dai.address)).eq("499800000000000000000000000000000")

    const blockTime = await getBlockTime(provider)

    position = await vault.getPosition(user0.address, dai.address, btc.address, false)
    expect(position[0]).eq(toUsd(90)) // size
    expect(position[1]).eq(toUsd(19.91)) // collateral
    expect(position[2]).eq(toNormalizedPrice(40000)) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(expandDecimals(90, 18)) // reserveAmount
    expect(position[5]).eq(0) // realisedPnl
    expect(position[6]).eq(true) // hasProfit
    expect(position[7]).eq(blockTime) // lastIncreasedTime

    expect(await vault.feeReserves(dai.address)).eq("290000000000000000") // 0.29
    expect(await vault.usdgAmounts(dai.address)).eq("499800000000000000000") // 499.8
    expect(await vault.poolAmounts(dai.address)).eq("499800000000000000000") // 499.8

    expect(await vault.globalShortSizes(btc.address)).eq(toUsd(90))
    expect(await vault.globalShortAveragePrices(btc.address)).eq(toNormalizedPrice(40000))

    globalDelta = await vault.getGlobalShortDelta(btc.address)
    expect(await globalDelta[0]).eq(false)
    expect(await globalDelta[1]).eq(toUsd(2.25))
    expect(await glpManager.getAumInUsdg(true)).eq("502050000000000000000")
    expect(await glpManager.getAumInUsdg(false)).eq("499800000000000000000")

    let delta = await vault.getPositionDelta(user0.address, dai.address, btc.address, false)
    expect(delta[0]).eq(false)
    expect(delta[1]).eq(toUsd(2.25))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(42000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(42000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(42000))

    delta = await vault.getPositionDelta(user0.address, dai.address, btc.address, false)
    expect(delta[0]).eq(false)
    expect(delta[1]).eq(toUsd(4.5))

    globalDelta = await vault.getGlobalShortDelta(btc.address)
    expect(await globalDelta[0]).eq(false)
    expect(await globalDelta[1]).eq(toUsd(4.5))
    expect(await glpManager.getAumInUsdg(true)).eq("504300000000000000000") // 499.8 + 4.5
    expect(await glpManager.getAumInUsdg(false)).eq("504300000000000000000") // 499.8 + 4.5

    await vault.connect(user0).decreasePosition(user0.address, dai.address, btc.address, toUsd(3), toUsd(50), false, user2.address)

    position = await vault.getPosition(user0.address, dai.address, btc.address, false)
    expect(position[0]).eq(toUsd(40)) // size
    expect(position[1]).eq(toUsd(14.41)) // collateral
    expect(position[2]).eq(toNormalizedPrice(40000)) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(expandDecimals(40, 18)) // reserveAmount
    expect(position[5]).eq(toUsd(2.5)) // realisedPnl
    expect(position[6]).eq(false) // hasProfit
    expect(position[7]).eq(blockTime) // lastIncreasedTime

    delta = await vault.getPositionDelta(user0.address, dai.address, btc.address, false)
    expect(delta[0]).eq(false)
    expect(delta[1]).eq(toUsd(2))

    expect(await vault.feeReserves(dai.address)).eq("340000000000000000") // 0.18
    expect(await vault.usdgAmounts(dai.address)).eq("499800000000000000000") // 499.8
    expect(await vault.poolAmounts(dai.address)).eq("502300000000000000000") // 502.3

    expect(await vault.globalShortSizes(btc.address)).eq(toUsd(40))
    expect(await vault.globalShortAveragePrices(btc.address)).eq(toNormalizedPrice(40000))

    globalDelta = await vault.getGlobalShortDelta(btc.address)
    expect(await globalDelta[0]).eq(false)
    expect(await globalDelta[1]).eq(toUsd(2))
    expect(await glpManager.getAumInUsdg(true)).eq("504300000000000000000") // 499.8 + 4.5
    expect(await glpManager.getAumInUsdg(false)).eq("504300000000000000000") // 499.8 + 4.5

    await dai.mint(vault.address, expandDecimals(50, 18))
    await vault.connect(user1).increasePosition(user1.address, dai.address, btc.address, toUsd(200), false)

    expect(await vault.globalShortSizes(btc.address)).eq(toUsd(240))
    expect(await vault.globalShortAveragePrices(btc.address)).eq("41652892561983471074380165289256198")

    globalDelta = await vault.getGlobalShortDelta(btc.address)
    expect(await globalDelta[0]).eq(false)
    expect(await globalDelta[1]).eq(toUsd(2))
    expect(await glpManager.getAumInUsdg(true)).eq("504300000000000000000") // 502.3 + 2
    expect(await glpManager.getAumInUsdg(false)).eq("504300000000000000000") // 502.3 + 2

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(41000))

    delta = await vault.getPositionDelta(user0.address, dai.address, btc.address, false)
    expect(delta[0]).eq(false)
    expect(delta[1]).eq(toUsd(1))

    delta = await vault.getPositionDelta(user1.address, dai.address, btc.address, false)
    expect(delta[0]).eq(true)
    expect(delta[1]).eq("4761904761904761904761904761904") // 4.76

    globalDelta = await vault.getGlobalShortDelta(btc.address)
    expect(await globalDelta[0]).eq(true)
    expect(await globalDelta[1]).eq("3761904761904761904761904761904")
    expect(await glpManager.getAumInUsdg(true)).eq("498538095238095238095") // 502.3 + 1 - 4.76 => 498.53
    expect(await glpManager.getAumInUsdg(false)).eq("492776190476190476190") // 492.77619047619047619

    await dai.mint(vault.address, expandDecimals(20, 18))
    await vault.connect(user2).increasePosition(user2.address, dai.address, btc.address, toUsd(60), false)

    expect(await vault.globalShortSizes(btc.address)).eq(toUsd(300))
    expect(await vault.globalShortAveragePrices(btc.address)).eq("41311475409836065573770491803278614")

    globalDelta = await vault.getGlobalShortDelta(btc.address)
    expect(await globalDelta[0]).eq(true)
    expect(await globalDelta[1]).eq("2261904761904761904761904761904")
    expect(await glpManager.getAumInUsdg(true)).eq("500038095238095238095") // 500.038095238095238095
    expect(await glpManager.getAumInUsdg(false)).eq("492776190476190476190") // 492.77619047619047619

    await dai.mint(vault.address, expandDecimals(20, 18))

    await expect(vault.connect(user2).increasePosition(user2.address, dai.address, btc.address, toUsd(60), false))
      .to.be.revertedWith("Vault: max shorts exceeded")

    await vault.connect(user2).increasePosition(user2.address, dai.address, bnb.address, toUsd(60), false)
  })
})
