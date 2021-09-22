const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed, newWallet } = require("../shared/utilities")
const { toChainlinkPrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig } = require("./Vault/helpers")

use(solidity)

describe("Router", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let vault
  let usdg
  let router
  let vaultPriceFeed
  let bnb
  let bnbPriceFeed
  let btc
  let btcPriceFeed
  let eth
  let ethPriceFeed
  let dai
  let daiPriceFeed
  let busd
  let busdPriceFeed
  let distributor0
  let yieldTracker0
  let reader

  beforeEach(async () => {
    bnb = await deployContract("Token", [])
    bnbPriceFeed = await deployContract("PriceFeed", [])

    btc = await deployContract("Token", [])
    btcPriceFeed = await deployContract("PriceFeed", [])

    eth = await deployContract("Token", [])
    ethPriceFeed = await deployContract("PriceFeed", [])

    dai = await deployContract("Token", [])
    daiPriceFeed = await deployContract("PriceFeed", [])

    busd = await deployContract("Token", [])
    busdPriceFeed = await deployContract("PriceFeed", [])

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

    reader = await deployContract("Reader", [])

    await vaultPriceFeed.setTokenConfig(bnb.address, bnbPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(eth.address, ethPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(dai.address, daiPriceFeed.address, 8, false)

    await daiPriceFeed.setLatestAnswer(toChainlinkPrice(1))
    await vault.setTokenConfig(...getDaiConfig(dai, daiPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))
    await vault.setTokenConfig(...getBtcConfig(btc, btcPriceFeed))

    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(300))
    await vault.setTokenConfig(...getBnbConfig(bnb, bnbPriceFeed))

    await bnb.connect(user3).deposit({ value: expandDecimals(100, 18) })
  })

  it("setGov", async () => {
    await expect(router.connect(user0).setGov(user1.address))
      .to.be.revertedWith("Router: forbidden")

    expect(await router.gov()).eq(wallet.address)

    await router.setGov(user0.address)
    expect(await router.gov()).eq(user0.address)

    await router.connect(user0).setGov(user1.address)
    expect(await router.gov()).eq(user1.address)
  })

  it("addPlugin", async () => {
    await expect(router.connect(user0).addPlugin(user1.address))
      .to.be.revertedWith("Router: forbidden")

    await router.setGov(user0.address)

    expect(await router.plugins(user1.address)).eq(false)
    await router.connect(user0).addPlugin(user1.address)
    expect(await router.plugins(user1.address)).eq(true)
  })

  it("removePlugin", async () => {
    await expect(router.connect(user0).removePlugin(user1.address))
      .to.be.revertedWith("Router: forbidden")

    await router.setGov(user0.address)

    expect(await router.plugins(user1.address)).eq(false)
    await router.connect(user0).addPlugin(user1.address)
    expect(await router.plugins(user1.address)).eq(true)
    await router.connect(user0).removePlugin(user1.address)
    expect(await router.plugins(user1.address)).eq(false)
  })

  it("approvePlugin", async () => {
    expect(await router.approvedPlugins(user0.address, user1.address)).eq(false)
    await router.connect(user0).approvePlugin(user1.address)
    expect(await router.approvedPlugins(user0.address, user1.address)).eq(true)
  })

  it("denyPlugin", async () => {
    expect(await router.approvedPlugins(user0.address, user1.address)).eq(false)
    await router.connect(user0).approvePlugin(user1.address)
    expect(await router.approvedPlugins(user0.address, user1.address)).eq(true)
    await router.connect(user0).denyPlugin(user1.address)
    expect(await router.approvedPlugins(user0.address, user1.address)).eq(false)
  })

  it("pluginTransfer", async () => {
    await router.addPlugin(user1.address)
    await router.connect(user0).approvePlugin(user1.address)

    await dai.mint(user0.address, 2000)
    await dai.connect(user0).approve(router.address, 1000)
    expect(await dai.allowance(user0.address, router.address)).eq(1000)
    expect(await dai.balanceOf(user2.address)).eq(0)
    await router.connect(user1).pluginTransfer(dai.address, user0.address, user2.address, 800)
    expect(await dai.allowance(user0.address, router.address)).eq(200)
    expect(await dai.balanceOf(user2.address)).eq(800)

    await expect(router.connect(user2).pluginTransfer(dai.address, user0.address, user2.address, 1))
      .to.be.revertedWith("Router: invalid plugin")
    await router.addPlugin(user2.address)
    await expect(router.connect(user2).pluginTransfer(dai.address, user0.address, user2.address, 1))
      .to.be.revertedWith("Router: plugin not approved")
  })

  it("pluginIncreasePosition", async () => {
    await router.addPlugin(user1.address)
    await router.connect(user0).approvePlugin(user1.address)

    await expect(router.connect(user1).pluginIncreasePosition(user0.address, bnb.address, bnb.address, 1000, true))
      .to.be.revertedWith("Vault: insufficient collateral for fees")

    await expect(router.connect(user2).pluginIncreasePosition(user0.address, bnb.address, bnb.address, 1000, true))
      .to.be.revertedWith("Router: invalid plugin")
    await router.addPlugin(user2.address)
    await expect(router.connect(user2).pluginIncreasePosition(user0.address, bnb.address, bnb.address, 1000, true))
      .to.be.revertedWith("Router: plugin not approved")
  })

  it("pluginDecreasePosition", async () => {
    await router.addPlugin(user1.address)
    await router.connect(user0).approvePlugin(user1.address)

    await expect(router.connect(user1).pluginDecreasePosition(user0.address, bnb.address, bnb.address, 100, 1000, true, user0.address))
      .to.be.revertedWith("Vault: empty position")

    await expect(router.connect(user2).pluginDecreasePosition(user0.address, bnb.address, bnb.address, 100, 1000, true, user0.address))
      .to.be.revertedWith("Router: invalid plugin")
    await router.addPlugin(user2.address)
    await expect(router.connect(user2).pluginDecreasePosition(user0.address, bnb.address, bnb.address, 100, 1000, true, user0.address))
      .to.be.revertedWith("Router: plugin not approved")
  })

  it("swap, buy USDG", async () => {
    await vaultPriceFeed.getPrice(dai.address, true, true, true)
    await dai.mint(user0.address, expandDecimals(200, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(200, 18))

    await expect(router.connect(user0).swap([dai.address, usdg.address], expandDecimals(200, 18), expandDecimals(201, 18), user0.address))
      .to.be.revertedWith("Router: insufficient amountOut")

    expect(await dai.balanceOf(user0.address)).eq(expandDecimals(200, 18))
    expect(await usdg.balanceOf(user0.address)).eq(0)
    const tx = await router.connect(user0).swap([dai.address, usdg.address], expandDecimals(200, 18), expandDecimals(199, 18), user0.address)
    await reportGasUsed(provider, tx, "buyUSDG gas used")
    expect(await dai.balanceOf(user0.address)).eq(0)
    expect(await usdg.balanceOf(user0.address)).eq("199400000000000000000") // 199.4
  })

  it("swap, sell USDG", async () => {
    await dai.mint(user0.address, expandDecimals(200, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(200, 18))

    await expect(router.connect(user0).swap([dai.address, usdg.address], expandDecimals(200, 18), expandDecimals(201, 18), user0.address))
      .to.be.revertedWith("Router: insufficient amountOut")

    expect(await dai.balanceOf(user0.address)).eq(expandDecimals(200, 18))
    expect(await usdg.balanceOf(user0.address)).eq(0)
    const tx = await router.connect(user0).swap([dai.address, usdg.address], expandDecimals(200, 18), expandDecimals(199, 18), user0.address)
    await reportGasUsed(provider, tx, "sellUSDG gas used")
    expect(await dai.balanceOf(user0.address)).eq(0)
    expect(await usdg.balanceOf(user0.address)).eq("199400000000000000000") // 199.4

    await usdg.connect(user0).approve(router.address, expandDecimals(100, 18))
    await expect(router.connect(user0).swap([usdg.address, dai.address], expandDecimals(100, 18), expandDecimals(100, 18), user0.address))
      .to.be.revertedWith("Router: insufficient amountOut")

    await router.connect(user0).swap([usdg.address, dai.address], expandDecimals(100, 18), expandDecimals(99, 18), user0.address)
    expect(await dai.balanceOf(user0.address)).eq("99700000000000000000") // 99.7
    expect(await usdg.balanceOf(user0.address)).eq("99400000000000000000") // 99.4
  })

  it("swap, path.length == 2", async () => {
    await btc.mint(user0.address, expandDecimals(1, 8))
    await btc.connect(user0).approve(router.address, expandDecimals(1, 8))
    await expect(router.connect(user0).swap([btc.address, usdg.address], expandDecimals(1, 8), expandDecimals(60000, 18), user0.address))
      .to.be.revertedWith("Router: insufficient amountOut")
    await router.connect(user0).swap([btc.address, usdg.address], expandDecimals(1, 8), expandDecimals(59000, 18), user0.address)

    await dai.mint(user0.address, expandDecimals(30000, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(30000, 18))
    await expect(router.connect(user0).swap([dai.address, btc.address], expandDecimals(30000, 18), "50000000", user0.address)) // 0.5 BTC
      .to.be.revertedWith("Router: insufficient amountOut")

    expect(await dai.balanceOf(user0.address)).eq(expandDecimals(30000, 18))
    expect(await btc.balanceOf(user0.address)).eq(0)
    const tx = await router.connect(user0).swap([dai.address, btc.address], expandDecimals(30000, 18), "49000000", user0.address)
    await reportGasUsed(provider, tx, "swap gas used")
    expect(await dai.balanceOf(user0.address)).eq(0)
    expect(await btc.balanceOf(user0.address)).eq("49850000") // 0.4985
  })

  it("swap, path.length == 3", async () => {
    await btc.mint(user0.address, expandDecimals(1, 8))
    await btc.connect(user0).approve(router.address, expandDecimals(1, 8))
    await router.connect(user0).swap([btc.address, usdg.address], expandDecimals(1, 8), expandDecimals(59000, 18), user0.address)

    await dai.mint(user0.address, expandDecimals(30000, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(30000, 18))
    await router.connect(user0).swap([dai.address, usdg.address], expandDecimals(30000, 18), expandDecimals(29000, 18), user0.address)

    await usdg.connect(user0).approve(router.address, expandDecimals(20000, 18))

    expect(await dai.balanceOf(user0.address)).eq(0)
    expect(await usdg.balanceOf(user0.address)).eq(expandDecimals(89730, 18))
    await expect(router.connect(user0).swap([usdg.address, dai.address, usdg.address], expandDecimals(20000, 18), expandDecimals(20000, 18), user0.address))
      .to.be.revertedWith("Router: insufficient amountOut")

    await router.connect(user0).swap([usdg.address, dai.address, usdg.address], expandDecimals(20000, 18), expandDecimals(19000, 18), user0.address)
    expect(await dai.balanceOf(user0.address)).eq(0)
    expect(await usdg.balanceOf(user0.address)).eq("89610180000000000000000") // 89610.18

    await usdg.connect(user0).approve(router.address, expandDecimals(40000, 18))
    await expect(router.connect(user0).swap([usdg.address, dai.address, btc.address], expandDecimals(30000, 18), expandDecimals(39000, 18), user0.address))
      .to.be.revertedWith("Vault: poolAmount exceeded") // this reverts as some DAI has been transferred from the pool to the fee reserve

    expect(await vault.poolAmounts(dai.address)).eq("29790180000000000000000") // 29790.18
    expect(await vault.feeReserves(dai.address)).eq("209820000000000000000") // 209.82

    await expect(router.connect(user0).swap([usdg.address, dai.address, btc.address], expandDecimals(20000, 18), "34000000", user0.address))
      .to.be.revertedWith("Router: insufficient amountOut")

    const tx = await router.connect(user0).swap([usdg.address, dai.address, btc.address], expandDecimals(20000, 18), "33000000", user0.address)
    await reportGasUsed(provider, tx, "swap gas used")
    expect(await usdg.balanceOf(user0.address)).eq("69610180000000000000000") // 69610.18
    expect(await btc.balanceOf(user0.address)).eq("33133633") // 0.33133633 BTC
  })

  it("swap, increasePosition", async () => {
    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(600))
    await busdPriceFeed.setLatestAnswer(toChainlinkPrice(1))

    await vault.setTokenConfig(...getBnbConfig(bnb, bnbPriceFeed))

    const bnbBusd = await deployContract("PancakePair", [])
    await bnbBusd.setReserves(expandDecimals(1000, 18), expandDecimals(300 * 1000, 18))

    const ethBnb = await deployContract("PancakePair", [])
    await ethBnb.setReserves(expandDecimals(800, 18), expandDecimals(100, 18))

    const btcBnb = await deployContract("PancakePair", [])
    await btcBnb.setReserves(expandDecimals(10, 18), expandDecimals(2000, 18))

    await vaultPriceFeed.setTokens(btc.address, eth.address, bnb.address)
    await vaultPriceFeed.setPairs(bnbBusd.address, ethBnb.address, btcBnb.address)

    await btc.mint(user0.address, expandDecimals(1, 8))
    await btc.connect(user0).approve(router.address, expandDecimals(1, 8))
    await router.connect(user0).swap([btc.address, usdg.address], expandDecimals(1, 8), expandDecimals(59000, 18), user0.address)

    await dai.mint(user0.address, expandDecimals(200, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(200, 18))

    await expect(router.connect(user0).increasePosition([dai.address, btc.address], btc.address, expandDecimals(200, 18), "333333", toUsd(1200), true, toNormalizedPrice(60000)))
      .to.be.revertedWith("Router: insufficient amountOut")

    await expect(router.connect(user0).increasePosition([dai.address, btc.address], btc.address, expandDecimals(200, 18), "332333", toUsd(1200), true, toNormalizedPrice(60000 - 1)))
      .to.be.revertedWith("Router: mark price higher than limit")

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))

    await vaultPriceFeed.setPriceSampleSpace(2)

    const tx = await router.connect(user0).increasePosition([dai.address, btc.address], btc.address, expandDecimals(200, 18), "332333", toUsd(1200), true, toNormalizedPrice(60000))
    await reportGasUsed(provider, tx, "increasePosition gas used")
  })

  it("decreasePositionAndSwap", async () => {
    await btc.mint(user0.address, expandDecimals(1, 8))
    await btc.connect(user0).approve(router.address, expandDecimals(1, 8))
    await router.connect(user0).swap([btc.address, usdg.address], expandDecimals(1, 8), expandDecimals(59000, 18), user0.address)

    await dai.mint(user0.address, expandDecimals(30000, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(30000, 18))
    await router.connect(user0).swap([dai.address, usdg.address], expandDecimals(30000, 18), expandDecimals(29000, 18), user0.address)

    await dai.mint(user0.address, expandDecimals(200, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(200, 18))
    await router.connect(user0).increasePosition([dai.address, btc.address], btc.address, expandDecimals(200, 18), "332333", toUsd(1200), true, toNormalizedPrice(60000))

    await expect(router.connect(user0).decreasePositionAndSwap([btc.address, dai.address], btc.address, 0, toUsd(1200), true, user1.address, toNormalizedPrice(60000), expandDecimals(197, 18)))
      .to.be.revertedWith("Router: insufficient amountOut")

    expect(await dai.balanceOf(user1.address)).eq(0)
    expect(await dai.balanceOf(router.address)).eq(0)

    await router.connect(user0).decreasePositionAndSwap([btc.address, dai.address], btc.address, 0, toUsd(1200), true, user1.address, toNormalizedPrice(60000), expandDecimals(196, 18))

    expect(await dai.balanceOf(user1.address)).eq("196408800600000000000") // 196.4088006
    expect(await dai.balanceOf(router.address)).eq(0)
  })

  it("decreasePositionAndSwapETH", async () => {
    await btc.mint(user0.address, expandDecimals(1, 8))
    await btc.connect(user0).approve(router.address, expandDecimals(1, 8))
    await router.connect(user0).swap([btc.address, usdg.address], expandDecimals(1, 8), expandDecimals(59000, 18), user0.address)

    await dai.mint(user0.address, expandDecimals(30000, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(30000, 18))
    await router.connect(user0).swap([dai.address, usdg.address], expandDecimals(30000, 18), expandDecimals(29000, 18), user0.address)

    await bnb.mint(user0.address, expandDecimals(10, 18))
    await bnb.connect(user0).approve(router.address, expandDecimals(10, 18))
    await router.connect(user0).swap([bnb.address, usdg.address], expandDecimals(10, 18), expandDecimals(2900, 18), user0.address)

    await dai.mint(user0.address, expandDecimals(200, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(200, 18))
    await router.connect(user0).increasePosition([dai.address, btc.address], btc.address, expandDecimals(200, 18), "332333", toUsd(1200), true, toNormalizedPrice(60000))

    const wallet0 = newWallet()

    expect(await provider.getBalance(wallet0.address)).eq(0)
    expect(await provider.getBalance(router.address)).eq(0)

    await router.connect(user0).decreasePositionAndSwapETH([btc.address, bnb.address], btc.address, 0, toUsd(1200), true, wallet0.address, toNormalizedPrice(60000), "0")

    expect(await provider.getBalance(wallet0.address)).eq("654696002000000000") // 0.654696002
    expect(await provider.getBalance(router.address)).eq(0)
  })
})
