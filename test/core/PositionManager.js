const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed } = require("../shared/utilities")
const { toChainlinkPrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig, validateVaultBalance } = require("./Vault/helpers")

use(solidity)

const USD_PRECISION = expandDecimals(1, 30)

describe("PositionManager", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let vault
  let vaultUtils
  let vaultPriceFeed
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

    glp = await deployContract("GLP", [])
    glpManager = await deployContract("GlpManager", [vault.address, usdg.address, glp.address, 24 * 60 * 60])

    positionManager = await deployContract("PositionManager", [vault.address, router.address, bnb.address, 50, orderBook.address])

    await daiPriceFeed.setLatestAnswer(toChainlinkPrice(1))
    await vault.setTokenConfig(...getDaiConfig(dai, daiPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))
    await vault.setTokenConfig(...getBtcConfig(btc, btcPriceFeed))

    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(300))
    await vault.setTokenConfig(...getBnbConfig(bnb, bnbPriceFeed))
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
      .to.be.revertedWith("BasePositionManager: forbidden")

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

  it("increasePosition and decreasePosition", async () => {
    const timelock = await deployContract("Timelock", [
      wallet.address,
      5 * 24 * 60 * 60,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      expandDecimals(1000, 18),
      10,
      100
    ])

    await expect(positionManager.connect(user0).increasePosition([btc.address], btc.address, expandDecimals(1, 7), 0, 0, true, toUsd(100000)))
      .to.be.revertedWith("PositionManager: forbidden")

    await vault.setGov(timelock.address)
    await router.addPlugin(positionManager.address)
    await router.connect(user0).approvePlugin(positionManager.address)

    await btc.connect(user0).approve(router.address, expandDecimals(1, 8))
    await btc.mint(user0.address, expandDecimals(3, 8))

    await positionManager.setInLegacyMode(true)
    await expect(positionManager.connect(user0).increasePosition([btc.address], btc.address, expandDecimals(1, 7), 0, 0, true, toUsd(100000)))
      .to.be.revertedWith("Timelock: forbidden")

    await timelock.setContractHandler(positionManager.address, true)
    await timelock.setShouldToggleIsLeverageEnabled(true)

    await btc.mint(user1.address, expandDecimals(10, 8))
    await btc.connect(user1).approve(router.address, expandDecimals(10, 8))
    await router.connect(user1).swap([btc.address, usdg.address], expandDecimals(5, 8), expandDecimals(59000, 18), user1.address)

    await dai.mint(user1.address, expandDecimals(300000, 18))
    await dai.connect(user1).approve(router.address, expandDecimals(300000, 18))
    await router.connect(user1).swap([dai.address, usdg.address], expandDecimals(150000, 18), expandDecimals(29000, 18), user1.address)

    await dai.mint(user0.address, expandDecimals(20000, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(20000, 18))

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

    expect(await btc.balanceOf(user0.address)).to.be.equal("298500000")
    await positionManager.connect(user0).decreasePosition(btc.address, btc.address, position[1], position[0], true, user0.address, 0)
    expect(await btc.balanceOf(user0.address)).to.be.equal("300316333")
    position = await vault.getPosition(user0.address, btc.address, btc.address, true)
    expect(position[0]).eq(0) // size
    expect(position[1]).eq(0) // collateral

    await positionManager.setInLegacyMode(false)
    await expect(positionManager.connect(user0).increasePosition([dai.address, btc.address], btc.address, expandDecimals(200, 18), "332333", toUsd(2000), true, toNormalizedPrice(60000))).to.be.revertedWith("PositionManager: forbidden")

    // partners should have access in non-legacy mode
    expect(await positionManager.isPartner(user0.address)).to.be.false
    await positionManager.setPartner(user0.address, true)
    expect(await positionManager.isPartner(user0.address)).to.be.true
    await positionManager.connect(user0).increasePosition([dai.address, btc.address], btc.address, expandDecimals(200, 18), "332333", toUsd(2000), true, toNormalizedPrice(60000))
  })

  it("increasePositionETH and decreasePositionETH", async () => {
    const timelock = await deployContract("Timelock", [
      wallet.address,
      5 * 24 * 60 * 60,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      expandDecimals(1000, 18),
      10,
      100
    ])

    await expect(positionManager.connect(user0).increasePositionETH([bnb.address], bnb.address, 0, 0, true, toUsd(100000), { value: expandDecimals(1, 18) }))
      .to.be.revertedWith("PositionManager: forbidden")

    await vault.setGov(timelock.address)
    await router.addPlugin(positionManager.address)
    await router.connect(user0).approvePlugin(positionManager.address)

    await positionManager.setInLegacyMode(true)
    await expect(positionManager.connect(user0).increasePositionETH([bnb.address], bnb.address, 0, 0, true, toUsd(100000), { value: expandDecimals(1, 18) }))
      .to.be.revertedWith("Timelock: forbidden")

    await timelock.setContractHandler(positionManager.address, true)
    await timelock.setShouldToggleIsLeverageEnabled(true)

    await bnb.mint(user1.address, expandDecimals(100, 18))
    await bnb.connect(user1).approve(router.address, expandDecimals(100, 18))
    await router.connect(user1).swap([bnb.address, usdg.address], expandDecimals(50, 18), 0, user1.address)

    await dai.mint(user1.address, expandDecimals(300000, 18))
    await dai.connect(user1).approve(router.address, expandDecimals(300000, 18))
    await router.connect(user1).swap([dai.address, usdg.address], expandDecimals(150000, 18), expandDecimals(29000, 18), user1.address)

    await dai.mint(user0.address, expandDecimals(20000, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(20000, 18))

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

    expect(await provider.getBalance(user0.address)).to.be.equal("9995986573609110341155")
    await positionManager.connect(user0).decreasePositionETH(bnb.address, bnb.address, position[1], position[0], true, user0.address, 0)
    expect(await provider.getBalance(user0.address)).to.be.equal("9999953739409058954435")
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
    const timelock = await deployContract("Timelock", [
      wallet.address,
      5 * 24 * 60 * 60,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      expandDecimals(1000, 18),
      10,
      100
    ])

    await vault.setGov(timelock.address)
    await timelock.setContractHandler(positionManager.address, true)
    await router.addPlugin(positionManager.address)
    await router.connect(user0).approvePlugin(positionManager.address)

    await bnb.mint(user1.address, expandDecimals(100, 18))
    await bnb.connect(user1).approve(router.address, expandDecimals(100, 18))
    await router.connect(user1).swap([bnb.address, usdg.address], expandDecimals(100, 18), expandDecimals(29000, 18), user1.address)

    await dai.mint(user1.address, expandDecimals(30000, 18))
    await dai.connect(user1).approve(router.address, expandDecimals(30000, 18))
    await router.connect(user1).swap([dai.address, usdg.address], expandDecimals(30000, 18), expandDecimals(29000, 18), user1.address)

    await btc.mint(user1.address, expandDecimals(1, 8))
    await btc.connect(user1).approve(router.address, expandDecimals(1, 8))
    await router.connect(user1).swap([btc.address, usdg.address], expandDecimals(1, 8), expandDecimals(59000, 18), user1.address)

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
    const timelock = await deployContract("Timelock", [
      wallet.address,
      5 * 24 * 60 * 60,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      expandDecimals(1000, 18),
      10,
      100
    ])

    await vault.setGov(timelock.address)
    await timelock.setContractHandler(positionManager.address, true)
    await router.addPlugin(positionManager.address)
    await router.connect(user0).approvePlugin(positionManager.address)

    await bnb.mint(user1.address, expandDecimals(100, 18))
    await bnb.connect(user1).approve(router.address, expandDecimals(100, 18))
    await router.connect(user1).swap([bnb.address, usdg.address], expandDecimals(100, 18), expandDecimals(29000, 18), user1.address)

    await dai.mint(user1.address, expandDecimals(30000, 18))
    await dai.connect(user1).approve(router.address, expandDecimals(30000, 18))
    await router.connect(user1).swap([dai.address, usdg.address], expandDecimals(30000, 18), expandDecimals(29000, 18), user1.address)

    await btc.mint(user1.address, expandDecimals(1, 8))
    await btc.connect(user1).approve(router.address, expandDecimals(1, 8))
    await router.connect(user1).swap([btc.address, usdg.address], expandDecimals(1, 8), expandDecimals(59000, 18), user1.address)

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

  it("deposit collateral for shorts", async () => {
    const timelock = await deployContract("Timelock", [
      wallet.address,
      5 * 24 * 60 * 60,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      expandDecimals(1000, 18),
      10,
      100
    ])

    await vault.setGov(timelock.address)
    await timelock.setContractHandler(positionManager.address, true)
    await router.addPlugin(positionManager.address)
    await router.connect(user0).approvePlugin(positionManager.address)

    await bnb.mint(user1.address, expandDecimals(100, 18))
    await bnb.connect(user1).approve(router.address, expandDecimals(100, 18))
    await router.connect(user1).swap([bnb.address, usdg.address], expandDecimals(100, 18), expandDecimals(29000, 18), user1.address)

    await dai.mint(user1.address, expandDecimals(30000, 18))
    await dai.connect(user1).approve(router.address, expandDecimals(30000, 18))
    await router.connect(user1).swap([dai.address, usdg.address], expandDecimals(30000, 18), expandDecimals(29000, 18), user1.address)

    await btc.mint(user1.address, expandDecimals(1, 8))
    await btc.connect(user1).approve(router.address, expandDecimals(1, 8))
    await router.connect(user1).swap([btc.address, usdg.address], expandDecimals(1, 8), expandDecimals(59000, 18), user1.address)

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
})
