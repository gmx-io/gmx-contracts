const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed } = require("../shared/utilities")
const { toChainlinkPrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig, validateVaultBalance } = require("./Vault/helpers")

use(solidity)

describe("PositionManager", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let vault
  let vaultUtils
  let vaultPriceFeed
  let positionUtils
  let positionManager
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
  let orderBook
  let deployTimelock

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
    await vault.setIsLeverageEnabled(false)
    usdg = await deployContract("USDG", [vault.address])
    router = await deployContract("Router", [vault.address, usdg.address, bnb.address])
    vaultPriceFeed = await deployContract("VaultPriceFeed", [])

    const initVaultResult = await initVault(vault, router, usdg, vaultPriceFeed)
    vaultUtils = initVaultResult.vaultUtils

    distributor0 = await deployContract("TimeDistributor", [])
    yieldTracker0 = await deployContract("YieldTracker", [usdg.address])

    await yieldTracker0.setDistributor(distributor0.address)
    await distributor0.setDistribution([yieldTracker0.address], [1000], [bnb.address])

    await bnb.mint(distributor0.address, 5000)
    await usdg.setYieldTrackers([yieldTracker0.address])

    await vaultPriceFeed.setTokenConfig(bnb.address, bnbPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(dai.address, daiPriceFeed.address, 8, false)

    orderBook = await deployContract("OrderBook", [])
    const minExecutionFee = 500000;
    await orderBook.initialize(
      router.address,
      vault.address,
      bnb.address,
      usdg.address,
      minExecutionFee,
      expandDecimals(5, 30) // minPurchseTokenAmountUsd
    );
    await router.addPlugin(orderBook.address)
    await router.connect(user0).approvePlugin(orderBook.address)

    glp = await deployContract("GLP", [])

    const shortsTracker = await deployContract("ShortsTracker", [vault.address])
    await shortsTracker.setIsGlobalShortDataReady(true)

    glpManager = await deployContract("GlpManager", [
      vault.address,
      usdg.address,
      glp.address,
      shortsTracker.address,
      24 * 60 * 60
    ])
    await glpManager.setShortsTrackerAveragePriceWeight(10000)

    positionUtils = await deployContract("PositionUtils", [])

    positionManager = await deployContract("PositionManager", [
      vault.address,
      router.address,
      shortsTracker.address,
      bnb.address,
      50,
      orderBook.address
    ], {
      libraries: {
        PositionUtils: positionUtils.address
      }
    })
    await shortsTracker.setHandler(positionManager.address, true)

    await daiPriceFeed.setLatestAnswer(toChainlinkPrice(1))
    await vault.setTokenConfig(...getDaiConfig(dai, daiPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))
    await vault.setTokenConfig(...getBtcConfig(btc, btcPriceFeed))

    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(300))
    await vault.setTokenConfig(...getBnbConfig(bnb, bnbPriceFeed))

    await bnb.mint(user1.address, expandDecimals(1000, 18))
    await bnb.connect(user1).approve(router.address, expandDecimals(1000, 18))
    await router.connect(user1).swap([bnb.address, usdg.address], expandDecimals(1000, 18), expandDecimals(29000, 18), user1.address)

    await dai.mint(user1.address, expandDecimals(500000, 18))
    await dai.connect(user1).approve(router.address, expandDecimals(300000, 18))
    await router.connect(user1).swap([dai.address, usdg.address], expandDecimals(300000, 18), expandDecimals(29000, 18), user1.address)

    await btc.mint(user1.address, expandDecimals(10, 8))
    await btc.connect(user1).approve(router.address, expandDecimals(10, 8))
    await router.connect(user1).swap([btc.address, usdg.address], expandDecimals(10, 8), expandDecimals(59000, 18), user1.address)

    deployTimelock = async () => {
      return await deployContract("Timelock", [
        wallet.address, // _admin
        5 * 24 * 60 * 60, // _buffer
        ethers.constants.AddressZero, // _tokenManager
        ethers.constants.AddressZero, // _mintReceiver
        ethers.constants.AddressZero, // _glpManager
        ethers.constants.AddressZero, // _rewardRouter
        expandDecimals(1000, 18), // _maxTokenSupply
        10, // _marginFeeBasisPoints
        100 // _maxMarginFeeBasisPoints
      ])
    }
  })

  it("inits", async () => {
    expect(await positionManager.router(), 'router').eq(router.address)
    expect(await positionManager.vault(), 'vault').eq(vault.address)
    expect(await positionManager.weth(), 'weth').eq(bnb.address)
    expect(await positionManager.depositFee()).eq(50)
    expect(await positionManager.gov(), 'gov').eq(wallet.address)
  })

  it("setDepositFee", async () => {
    await expect(positionManager.connect(user0).setDepositFee(10))
      .to.be.revertedWith("forbidden")

    expect(await positionManager.depositFee()).eq(50)
    await positionManager.connect(wallet).setDepositFee(10)
    expect(await positionManager.depositFee()).eq(10)
  })

  it("approve", async () => {
    await expect(positionManager.connect(user0).approve(bnb.address, user1.address, 10))
      .to.be.revertedWith("Governable: forbidden")

    expect(await bnb.allowance(positionManager.address, user1.address)).eq(0)
    await positionManager.connect(wallet).approve(bnb.address, user1.address, 10)
    expect(await bnb.allowance(positionManager.address, user1.address)).eq(10)
  })

  it("setOrderKeeper", async () => {
    await expect(positionManager.connect(user0).setOrderKeeper(user1.address, true))
      .to.be.revertedWith("forbidden")

    await positionManager.setAdmin(user0.address)

    expect(await positionManager.isOrderKeeper(user1.address)).eq(false)
    await positionManager.connect(user0).setOrderKeeper(user1.address, true)
    expect(await positionManager.isOrderKeeper(user1.address)).eq(true)
  })

  it("setLiquidator", async () => {
    await expect(positionManager.connect(user0).setLiquidator(user1.address, true))
      .to.be.revertedWith("forbidden")

    await positionManager.setAdmin(user0.address)

    expect(await positionManager.isLiquidator(user1.address)).eq(false)
    await positionManager.connect(user0).setLiquidator(user1.address, true)
    expect(await positionManager.isLiquidator(user1.address)).eq(true)
  })

  it("setPartner", async () => {
    await expect(positionManager.connect(user0).setPartner(user1.address, true))
      .to.be.revertedWith("forbidden")

    await positionManager.setAdmin(user0.address)

    expect(await positionManager.isPartner(user1.address)).eq(false)
    await positionManager.connect(user0).setPartner(user1.address, true)
    expect(await positionManager.isPartner(user1.address)).eq(true)
  })

  it("setInLegacyMode", async () => {
    await expect(positionManager.connect(user0).setInLegacyMode(true))
      .to.be.revertedWith("forbidden")

    await positionManager.setAdmin(user0.address)

    expect(await positionManager.inLegacyMode()).eq(false)
    await positionManager.connect(user0).setInLegacyMode(true)
    expect(await positionManager.inLegacyMode()).eq(true)
  })

  it("setShouldValidateIncreaseOrder", async () => {
    await expect(positionManager.connect(user0).setShouldValidateIncreaseOrder(false))
      .to.be.revertedWith("forbidden")

    await positionManager.setAdmin(user0.address)

    expect(await positionManager.shouldValidateIncreaseOrder()).eq(true)
    await positionManager.connect(user0).setShouldValidateIncreaseOrder(false)
    expect(await positionManager.shouldValidateIncreaseOrder()).eq(false)
  })

  it("increasePosition and decreasePosition", async () => {
    const timelock = await deployTimelock()

    await expect(positionManager.connect(user0).increasePosition([btc.address], btc.address, expandDecimals(1, 7), 0, 0, true, toUsd(100000)))
      .to.be.revertedWith("forbidden")

    await vault.setGov(timelock.address)
    await router.addPlugin(positionManager.address)
    await router.connect(user0).approvePlugin(positionManager.address)

    await btc.connect(user0).approve(router.address, expandDecimals(1, 8))
    await btc.mint(user0.address, expandDecimals(3, 8))

    await positionManager.setInLegacyMode(true)
    await expect(positionManager.connect(user0).increasePosition([btc.address], btc.address, expandDecimals(1, 7), 0, 0, true, toUsd(100000)))
      .to.be.revertedWith("Timelock: forbidden")

    // path length should be 1 or 2
    await expect(positionManager.connect(user0).increasePosition([btc.address, bnb.address, dai.address], btc.address, expandDecimals(1, 7), 0, 0, true, toUsd(100000)))
      .to.be.revertedWith("invalid _path.length")

    await timelock.setContractHandler(positionManager.address, true)
    await timelock.setShouldToggleIsLeverageEnabled(true)

    await dai.mint(user0.address, expandDecimals(20000, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(20000, 18))

    // too low desired price
    await expect(positionManager.connect(user0).increasePosition([dai.address, btc.address], btc.address, expandDecimals(200, 18), "332333", toUsd(2000), true, toNormalizedPrice(50000)))
      .to.be.revertedWith("markPrice > price")

    // too big minOut
    await expect(positionManager.connect(user0).increasePosition([dai.address, btc.address], btc.address, expandDecimals(200, 18), "1332333", toUsd(2000), true, toNormalizedPrice(60000)))
      .to.be.revertedWith("insufficient amountOut")

    await positionManager.connect(user0).increasePosition([dai.address, btc.address], btc.address, expandDecimals(200, 18), "332333", toUsd(2000), true, toNormalizedPrice(60000))

    let position = await vault.getPosition(user0.address, btc.address, btc.address, true)
    expect(position[0]).eq(toUsd(2000)) // size
    expect(position[1]).eq("197399800000000000000000000000000") // collateral, 197.3998
    expect(position[2]).eq(toNormalizedPrice(60000)) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq("3333333") // reserveAmount
    expect(position[5]).eq(0) // realisedPnl
    expect(position[6]).eq(true) // hasProfit)

    // deposit
    // should deduct extra fee
    await positionManager.connect(user0).increasePosition([btc.address], btc.address, "500000", 0, 0, true, toUsd(60000))

    position = await vault.getPosition(user0.address, btc.address, btc.address, true)
    expect(position[0]).eq(toUsd(2000)) // size
    expect(position[1]).eq("495899800000000000000000000000000") // collateral, 495.8998, 495.8998 - 197.3998 => 298.5, 1.5 for fees
    expect(position[2]).eq(toNormalizedPrice(60000)) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq("3333333") // reserveAmount
    expect(position[5]).eq(0) // realisedPnl
    expect(position[6]).eq(true) // hasProfit

    expect(await btc.balanceOf(positionManager.address)).eq(2500) // 2500 / (10**8) * 60000 => 1.5
    await positionManager.approve(btc.address, user1.address, 5000)
    expect(await btc.balanceOf(user2.address)).eq(0)
    await btc.connect(user1).transferFrom(positionManager.address, user2.address, 2500)
    expect(await btc.balanceOf(user2.address)).eq(2500)

    // leverage is decreased because of big amount of collateral
    // should deduct extra fee
    await positionManager.connect(user0).increasePosition([btc.address], btc.address, "500000", 0, toUsd(300), true, toUsd(100000))

    position = await vault.getPosition(user0.address, btc.address, btc.address, true)
    expect(position[0]).eq(toUsd(2300)) // size
    expect(position[1]).eq("794099800000000000000000000000000") // collateral, 794.0998, 794.0998 - 495.8998 => 298.2, 1.5 for collateral fee, 0.3 for size delta fee

    // regular position increase, no extra fee applied
    await positionManager.connect(user0).increasePosition([btc.address], btc.address, "500000", 0, toUsd(1000), true, toUsd(100000))
    position = await vault.getPosition(user0.address, btc.address, btc.address, true)
    expect(position[0]).eq(toUsd(3300)) // size
    expect(position[1]).eq("1093099800000000000000000000000000") // collateral, 1093.0998, 1093.0998 - 794.0998 => 299, 1.0 for size delta fee

    await positionManager.setInLegacyMode(false)
    await expect(positionManager.connect(user0).decreasePosition(btc.address, btc.address, position[1], position[0], true, user0.address, 0))
      .to.be.revertedWith("forbidden")
    await positionManager.setInLegacyMode(true)

    expect(await btc.balanceOf(user0.address)).to.be.equal("298500000")
    await positionManager.connect(user0).decreasePosition(btc.address, btc.address, position[1], position[0], true, user0.address, 0)
    expect(await btc.balanceOf(user0.address)).to.be.equal("300316333")
    position = await vault.getPosition(user0.address, btc.address, btc.address, true)
    expect(position[0]).eq(0) // size
    expect(position[1]).eq(0) // collateral

    await positionManager.setInLegacyMode(false)
    await expect(positionManager.connect(user0).increasePosition([dai.address, btc.address], btc.address, expandDecimals(200, 18), "332333", toUsd(2000), true, toNormalizedPrice(60000))).to.be.revertedWith("forbidden")

    // partners should have access in non-legacy mode
    expect(await positionManager.isPartner(user0.address)).to.be.false
    await positionManager.setPartner(user0.address, true)
    expect(await positionManager.isPartner(user0.address)).to.be.true
    await positionManager.connect(user0).increasePosition([dai.address, btc.address], btc.address, expandDecimals(200, 18), "332333", toUsd(2000), true, toNormalizedPrice(60000))
  })

  it("increasePositionETH and decreasePositionETH", async () => {
    const timelock = await deployTimelock()

    await expect(positionManager.connect(user0).increasePositionETH([bnb.address], bnb.address, 0, 0, true, toUsd(100000), { value: expandDecimals(1, 18) }))
      .to.be.revertedWith("PositionManager: forbidden")

    await vault.setGov(timelock.address)
    await router.addPlugin(positionManager.address)
    await router.connect(user0).approvePlugin(positionManager.address)

    await positionManager.setInLegacyMode(true)
    await expect(positionManager.connect(user0).increasePositionETH([bnb.address], bnb.address, 0, 0, true, toUsd(100000), { value: expandDecimals(1, 18) }))
      .to.be.revertedWith("Timelock: forbidden")

    // path[0] should always be weth
    await expect(positionManager.connect(user0).increasePositionETH([btc.address], bnb.address, 0, 0, true, toUsd(100000), { value: expandDecimals(1, 18) }))
      .to.be.revertedWith("PositionManager: invalid _path")

    // path length should be 1 or 2
    await expect(positionManager.connect(user0).increasePositionETH([bnb.address, dai.address, btc.address], bnb.address, 0, 0, true, toUsd(100000), { value: expandDecimals(1, 18) }))
      .to.be.revertedWith("PositionManager: invalid _path.length")

    await timelock.setContractHandler(positionManager.address, true)
    await timelock.setShouldToggleIsLeverageEnabled(true)

    await dai.mint(user0.address, expandDecimals(20000, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(20000, 18))

    // too low desired price
    await expect(positionManager.connect(user0).increasePositionETH([bnb.address], bnb.address, 0, toUsd(2000), true, toUsd(200), { value: expandDecimals(1, 18) }))
      .to.be.revertedWith("markPrice > price")

    position = await vault.getPosition(user0.address, bnb.address, bnb.address, true)

    await positionManager.connect(user0).increasePositionETH([bnb.address], bnb.address, 0, toUsd(2000), true, toUsd(100000), { value: expandDecimals(1, 18) })
    position = await vault.getPosition(user0.address, bnb.address, bnb.address, true)
    expect(position[0]).eq(toUsd(2000))
    expect(position[1]).eq("298000000000000000000000000000000")

    // deposit
    // should deduct extra fee
    await positionManager.connect(user0).increasePositionETH([bnb.address], bnb.address, 0, 0, true, toUsd(60000), { value: expandDecimals(1, 18) })
    position = await vault.getPosition(user0.address, bnb.address, bnb.address, true)
    expect(position[0]).eq(toUsd(2000)) // size
    expect(position[1]).eq("596500000000000000000000000000000") // collateral, 298 + 300 - 1.5 (300 * 0.5%) = 596.5

    expect(await bnb.balanceOf(positionManager.address)).eq(expandDecimals(5, 15)) // 1 * 0.5%

    // leverage is decreased because of big amount of collateral
    // should deduct extra fee
    await positionManager.connect(user0).increasePositionETH([bnb.address], bnb.address, 0, toUsd(300), true, toUsd(60000), { value: expandDecimals(1, 18) })
    position = await vault.getPosition(user0.address, bnb.address, bnb.address, true)
    expect(position[0]).eq(toUsd(2300)) // size
    expect(position[1]).eq("894700000000000000000000000000000") // collateral, 596.5 + 300 - 0.3 - 1.5 = 894.7

    // regular position increase, no extra fee applied
    await positionManager.connect(user0).increasePositionETH([bnb.address], bnb.address, 0, toUsd(1000), true, toUsd(60000), { value: expandDecimals(1, 18) })
    position = await vault.getPosition(user0.address, bnb.address, bnb.address, true)
    expect(position[0]).eq(toUsd(3300)) // size
    expect(position[1]).eq("1193700000000000000000000000000000") // collateral, 894.7 + 300 - 1 = 1193.7

    await positionManager.setInLegacyMode(false)
    await expect(positionManager.connect(user0).decreasePositionETH(bnb.address, bnb.address, position[1], position[0], true, user0.address, 0))
      .to.be.revertedWith("PositionManager: forbidden")
    await positionManager.setInLegacyMode(true)

    const balanceBefore = await provider.getBalance(user0.address)
    await positionManager.connect(user0).decreasePositionETH(bnb.address, bnb.address, position[1], position[0], true, user0.address, 0)
    const balanceAfter = await provider.getBalance(user0.address)
    expect(balanceAfter.gt(balanceBefore))
    position = await vault.getPosition(user0.address, bnb.address, bnb.address, true)
    expect(position[0]).eq(0) // size
    expect(position[1]).eq(0) // collateral

    await positionManager.setInLegacyMode(false)
    await expect(positionManager.connect(user0).increasePositionETH([bnb.address], bnb.address, 0, toUsd(1000), true, toUsd(60000), { value: expandDecimals(1, 18) })).to.be.revertedWith("PositionManager: forbidden")

    // partners should have access in non-legacy mode
    expect(await positionManager.isPartner(user0.address)).to.be.false
    await positionManager.setPartner(user0.address, true)
    expect(await positionManager.isPartner(user0.address)).to.be.true
    await positionManager.connect(user0).increasePositionETH([bnb.address], bnb.address, 0, toUsd(1000), true, toUsd(60000), { value: expandDecimals(1, 18) })
  })

  it("increasePositionETH with swap", async () => {
    const timelock = await deployTimelock()

    await vault.setGov(timelock.address)
    await timelock.setContractHandler(positionManager.address, true)
    await router.addPlugin(positionManager.address)
    await router.connect(user0).approvePlugin(positionManager.address)

    await timelock.setShouldToggleIsLeverageEnabled(true)
    await positionManager.setInLegacyMode(true)
    await positionManager.connect(user0).increasePositionETH([bnb.address, btc.address], btc.address, 0, toUsd(2000), true, toUsd(60000), { value: expandDecimals(1, 18) })

    let position = await vault.getPosition(user0.address, btc.address, btc.address, true)
    expect(position[0]).eq(toUsd(2000)) // size
    expect(position[1]).eq("297100000000000000000000000000000") // collateral, 297.1, 300 - 297.1 => 2.9, 0.9 fee for swap, 2.0 fee for size delta

    await positionManager.connect(user0).increasePositionETH([bnb.address, btc.address], btc.address, 0, 0, true, toUsd(60000), { value: expandDecimals(1, 18) })

    position = await vault.getPosition(user0.address, btc.address, btc.address, true)
    expect(position[0]).eq(toUsd(2000)) // size
    expect(position[1]).eq("594704200000000000000000000000000") // collateral, 594.7042, 594.7042 - 297.1 => 297.6042, 300 - 297.6042 => 2.3958, ~1.5 + 0.9 fee for swap
  });

  it("increasePosition and increasePositionETH to short", async () => {
    const timelock = await deployTimelock()

    await vault.setGov(timelock.address)
    await timelock.setContractHandler(positionManager.address, true)
    await router.addPlugin(positionManager.address)
    await router.connect(user0).approvePlugin(positionManager.address)

    await dai.mint(user0.address, expandDecimals(200, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(200, 18))

    await timelock.setShouldToggleIsLeverageEnabled(true)
    await positionManager.setInLegacyMode(true)
    await positionManager.connect(user0).increasePositionETH([bnb.address, dai.address], btc.address, 0, toUsd(3000), false, 0, { value: expandDecimals(1, 18) })

    let position = await vault.getPosition(user0.address, dai.address, btc.address, false)
    expect(position[0]).eq(toUsd(3000))
    expect(position[1]).eq("296100000000000000000000000000000")

    await btc.mint(user0.address, expandDecimals(1, 8))
    await btc.connect(user0).approve(router.address, expandDecimals(1, 8))
    await positionManager.connect(user0).increasePosition([btc.address, dai.address], bnb.address, "500000", 0, toUsd(3000), false, 0)

    position = await vault.getPosition(user0.address, dai.address, bnb.address, false)
    expect(position[0]).eq(toUsd(3000))
    expect(position[1]).eq("296100000000000000000000000000000")
  })

  it("decreasePositionAndSwap and decreasePositionAndSwapETH", async () => {
    const timelock = await deployTimelock()
    await vault.setGov(timelock.address)
    await router.addPlugin(positionManager.address)
    await router.connect(user0).approvePlugin(positionManager.address)

    await positionManager.setInLegacyMode(true)

    await timelock.setContractHandler(positionManager.address, true)
    await timelock.setShouldToggleIsLeverageEnabled(true)

    await dai.mint(user0.address, expandDecimals(20000, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(20000, 18))

    await bnb.deposit({ value: expandDecimals(10, 18) })

    // BNB Long
    await positionManager.connect(user0).increasePosition([dai.address, bnb.address], bnb.address, expandDecimals(200, 18), 0, toUsd(2000), true, toNormalizedPrice(60000))

    let position = await vault.getPosition(user0.address, bnb.address, bnb.address, true)
    expect(position[0]).eq(toUsd(2000)) // size

    let params = [
      [bnb.address, dai.address], // path
      bnb.address, // indexToken
      position[1], // collateralDelta
      position[0], // sizeDelta
      true, // isLong
      user0.address, // reciever
      0 // price
    ]

    await positionManager.setInLegacyMode(false)
    await expect(positionManager.connect(user0).decreasePositionAndSwap(...params, expandDecimals(200, 18)))
      .to.be.revertedWith("PositionManager: forbidden")
    await positionManager.setInLegacyMode(true)

    // too high minOut
    await expect(positionManager.connect(user0).decreasePositionAndSwap(...params, expandDecimals(200, 18)))
      .to.be.revertedWith("insufficient amountOut")

    // invalid path[0] == path[1]
    await expect(positionManager.connect(user0).decreasePositionAndSwap([bnb.address, bnb.address], ...params.slice(1), 0))
      .to.be.revertedWith("Vault: invalid tokens")

    // path.length > 2
    await expect(positionManager.connect(user0).decreasePositionAndSwap([bnb.address, dai.address, bnb.address], ...params.slice(1), 0))
      .to.be.revertedWith("PositionManager: invalid _path.length")

    let daiBalance = await dai.balanceOf(user0.address)
    await positionManager.connect(user0).decreasePositionAndSwap(...params, 0)
    expect(await dai.balanceOf(user0.address)).to.be.equal(daiBalance.add("194813799999999999601"))

    position = await vault.getPosition(user0.address, bnb.address, bnb.address, true)
    expect(position[0]).eq(0) // size

    // BTC Short
    await positionManager.connect(user0).increasePosition([dai.address], btc.address, expandDecimals(200, 18), 0, toUsd(2000), false, toNormalizedPrice(60000))

    position = await vault.getPosition(user0.address, dai.address, btc.address, false)
    expect(position[0]).eq(toUsd(2000)) // size

    params = [
      [dai.address, bnb.address], // path
      btc.address, // indexToken
      position[1], // collateralDelta
      position[0], // sizeDelta
      false, // isLong
      user0.address, // reciever
      toUsd(60000) // price
    ]
    await positionManager.setInLegacyMode(false)
    await expect(positionManager.connect(user0).decreasePositionAndSwapETH(...params, expandDecimals(200, 18)))
      .to.be.revertedWith("PositionManager: forbidden")
    await positionManager.setInLegacyMode(true)

    await expect(positionManager.connect(user0).decreasePositionAndSwapETH(...params, expandDecimals(200, 18)))
      .to.be.revertedWith("insufficient amountOut")

    await expect(positionManager.connect(user0).decreasePositionAndSwapETH([dai.address, dai.address], ...params.slice(1), 0))
      .to.be.revertedWith("PositionManager: invalid _path")

    await expect(positionManager.connect(user0).decreasePositionAndSwapETH([dai.address, btc.address, bnb.address], ...params.slice(1), 0))
      .to.be.revertedWith("PositionManager: invalid _path.length")

    const bnbBalance = await provider.getBalance(user0.address)
    await positionManager.connect(user0).decreasePositionAndSwapETH(...params, 0)
    expect((await provider.getBalance(user0.address)).gt(bnbBalance)).to.be.true

    position = await vault.getPosition(user0.address, dai.address, btc.address, false)
    expect(position[0]).eq(0) // size
  });

  it("deposit collateral for shorts", async () => {
    const timelock = await deployTimelock()

    await vault.setGov(timelock.address)
    await timelock.setContractHandler(positionManager.address, true)
    await router.addPlugin(positionManager.address)
    await router.connect(user0).approvePlugin(positionManager.address)

    await dai.mint(user0.address, expandDecimals(200, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(200, 18))

    await timelock.setShouldToggleIsLeverageEnabled(true)
    await positionManager.setInLegacyMode(true)

    await positionManager.connect(user0).increasePositionETH([bnb.address, dai.address], btc.address, 0, toUsd(3000), false, 0, { value: expandDecimals(1, 18) })

    let position = await vault.getPosition(user0.address, dai.address, btc.address, false)
    expect(position[0]).eq(toUsd(3000))
    expect(position[1]).eq("296100000000000000000000000000000") // 296.1

    await dai.mint(user0.address, expandDecimals(200, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(200, 18))
    await positionManager.connect(user0).increasePosition([dai.address], btc.address, expandDecimals(200, 18), 0, 0, false, 0)

    position = await vault.getPosition(user0.address, dai.address, btc.address, false)
    expect(position[0]).eq(toUsd(3000))
    expect(position[1]).eq("496100000000000000000000000000000") // 496.1, zero fee for short collateral deposits
  })

  it("executeSwapOrder", async () => {
    await dai.mint(user0.address, expandDecimals(1000, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(100, 18))
    await orderBook.connect(user0).createSwapOrder(
      [dai.address, btc.address],
      expandDecimals(100, 18), //amountIn,
      0,
      0,
      true,
      expandDecimals(1, 17),
      false,
      false,
      {value: expandDecimals(1, 17)}
    )
    const orderIndex = (await orderBook.swapOrdersIndex(user0.address)) - 1

    await expect(positionManager.connect(user1).executeSwapOrder(user0.address, orderIndex, user1.address))
      .to.be.revertedWith("PositionManager: forbidden")

    const balanceBefore = await provider.getBalance(user1.address)
    await positionManager.setOrderKeeper(user1.address, true)
    await positionManager.connect(user1).executeSwapOrder(user0.address, orderIndex, user1.address)
    expect((await orderBook.swapOrders(user0.address, orderIndex))[0]).to.be.equal(ethers.constants.AddressZero)
    const balanceAfter = await provider.getBalance(user1.address)
    expect(balanceAfter.gt(balanceBefore)).to.be.true
  })

  it("executeIncreaseOrder", async () => {
    const timelock = await deployTimelock()
    await vault.setGov(timelock.address)
    await timelock.setContractHandler(positionManager.address, true)
    await timelock.setShouldToggleIsLeverageEnabled(true)
    await positionManager.setInLegacyMode(true)
    await router.addPlugin(positionManager.address)
    await router.connect(user0).approvePlugin(positionManager.address)

    const executionFee = expandDecimals(1, 17) // 0.1 WETH
    await dai.mint(user0.address, expandDecimals(20000, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(20000, 18))

    const createIncreaseOrder = (amountIn = expandDecimals(1000, 18), sizeDelta = toUsd(2000), isLong = true) => {
      const path = isLong ? [dai.address, btc.address] : [dai.address]
      const collateralToken = isLong ? btc.address : dai.address
      return orderBook.connect(user0).createIncreaseOrder(
        path,
        amountIn,
        btc.address, // indexToken
        0, // minOut
        sizeDelta,
        collateralToken,
        isLong,
        toUsd(59000), // triggerPrice
        true, // triggerAboveThreshold
        executionFee,
        false, // shouldWrap
        {value: executionFee}
      );
    }

    await createIncreaseOrder()
    let orderIndex = (await orderBook.increaseOrdersIndex(user0.address)) - 1
    expect(await positionManager.isOrderKeeper(user1.address)).to.be.false
    await expect(positionManager.connect(user1).executeIncreaseOrder(user0.address, orderIndex, user1.address))
      .to.be.revertedWith("PositionManager: forbidden")

    const balanceBefore = await provider.getBalance(user1.address)
    await positionManager.setOrderKeeper(user1.address, true)
    expect(await positionManager.isOrderKeeper(user1.address)).to.be.true
    await positionManager.connect(user1).executeIncreaseOrder(user0.address, orderIndex, user1.address)
    expect((await orderBook.increaseOrders(user0.address, orderIndex))[0]).to.be.equal(ethers.constants.AddressZero)
    const balanceAfter = await provider.getBalance(user1.address)
    expect(balanceAfter.gt(balanceBefore)).to.be.true

    position = await vault.getPosition(user0.address, btc.address, btc.address, true)
    expect(position[0]).to.be.equal(toUsd(2000))

    // by default validation is enabled
    expect(await positionManager.shouldValidateIncreaseOrder()).to.be.true

    // should revert on deposits
    await createIncreaseOrder(expandDecimals(100, 18), 0)
    orderIndex = (await orderBook.increaseOrdersIndex(user0.address)) - 1
    const badOrderIndex1 = orderIndex
    await expect(positionManager.connect(user1).executeIncreaseOrder(user0.address, orderIndex, user1.address))
      .to.be.revertedWith("PositionManager: long deposit")

    // should block if leverage is decreased
    await createIncreaseOrder(expandDecimals(100, 18), toUsd(100))
    orderIndex = (await orderBook.increaseOrdersIndex(user0.address)) - 1
    const badOrderIndex2 = orderIndex
    await expect(positionManager.connect(user1).executeIncreaseOrder(user0.address, orderIndex, user1.address))
      .to.be.revertedWith("PositionManager: long leverage decrease")

    // should not block if leverage is not decreased
    await createIncreaseOrder()
    orderIndex = (await orderBook.increaseOrdersIndex(user0.address)) - 1
    await positionManager.connect(user1).executeIncreaseOrder(user0.address, orderIndex, user1.address)

    await positionManager.setShouldValidateIncreaseOrder(false)
    expect(await positionManager.shouldValidateIncreaseOrder()).to.be.false

    await positionManager.connect(user1).executeIncreaseOrder(user0.address, badOrderIndex1, user1.address)
    await positionManager.connect(user1).executeIncreaseOrder(user0.address, badOrderIndex2, user1.address)

    // shorts
    await positionManager.setShouldValidateIncreaseOrder(true)
    expect(await positionManager.shouldValidateIncreaseOrder()).to.be.true

    await createIncreaseOrder(expandDecimals(1000, 18), toUsd(2000), false)
    orderIndex = (await orderBook.increaseOrdersIndex(user0.address)) - 1
    await positionManager.connect(user1).executeIncreaseOrder(user0.address, orderIndex, user1.address)

    // should not block deposits for shorts
    await createIncreaseOrder(expandDecimals(100, 18), 0, false)
    orderIndex = (await orderBook.increaseOrdersIndex(user0.address)) - 1
    await positionManager.connect(user1).executeIncreaseOrder(user0.address, orderIndex, user1.address)

    await createIncreaseOrder(expandDecimals(100, 18), toUsd(100), false)
    orderIndex = (await orderBook.increaseOrdersIndex(user0.address)) - 1
    await positionManager.connect(user1).executeIncreaseOrder(user0.address, orderIndex, user1.address)
  })

  it("executeDecreaseOrder", async () => {
    const timelock = await deployTimelock()
    await vault.setGov(timelock.address)
    await timelock.setContractHandler(positionManager.address, true)
    await timelock.setShouldToggleIsLeverageEnabled(true)
    await positionManager.setInLegacyMode(true)
    await router.addPlugin(positionManager.address)
    await router.connect(user0).approvePlugin(positionManager.address)

    await positionManager.connect(user0).increasePositionETH([bnb.address], bnb.address, 0, toUsd(1000), true, toUsd(100000), { value: expandDecimals(1, 18) })

    let position = await vault.getPosition(user0.address, bnb.address, bnb.address, true)

    const executionFee = expandDecimals(1, 17) // 0.1 WETH
    await orderBook.connect(user0).createDecreaseOrder(
      bnb.address,
      position[0],
      bnb.address,
      position[1],
      true,
      toUsd(290),
      true,
      {value: executionFee}
    );

    const orderIndex = (await orderBook.decreaseOrdersIndex(user0.address)) - 1
    await expect(positionManager.connect(user1).executeDecreaseOrder(user0.address, orderIndex, user1.address))
      .to.be.revertedWith("PositionManager: forbidden")

    const balanceBefore = await provider.getBalance(user1.address)
    await positionManager.setOrderKeeper(user1.address, true)
    await positionManager.connect(user1).executeDecreaseOrder(user0.address, orderIndex, user1.address)
    expect((await orderBook.decreaseOrders(user0.address, orderIndex))[0]).to.be.equal(ethers.constants.AddressZero)
    const balanceAfter = await provider.getBalance(user1.address)
    expect(balanceAfter.gt(balanceBefore)).to.be.true

    position = await vault.getPosition(user0.address, bnb.address, bnb.address, true)
    expect(position[0]).to.be.equal(0)
  })

  it("liquidatePosition", async () => {
    const timelock = await deployTimelock()
    await vault.setGov(timelock.address)
    await timelock.setContractHandler(positionManager.address, true)
    await timelock.setShouldToggleIsLeverageEnabled(true)

    expect(await positionManager.isLiquidator(user1.address)).to.be.false
    await expect(positionManager.connect(user1).liquidatePosition(user1.address, bnb.address, bnb.address, true, user0.address))
      .to.be.revertedWith("PositionManager: forbidden")

    await positionManager.setInLegacyMode(true)
    await router.addPlugin(positionManager.address)
    await router.connect(user0).approvePlugin(positionManager.address)

    await positionManager.connect(user0).increasePositionETH([bnb.address], bnb.address, 0, toUsd(1000), true, toUsd(100000), { value: expandDecimals(1, 18) })
    let position = await vault.getPosition(user0.address, bnb.address, bnb.address, true)

    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(200))

    await expect(positionManager.connect(user1).liquidatePosition(user0.address, bnb.address, bnb.address, true, user1.address))
      .to.be.revertedWith("PositionManager: forbidden")

    await positionManager.setLiquidator(user1.address, true)

    expect(await positionManager.isLiquidator(user1.address)).to.be.true
    await positionManager.connect(user1).liquidatePosition(user0.address, bnb.address, bnb.address, true, user1.address)
  })
})

describe("PositionManager next short data calculations", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let vault
  let vaultUtils
  let vaultPriceFeed
  let positionUtils
  let positionManager
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
  let orderBook
  let timelock
  let shortsTracker

  let glpManager
  let glp

  beforeEach(async () => {
    let tmp = await Promise.all([
      deployContract("Token", []),
      deployContract("PriceFeed", []),
      deployContract("Token", []),
      deployContract("PriceFeed", []),
      deployContract("Token", []),
      deployContract("PriceFeed", [])
    ])

    bnb = tmp[0]
    bnbPriceFeed = tmp[1]
    btc = tmp[2]
    btcPriceFeed = tmp[3]
    dai = tmp[4]
    daiPriceFeed = tmp[5]

    vault = await deployContract("Vault", [])
    await vault.setIsLeverageEnabled(false)
    usdg = await deployContract("USDG", [vault.address])
    router = await deployContract("Router", [vault.address, usdg.address, bnb.address])
    vaultPriceFeed = await deployContract("VaultPriceFeed", [])
    await vaultPriceFeed.setPriceSampleSpace(1)

    const initVaultResult = await initVault(vault, router, usdg, vaultPriceFeed)
    vaultUtils = initVaultResult.vaultUtils

    distributor0 = await deployContract("TimeDistributor", [])
    yieldTracker0 = await deployContract("YieldTracker", [usdg.address])

    await yieldTracker0.setDistributor(distributor0.address)
    await distributor0.setDistribution([yieldTracker0.address], [1000], [bnb.address])

    await bnb.mint(distributor0.address, 5000)
    await usdg.setYieldTrackers([yieldTracker0.address])

    Promise.all([
      vaultPriceFeed.setTokenConfig(bnb.address, bnbPriceFeed.address, 8, false),
      vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false),
      vaultPriceFeed.setTokenConfig(dai.address, daiPriceFeed.address, 8, false)
    ])

    orderBook = await deployContract("OrderBook", [])
    const minExecutionFee = 500000;
    await orderBook.initialize(
      router.address,
      vault.address,
      bnb.address,
      usdg.address,
      minExecutionFee,
      expandDecimals(5, 30) // minPurchseTokenAmountUsd
    );
    await router.addPlugin(orderBook.address)
    await router.connect(user0).approvePlugin(orderBook.address)

    glp = await deployContract("GLP", [])
    shortsTracker = await deployContract("ShortsTracker", [vault.address])
    glpManager = await deployContract("GlpManager", [
      vault.address,
      usdg.address,
      glp.address,
      shortsTracker.address,
      24 * 60 * 60
    ])

    positionUtils = await deployContract("PositionUtils", [])

    positionManager = await deployContract("PositionManager", [
      vault.address,
      router.address,
      shortsTracker.address,
      bnb.address,
      50,
      orderBook.address
    ], {
      libraries: {
        PositionUtils: positionUtils.address
      }
    })
    await positionManager.setInLegacyMode(true)
    await router.addPlugin(positionManager.address)
    await shortsTracker.setHandler(positionManager.address, true)

    await daiPriceFeed.setLatestAnswer(toChainlinkPrice(1))
    await vault.setTokenConfig(...getDaiConfig(dai, daiPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))
    await vault.setTokenConfig(...getBtcConfig(btc, btcPriceFeed))

    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(300))
    await vault.setTokenConfig(...getBnbConfig(bnb, bnbPriceFeed))

    await dai.mint(user0.address, expandDecimals(1000000, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(1000000, 18))
    await router.connect(user0).swap([dai.address, usdg.address], expandDecimals(500000, 18), expandDecimals(29000, 18), user0.address)
    await router.connect(user0).approvePlugin(positionManager.address)

    await dai.mint(user1.address, expandDecimals(500000, 18))
    await dai.connect(user1).approve(router.address, expandDecimals(3000000, 18))
    await router.connect(user1).approvePlugin(positionManager.address)

    await dai.mint(user2.address, expandDecimals(500000, 18))
    await dai.connect(user2).approve(router.address, expandDecimals(3000000, 18))
    await router.connect(user2).approvePlugin(positionManager.address)

    timelock = await deployContract("Timelock", [
      wallet.address, // _admin
      5 * 24 * 60 * 60, // _buffer
      ethers.constants.AddressZero, // _tokenManager
      ethers.constants.AddressZero, // _mintReceiver
      ethers.constants.AddressZero, // _glpManager
      ethers.constants.AddressZero, // _rewardRouter
      expandDecimals(1000, 18), // _maxTokenSupply
      10, // _marginFeeBasisPoints
      100 // _maxMarginFeeBasisPoints
    ])
    await timelock.setContractHandler(positionManager.address, true)
    await timelock.setShouldToggleIsLeverageEnabled(true)
    await vault.setGov(timelock.address)
  });

  async function getLiquidationState(account, collateralToken, indexToken, isLong) {
    // Vault is in disabled leverage state, fees are different, liquidation state is calculated incorrectly
    // need to enable levarage before calling validateLiquidation

    const marginFeeStorageSlot = "0x" + (15).toString(16)
    const originalMarginFeeBasisPoints = (await vault.marginFeeBasisPoints()).toNumber()
    await provider.send("hardhat_setStorageAt", [
      vault.address,
      marginFeeStorageSlot,
      "0x" + (10).toString(16).padStart(64, "0")
    ])
    const [liquidationState, marginFee] = await vault.validateLiquidation(user0.address, dai.address, btc.address, false, false)
    await provider.send("hardhat_setStorageAt", [
      vault.address,
      marginFeeStorageSlot,
      "0x" + (originalMarginFeeBasisPoints).toString(16).padStart(64, "0")
    ])
    return [liquidationState, marginFee]
  }

  async function debugState(label = "") {
    const poolAmount = await vault.poolAmounts(dai.address)
    const aum = await glpManager.getAum(true)
    const globalDelta = await shortsTracker.getGlobalShortDelta(btc.address)
    const averagePrice = await shortsTracker.globalShortAveragePrices(btc.address)
    const price = await vault.getMaxPrice(btc.address)
    const format = ethers.utils.formatUnits
    console.log('STATE %s:\n- pool:   %d\n- aum:    %d (%s)\n- delta: %s%d (%s)\n- price:  %d\n- avg:    %d (%s)',
      label,
      parseInt(format(poolAmount, 18)),
      parseInt(format(aum, 30)),
      aum,
      globalDelta[0] ? '+' : '-',
      Math.round(format(globalDelta[1], 30)),
      globalDelta[1],
      Math.round(format(price, 30)),
      Math.round(format(averagePrice, 30)),
      averagePrice,
    )
  }

  it("PositionManager and GlpManager init with shortsTracker", async () => {
    const [
      positionManagerShortTracker,
      glpManagerShortTracker,
      avgeragePrice,
      size
    ] = await Promise.all([
      positionManager.shortsTracker(),
      glpManager.shortsTracker(),
      shortsTracker.globalShortAveragePrices(btc.address),
      vault.globalShortSizes(btc.address)
    ])
    expect(positionManagerShortTracker, 'positionManager shortsTracker').eq(shortsTracker.address)
    expect(glpManagerShortTracker, 'glpManager shortsTracker').eq(shortsTracker.address)
    expect(avgeragePrice, 'averagePrice').to.be.equal(0)
    expect(size, 'size').to.be.equal(0)
  })

  it("does not update shorts data if isGlobalShortDataReady == false", async () => {
    expect(await shortsTracker.isGlobalShortDataReady()).to.be.false

    let averagePrice = await shortsTracker.globalShortAveragePrices(btc.address)
    expect(averagePrice, 0).to.be.equal(0)

    await positionManager.connect(user0).increasePosition([dai.address], btc.address, expandDecimals(100, 18), 0, toUsd(1000), false, toNormalizedPrice(60000))
    averagePrice = await shortsTracker.globalShortAveragePrices(btc.address)
    expect(averagePrice, 1).to.be.equal(0)

    await positionManager.connect(user0).decreasePosition(dai.address, btc.address, 0, toUsd(1000), false, user0.address, toNormalizedPrice(60000))
    averagePrice = await shortsTracker.globalShortAveragePrices(btc.address)
    expect(averagePrice, 2).to.be.equal(0)
  })

  it("updates global short sizes as Vault does", async () => {
    await shortsTracker.setIsGlobalShortDataReady(true)
    expect(await vault.globalShortSizes(btc.address)).to.be.equal(0)
    expect(await vault.globalShortSizes(btc.address)).to.be.equal(0)

    await positionManager.connect(user0).increasePosition([dai.address], btc.address, expandDecimals(100, 18), 0, toUsd(1000), false, toNormalizedPrice(60000))
    expect(await vault.globalShortSizes(btc.address)).to.be.equal(await vault.globalShortSizes(btc.address))
    expect(await vault.globalShortSizes(btc.address), 1).to.be.equal(toUsd(1000))

    await positionManager.connect(user0).decreasePosition(dai.address, btc.address, 0, toUsd(1000), false, user0.address, toNormalizedPrice(60000))
    expect(await vault.globalShortSizes(btc.address)).to.be.equal(await vault.globalShortSizes(btc.address))
    expect(await vault.globalShortSizes(btc.address), 1).to.be.equal(0)
  })

  it("updates global short average prices on position increases as Vault does", async () => {
    await shortsTracker.setIsGlobalShortDataReady(true)
    expect(await shortsTracker.globalShortAveragePrices(btc.address)).to.be.equal(0)
    expect(await vault.globalShortAveragePrices(btc.address)).to.be.equal(0)

    await positionManager.connect(user0).increasePosition([dai.address], btc.address, expandDecimals(100, 18), 0, toUsd(1000), false, toNormalizedPrice(60000))
    expect(await shortsTracker.globalShortAveragePrices(btc.address)).to.be.equal(await vault.globalShortAveragePrices(btc.address))

    await positionManager.connect(user0).increasePosition([dai.address], btc.address, expandDecimals(100, 18), 0, toUsd(1000), false, toNormalizedPrice(60000))
    expect(await shortsTracker.globalShortAveragePrices(btc.address)).to.be.equal(await vault.globalShortAveragePrices(btc.address))
  })

  function expectAumsAreEqual(aum0, aum1, label) {
    // aum slightly changes, it is caused by subtle rounding errors in Vault
    // we're checking it deviates by no more than 1 / 1,000,000,000,000,000 of a dollar

    const diff = aum0.sub(aum1).abs()
    label = `${label || ""} aum0: ${aum0.toString()} aum1: ${aum1.toString()} diff: ${diff.toString()}`
    expect(diff, label).to.be.lt(1000000000000000)
  }

  it("updates global short average prices on position decreases", async () => {
    await shortsTracker.setIsGlobalShortDataReady(true)
    await glpManager.setShortsTrackerAveragePriceWeight(10000)
    expect(await glpManager.shortsTrackerAveragePriceWeight()).to.be.equal(10000)

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))
    // "setting": short OI 100k, avg price 60,000, mark price 54,000, global pending pnl -10k
    await positionManager.connect(user1).increasePosition([dai.address], btc.address, expandDecimals(50000, 18), 0, toUsd(100000), false, toNormalizedPrice(60000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(54000))

    // at this point global pending pnl is 10k
    // CASE 1: open/close position when global pnl is positive
    let aumBefore = await glpManager.getAum(true)
    await positionManager.connect(user0).increasePosition([dai.address], btc.address, expandDecimals(10000, 18), 0, toUsd(100000), false, toNormalizedPrice(54000))
    await positionManager.connect(user0).decreasePosition(dai.address, btc.address, 0, toUsd(100000), false, user0.address, toNormalizedPrice(54000))
    let aumAfter = await glpManager.getAum(true)
    expectAumsAreEqual(aumBefore, aumAfter, "aum 0")

    let data = await shortsTracker.getGlobalShortDelta(btc.address)
    expect(data[0], "has profit 0").to.be.equal(true)
    expect(data[1], "delta 0").to.be.equal("9999999999999999999999999999999996")

    // CASE 2: open position, close in loss
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(54000))
    await positionManager.connect(user0).increasePosition([dai.address], btc.address, expandDecimals(50000, 18), 0, toUsd(100000), false, toNormalizedPrice(54000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(66000))

    aumBefore = await glpManager.getAum(true)
    await positionManager.connect(user0).decreasePosition(dai.address, btc.address, 0, toUsd(100000), false, user0.address, toNormalizedPrice(66000))
    aumAfter = await glpManager.getAum(true)
    expectAumsAreEqual(aumBefore, aumAfter, "aum 1")

    data = await shortsTracker.getGlobalShortDelta(btc.address)
    expect(data[0], "has profit 1").to.be.equal(false)
    expect(data[1], "delta 1").to.be.equal("10000000000000000000000000000000007")

    // CASE 3: open/close position when global pnl is negative
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(66000))
    aumBefore = await glpManager.getAum(true)
    await positionManager.connect(user0).increasePosition([dai.address], btc.address, expandDecimals(10000, 18), 0, toUsd(100000), false, toNormalizedPrice(66000))
    await positionManager.connect(user0).decreasePosition(dai.address, btc.address, 0, toUsd(100000), false, user0.address, toNormalizedPrice(66000))
    aumAfter = await glpManager.getAum(true)
    expectAumsAreEqual(aumBefore, aumAfter, "aum 2")

    data = await shortsTracker.getGlobalShortDelta(btc.address)
    expect(data[0], "has profit 2").to.be.equal(false)
    expect(data[1], "delta 2").to.be.equal("10000000000000000000000000000000007")

    // CASE 4: open position, close in profit
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(66000))
    await positionManager.connect(user0).increasePosition([dai.address], btc.address, expandDecimals(50000, 18), 0, toUsd(100000), false, toNormalizedPrice(54000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(54000))

    aumBefore = await glpManager.getAum(true)
    await positionManager.connect(user0).decreasePosition(dai.address, btc.address, 0, toUsd(100000), false, user0.address, toNormalizedPrice(54000))
    aumAfter = await glpManager.getAum(true)
    expectAumsAreEqual(aumBefore, aumAfter, "aum 3")

    data = await shortsTracker.getGlobalShortDelta(btc.address)
    expect(data[0], "has profit 3").to.be.equal(true)
    expect(data[1], "delta 3").to.be.equal("9999999999999999999999999999999993")

    // CASE 5: open position, close in profit in multiple steps
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))
    await positionManager.connect(user0).increasePosition([dai.address], btc.address, expandDecimals(30000, 18), 0, toUsd(90000), false, toNormalizedPrice(60000))

    aumBefore = await glpManager.getAum(true)

    // decrease 3 times by 1/3
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(57000))
    await positionManager.connect(user0).decreasePosition(dai.address, btc.address, toUsd(10000), toUsd(30000), false, user0.address, toNormalizedPrice(57000))
    // realised profit 4500

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(54000))
    await positionManager.connect(user0).decreasePosition(dai.address, btc.address, toUsd(10000), toUsd(30000), false, user0.address, toNormalizedPrice(54000))
    // realised profit 3000

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(51000))
    await positionManager.connect(user0).decreasePosition(dai.address, btc.address, 0, toUsd(30000), false, user0.address, toNormalizedPrice(51000))
    // realised profit 1500

    // total realised profit is 9000 => pool was decreased by 9000
    // pending profit from "other positions" is 15000
    // => aum should be 24000 less

    aumAfter = await glpManager.getAum(true)
    expectAumsAreEqual(aumBefore.sub("23999999999999999999999999999999994"), aumAfter, "aum 4") // -$24k

    data = await shortsTracker.getGlobalShortDelta(btc.address)
    expect(data[1], "delta 4").to.be.equal("14999999999999999999999999999999988") // $15k pending delta of other positions
    expect(data[0], "has profit 4").to.be.equal(true)

    // set price to "initial" (or current global average price)
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))
    aumAfter = await glpManager.getAum(true)
    expectAumsAreEqual(aumBefore.sub("8999999999999999999999999999999994"), aumAfter, "aum 4b") // -$9k

    data = await shortsTracker.getGlobalShortDelta(btc.address)
    expect(data[1], "delta 4b").to.be.equal(13) // ~0 pending delta of other positions
  })

  it("updates global short average prices on soft liquidation", async () => {
    await shortsTracker.setIsGlobalShortDataReady(true)
    await glpManager.setShortsTrackerAveragePriceWeight(10000)
    expect(await glpManager.shortsTrackerAveragePriceWeight()).to.be.equal(10000)
    // open pos A at 60,000
    // open pos B at 54,000
    // soft liquidated post B at 58,800
    // set price 60,000
    // pending

    // "setting": short OI 100k, avg price 60,000, mark price 54,000, global pending pnl -10k
    await positionManager.connect(user1).increasePosition([dai.address], btc.address, expandDecimals(50000, 18), 0, toUsd(100000), false, toNormalizedPrice(60000))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(54000))

    await positionManager.connect(user0).increasePosition([dai.address], btc.address, expandDecimals(10000, 18), 0, toUsd(100000), false, toNormalizedPrice(54000))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(58800))

    // make sure it's a soft liquidation
    const [liquidationState] = await getLiquidationState(user0.address, dai.address, btc.address, false, false)
    expect(liquidationState).to.be.eq(2)

    await positionManager.setLiquidator(user1.address, true)
    const aumBefore = await glpManager.getAum(true)
    await positionManager.connect(user1).liquidatePosition(user0.address, dai.address, btc.address, false, wallet.address)
    const aumAfter = await glpManager.getAum(true)
    expectAumsAreEqual(aumBefore, aumAfter, "aum")

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))
    data = await shortsTracker.getGlobalShortDelta(btc.address)
    expect(data[1], "delta").to.be.lt(100) // to consider rounding errors
  })

  it("updates global short average prices on hard liquidation", async () => {
    // open pos A 100k/50k at 60000
    // open pos B 100k/10k at 50000
    // liquidate pos B at 60000 at loss of 20k
    // aum should be increased by 10k (because pos B collateral is 10k) - $20 margin fee - $5 liquidation fee
    // and pending delta should be 0
    await shortsTracker.setIsGlobalShortDataReady(true)
    await glpManager.setShortsTrackerAveragePriceWeight(10000)
    expect(await glpManager.shortsTrackerAveragePriceWeight()).to.be.equal(10000)

    // "setting": short OI 100k, avg price 60,000, mark price 54,000, global pending pnl -10k
    await positionManager.connect(user1).increasePosition([dai.address], btc.address, expandDecimals(50000, 18), 0, toUsd(100000), false, toNormalizedPrice(60000))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(50000))

    await positionManager.connect(user0).increasePosition([dai.address], btc.address, expandDecimals(10000, 18), 0, toUsd(100000), false, toNormalizedPrice(50000))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))

    // make sure it's a hard liquidation
    const [liquidationState] = await getLiquidationState(user0.address, dai.address, btc.address, false, false)
    expect(liquidationState).to.be.eq(1)

    await positionManager.setLiquidator(user1.address, true)
    aumBefore = await glpManager.getAum(true)
    await positionManager.connect(user1).liquidatePosition(user0.address, dai.address, btc.address, false, wallet.address)
    aumAfter = await glpManager.getAum(true)

    // global delta should be the same as at the beginning – 0 because the first position avg price = current mark price = 60k
    const globalDelta = await shortsTracker.getGlobalShortDelta(btc.address)
    expect(globalDelta[0], "has profit").to.be.false
    expect(globalDelta[1], "delta").to.be.lt(100) // 100 to consider rounding errors

    // so the global avg price is 60k as well
    expect(await shortsTracker.globalShortAveragePrices(btc.address), "global avg price").to.be.eq("59999999999999999999999999999999999")

    // aum is expected to drop after hard liquidation
    // because calculated pending pnl < real pending pnl
    expectAumsAreEqual(aumBefore, aumAfter.add(toUsd(10205)))
  })

  it("updates global short average prices on hard liquidation with high borrow fee", async () => {
    await shortsTracker.setIsGlobalShortDataReady(true)
    await glpManager.setShortsTrackerAveragePriceWeight(10000)
    expect(await glpManager.shortsTrackerAveragePriceWeight()).to.be.equal(10000)

    const aumBefore = await glpManager.getAum(true)

    // "setting": short OI 100k, avg price 60,000, mark price 54,000, global pending pnl -10k
    await positionManager.connect(user1).increasePosition([dai.address], btc.address, expandDecimals(50000, 18), 0, toUsd(100000), false, toNormalizedPrice(60000))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(48000))
    await positionManager.connect(user0).increasePosition([dai.address], btc.address, expandDecimals(10000, 18), 0, toUsd(100000), false, toNormalizedPrice(48000))

    await increaseTime(provider, 86400 * 30)
    await vault.updateCumulativeFundingRate(dai.address, btc.address)

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(52800))
    // make sure it's a hard liquidation
    const [liquidationState, marginFee] = await getLiquidationState(user0.address, dai.address, btc.address, false, false)
    expect(liquidationState, "liquidation state").to.be.eq(1)

    // borrow fees are $2166,4 (2166400000000000000000000000000000) at this point
    await positionManager.setLiquidator(user1.address, true)
    await positionManager.connect(user1).liquidatePosition(user0.address, dai.address, btc.address, false, user1.address)

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))

    // aum should be increased by $9900 (pos collteral) - $2166,4 (borrow fee) - $100 (margin fee) - $5 (liquidation fee) = $7628,6
    const aumAfter = await glpManager.getAum(true)
    expectAumsAreEqual(aumBefore.add("7628600000000000000000000000000000"), aumAfter)

    // global delta should be the same as at the beginning: 0
    const globalDelta = await shortsTracker.getGlobalShortDelta(btc.address)
    expect(globalDelta[1], "delta").to.be.lt(10)
    expect(await shortsTracker.globalShortAveragePrices(btc.address), "global avg price").to.be.eq("59999999999999999999999999999999998")
  })

  it("updates global short average prices on hard liquidation with borrow fee exceeds collateral", async () => {
    await shortsTracker.setIsGlobalShortDataReady(true)
    await glpManager.setShortsTrackerAveragePriceWeight(10000)
    expect(await glpManager.shortsTrackerAveragePriceWeight()).to.be.equal(10000)

    const aumBefore = await glpManager.getAum(true)

    // "setting": short OI 100k, avg price 60,000, mark price 54,000, global pending pnl -10k
    await positionManager.connect(user1).increasePosition([dai.address], btc.address, expandDecimals(50000, 18), 0, toUsd(100000), false, toNormalizedPrice(60000))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(48000))
    await positionManager.connect(user0).increasePosition([dai.address], btc.address, expandDecimals(10000, 18), 0, toUsd(100000), false, toNormalizedPrice(48000))

    await increaseTime(provider, 86400 * 365)
    await vault.updateCumulativeFundingRate(dai.address, btc.address)

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(52800))
    // make sure it's a hard liquidation
    const [liquidationState, marginFee] = await getLiquidationState(user0.address, dai.address, btc.address, false, false)
    expect(liquidationState, "liquidation state").to.be.eq(1)

    // borrow fees are $2166,4 (2166400000000000000000000000000000) at this point
    await positionManager.setLiquidator(user1.address, true)
    await positionManager.connect(user1).liquidatePosition(user0.address, dai.address, btc.address, false, user1.address)

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))
    // debugState(2)

    // borrow fee exceeds collateral so nothing to increase pool by. pool is decreased by $5 liq fee
    // aum should be $5 lower than before
    const aumAfter = await glpManager.getAum(true)
    expectAumsAreEqual(aumBefore, aumAfter.add(toUsd(5)))

    // global delta should be the same as at the beginning: 0
    const globalDelta = await shortsTracker.getGlobalShortDelta(btc.address)
    expect(globalDelta[1], "delta").to.be.lt(10)
    expect(await shortsTracker.globalShortAveragePrices(btc.address), "global avg price").to.be.eq("59999999999999999999999999999999998")
  })


  it("updates global short average prices on multiple hard liquidations", async () => {
    // open pos A 100k/50k at 60000
    // open pos B 100k/10k at 50000
    // open pos C 100k/15k at 55000
    // liquidate pos B at 60000 at pending delta of -20k
    // liquidate pos C at 63250 at pending delta of -15k
    // set price 60000
    // aum should be increased by $25k collateral - $400 margin fees - $10 liq fees
    // and pending pnl should be 0
    await shortsTracker.setIsGlobalShortDataReady(true)
    await glpManager.setShortsTrackerAveragePriceWeight(10000)
    expect(await glpManager.shortsTrackerAveragePriceWeight()).to.be.equal(10000)

    let aumBefore = await glpManager.getAum(true)

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))
    await positionManager.connect(user0).increasePosition([dai.address], btc.address, expandDecimals(50000, 18), 0, toUsd(100000), false, toNormalizedPrice(60000))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(50000))
    await positionManager.connect(user1).increasePosition([dai.address], btc.address, expandDecimals(10000, 18), 0, toUsd(100000), false, toNormalizedPrice(50000))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(55000))
    await positionManager.connect(user2).increasePosition([dai.address], btc.address, expandDecimals(15000, 18), 0, toUsd(100000), false, toNormalizedPrice(55000))

    await positionManager.setLiquidator(user0.address, true)

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))
    await positionManager.connect(user0).liquidatePosition(user1.address, dai.address, btc.address, false, wallet.address)

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(65000))
    await positionManager.connect(user0).liquidatePosition(user2.address, dai.address, btc.address, false, wallet.address)

    // set price to initial
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))

    let data = await shortsTracker.getGlobalShortDelta(btc.address)
    expect(data[1], "global delta").to.be.lt(100) // 100 to consider rounding errors

    let aumAfter = await glpManager.getAum(true)
    expectAumsAreEqual(aumBefore, aumAfter.sub(toUsd(24590)), "aum")
  });

  it("does not update global short average prices on deposits or withdrawals", async () => {
    await shortsTracker.setIsGlobalShortDataReady(true)
    await glpManager.setShortsTrackerAveragePriceWeight(10000)
    expect(await glpManager.shortsTrackerAveragePriceWeight()).to.be.equal(10000)

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))
    // open "other" position
    await positionManager.connect(user0).increasePosition([dai.address], btc.address, expandDecimals(50000, 18), 0, toUsd(100000), false, toNormalizedPrice(60000))

    await positionManager.connect(user1).increasePosition([dai.address], btc.address, expandDecimals(50000, 18), 0, toUsd(100000), false, toNormalizedPrice(60000))

    const startAvgPrice = await shortsTracker.globalShortAveragePrices(btc.address)
    const startSize = await vault.globalShortSizes(btc.address)

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(55000))
    await positionManager.connect(user1).increasePosition([dai.address], btc.address, expandDecimals(10000, 18), 0, 0, false, toNormalizedPrice(55000))
    let avgPrice = await shortsTracker.globalShortAveragePrices(btc.address)
    expect(avgPrice, "avg price 0").to.be.eq(startAvgPrice)
    let size = await vault.globalShortSizes(btc.address)
    expect(size, "size 0").to.be.eq(startSize)

    await positionManager.connect(user1).decreasePosition(dai.address, btc.address, toUsd(10000), 0, false, user0.address, toNormalizedPrice(55000))
    avgPrice = await shortsTracker.globalShortAveragePrices(btc.address)
    expect(avgPrice, "avg price 1").to.be.eq(startAvgPrice)
    size = await vault.globalShortSizes(btc.address)
    expect(size, "size 1").to.be.eq(startSize)

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(65000))
    await positionManager.connect(user1).increasePosition([dai.address], btc.address, expandDecimals(10000, 18), 0, 0, false, toNormalizedPrice(65000))
    avgPrice = await shortsTracker.globalShortAveragePrices(btc.address)
    expect(avgPrice, "avg price 0").to.be.eq(startAvgPrice)
    size = await vault.globalShortSizes(btc.address)
    expect(size, "size 2").to.be.eq(startSize)

    await positionManager.connect(user1).decreasePosition(dai.address, btc.address, toUsd(10000), 0, false, user0.address, toNormalizedPrice(65000))
    avgPrice = await shortsTracker.globalShortAveragePrices(btc.address)
    expect(avgPrice, "avg price 1").to.be.eq(startAvgPrice)
    size = await vault.globalShortSizes(btc.address)
    expect(size, "size 3").to.be.eq(startSize)
  })

  it("aum should be the same after multiple increase/decrease shorts", async () => {
    // open pos A 100k/50k at 60000
    // open/close pos B 100k/10k at 50000 multiple times
    // set price 60000
    // aum should be the same
    // and pending pnl should be 0

    await shortsTracker.setIsGlobalShortDataReady(true)
    await glpManager.setShortsTrackerAveragePriceWeight(10000)
    expect(await glpManager.shortsTrackerAveragePriceWeight()).to.be.equal(10000)

    let aumBefore = await glpManager.getAum(true)

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))
    await positionManager.connect(user0).increasePosition([dai.address], btc.address, expandDecimals(50000, 18), 0, toUsd(100000), false, toNormalizedPrice(60000))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(50000))

    for (let i = 0; i < 5; i++) {
      await positionManager.connect(user1).increasePosition([dai.address], btc.address, expandDecimals(10000, 18), 0, toUsd(100000), false, toNormalizedPrice(50000))
      await positionManager.connect(user1).decreasePosition(dai.address, btc.address, 0, toUsd(100000), false, user0.address, toNormalizedPrice(50000))
    }

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))

    let data = await shortsTracker.getGlobalShortDelta(btc.address)
    expect(data[1], "global delta").to.be.lt(100) // 100 to consider rounding errors

    let aumAfter = await glpManager.getAum(true)
    expectAumsAreEqual(aumBefore, aumAfter, "aum")
  });

  it("executeIncreaseOrder updates global short data", async () => {
    await shortsTracker.setIsGlobalShortDataReady(true)
    await glpManager.setShortsTrackerAveragePriceWeight(10000)
    await positionManager.setOrderKeeper(user1.address, true)

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(50000))
    await positionManager.connect(user1).increasePosition([dai.address], btc.address, expandDecimals(50000, 18), 0, toUsd(100000), false, toNormalizedPrice(50000))

    const executionFee = expandDecimals(1, 17) // 0.1 WETH
    await orderBook.connect(user0).createIncreaseOrder(
      [dai.address], // path
      expandDecimals(1000, 18), // amountIn
      btc.address, // indexToken
      0, // minOut
      toUsd(2000), // sizeDelta
      dai.address, // collateralToken
      false, // isLong
      toUsd(59000), // triggerPrice
      true, // triggerAboveThreshold
      executionFee,
      false, // shouldWrap
      {value: executionFee}
    );

    let shortAveragePrice = await shortsTracker.globalShortAveragePrices(btc.address)
    expect(shortAveragePrice, "shortAveragePrice 0").to.be.equal(toUsd(50000))
    let shortSize = await vault.globalShortSizes(btc.address)
    expect(shortSize, "shortSize 0").to.be.equal(toUsd(100000))

    let orderIndex = (await orderBook.increaseOrdersIndex(user0.address)) - 1
    expect((await orderBook.increaseOrders(user0.address, orderIndex))[0]).to.be.equal(user0.address)

    let [size] = await vault.getPosition(user0.address, btc.address, btc.address, true)
    expect(size, "size 0").to.be.equal(0)

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))
    let aumBefore = await glpManager.getAum(true)
    await positionManager.connect(user1).executeIncreaseOrder(user0.address, orderIndex, user1.address);
    [size] = await vault.getPosition(user0.address, dai.address, btc.address, false)
    expect(size, "size 1").to.be.equal(toUsd(2000))

    shortAveragePrice = await shortsTracker.globalShortAveragePrices(btc.address)
    expect(shortAveragePrice, "shortAveragePrice 1").to.be.equal("50163934426229508196721311475409836")
    shortSize = await vault.globalShortSizes(btc.address)
    expect(shortSize, "shortSize 1").to.be.equal(toUsd(102000))

    let aumAfter = await glpManager.getAum(true)
    expectAumsAreEqual(aumBefore, aumAfter, "aum 0")
  })

  it("executeDecreaseOrder updates global short data", async () => {
    await shortsTracker.setIsGlobalShortDataReady(true)
    await glpManager.setShortsTrackerAveragePriceWeight(10000)
    await positionManager.setOrderKeeper(user1.address, true)

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(50000))
    await positionManager.connect(user1).increasePosition([dai.address], btc.address, expandDecimals(50000, 18), 0, toUsd(100000), false, toNormalizedPrice(50000))

    await router.connect(user1).approvePlugin(orderBook.address)

    const executionFee = expandDecimals(1, 17) // 0.1 WETH
    await orderBook.connect(user1).createDecreaseOrder(
      btc.address, // indexToken
      toUsd(10000), // sizeDelta
      dai.address, // collateralToken
      toUsd(5000), // collateralDelta
      false, // isLong
      toUsd(0), // triggerPrice
      true, // triggerAboveThreshold
      {value: executionFee}
    );

    let orderIndex = (await orderBook.decreaseOrdersIndex(user1.address)) - 1
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))
    let [size] = await vault.getPosition(user1.address, dai.address, btc.address, false)
    expect(size, "size 1").to.be.equal(toUsd(100000))

    let aumBefore = await glpManager.getAum(true)
    let shortAveragePrice = await shortsTracker.globalShortAveragePrices(btc.address)
    expect(shortAveragePrice, "shortAveragePrice 0").to.be.equal(toUsd(50000))
    let shortSize = await vault.globalShortSizes(btc.address)
    expect(shortSize, "shortSize 0").to.be.equal(toUsd(100000))

    await positionManager.connect(user1).executeDecreaseOrder(user1.address, orderIndex, user1.address);
    [size] = await vault.getPosition(user1.address, dai.address, btc.address, false)
    expect(size, "size 1").to.be.equal(toUsd(90000))

    shortAveragePrice = await shortsTracker.globalShortAveragePrices(btc.address)
    expect(shortAveragePrice, "shortAveragePrice 1").to.be.equal(toUsd(50000))
    shortSize = await vault.globalShortSizes(btc.address)
    expect(shortSize, "shortSize 1").to.be.equal(toUsd(90000))
    let aumAfter = await glpManager.getAum(true)
    expectAumsAreEqual(aumBefore, aumAfter, "aum 0")
  })

  it("compare gas costs", async () => {
    await shortsTracker.setIsGlobalShortDataReady(true)

    await positionManager.connect(user1).increasePosition([dai.address], btc.address, expandDecimals(50000, 18), 0, toUsd(100000), false, toNormalizedPrice(60000))
    await positionManager.connect(user1).decreasePosition(dai.address, btc.address, 0, toUsd(50000), false, user0.address, toNormalizedPrice(60000))

    console.log("\nReport prices with short tracker enabled:")

    let tx0 = await positionManager.connect(user0).increasePosition([dai.address], btc.address, expandDecimals(50000, 18), 0, toUsd(100000), false, toNormalizedPrice(60000))
    const tx0GasUsed0 = await reportGasUsed(provider, tx0, "open position")

    let tx1 = await positionManager.connect(user0).increasePosition([dai.address], btc.address, expandDecimals(50000, 18), 0, toUsd(100000), false, toNormalizedPrice(60000))
    const tx1GasUsed0 = await reportGasUsed(provider, tx1, "increase position")

    let tx2 = await positionManager.connect(user0).decreasePosition(dai.address, btc.address, 0, toUsd(100000), false, user0.address, toNormalizedPrice(60000))
    const tx2GasUsed0 = await reportGasUsed(provider, tx2, "decrease position")

    let tx3 = await positionManager.connect(user0).decreasePosition(dai.address, btc.address, 0, toUsd(100000), false, user0.address, toNormalizedPrice(60000))
    const tx3GasUsed0 = await reportGasUsed(provider, tx3, "close position")

    await shortsTracker.setIsGlobalShortDataReady(false)

    console.log("\nReport prices with short tracker disabled:")

    tx0 = await positionManager.connect(user0).increasePosition([dai.address], btc.address, expandDecimals(50000, 18), 0, toUsd(100000), false, toNormalizedPrice(60000))
    const tx0GasUsed1 = await reportGasUsed(provider, tx0, "open position")

    tx1 = await positionManager.connect(user0).increasePosition([dai.address], btc.address, expandDecimals(50000, 18), 0, toUsd(100000), false, toNormalizedPrice(60000))
    const tx1GasUsed1 = await reportGasUsed(provider, tx1, "increase position")

    tx2 = await positionManager.connect(user0).decreasePosition(dai.address, btc.address, 0, toUsd(100000), false, user0.address, toNormalizedPrice(60000))
    const tx2GasUsed1 = await reportGasUsed(provider, tx2, "decrease position")

    tx3 = await positionManager.connect(user0).decreasePosition(dai.address, btc.address, 0, toUsd(100000), false, user0.address, toNormalizedPrice(60000))
    const tx3GasUsed1 = await reportGasUsed(provider, tx3, "close position")

    console.log("\nGas increase with short tracker:")
    console.log("open position +%s (+%s%)", tx0GasUsed0 - tx0GasUsed1, ((tx0GasUsed0 - tx0GasUsed1) / tx0GasUsed1 * 100).toFixed(2))
    console.log("increase position +%s (+%s%)", tx1GasUsed0 - tx1GasUsed1, ((tx1GasUsed0 - tx1GasUsed1) / tx1GasUsed1 * 100).toFixed(2))
    console.log("decrease position +%s (+%s%)", tx2GasUsed0 - tx2GasUsed1, ((tx2GasUsed0 - tx2GasUsed1) / tx2GasUsed1 * 100).toFixed(2))
    console.log("close position +%s (+%s%)", tx3GasUsed0 - tx3GasUsed1, ((tx3GasUsed0 - tx3GasUsed1) / tx3GasUsed1 * 100).toFixed(2))
  })
})
