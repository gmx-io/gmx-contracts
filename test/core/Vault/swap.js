const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed } = require("../../shared/utilities")
const { toChainlinkPrice } = require("../../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../../shared/units")
const { initVault, getBnbConfig, getBtcConfig, getEthConfig, getDaiConfig } = require("./helpers")

use(solidity)

describe("Vault.swap", function () {
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
  let eth
  let ethPriceFeed
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

    eth = await deployContract("Token", [])
    ethPriceFeed = await deployContract("PriceFeed", [])

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
    await vaultPriceFeed.setTokenConfig(eth.address, ethPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(dai.address, daiPriceFeed.address, 8, false)

    glp = await deployContract("GLP", [])
    glpManager = await deployContract("GlpManager", [vault.address, usdg.address, glp.address, ethers.constants.AddressZero, 24 * 60 * 60])
  })

  it("swap", async () => {
    await expect(vault.connect(user1).swap(bnb.address, btc.address, user2.address))
      .to.be.revertedWith("Vault: _tokenIn not whitelisted")

    await vault.setIsSwapEnabled(false)

    await expect(vault.connect(user1).swap(bnb.address, btc.address, user2.address))
      .to.be.revertedWith("Vault: swaps not enabled")

    await vault.setIsSwapEnabled(true)

    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(300))
    await vault.setTokenConfig(...getBnbConfig(bnb, bnbPriceFeed))

    await expect(vault.connect(user1).swap(bnb.address, btc.address, user2.address))
      .to.be.revertedWith("Vault: _tokenOut not whitelisted")

    await expect(vault.connect(user1).swap(bnb.address, bnb.address, user2.address))
      .to.be.revertedWith("Vault: invalid tokens")

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))
    await vault.setTokenConfig(...getBtcConfig(btc, btcPriceFeed))

    await bnb.mint(user0.address, expandDecimals(200, 18))
    await btc.mint(user0.address, expandDecimals(1, 8))

    expect(await glpManager.getAumInUsdg(false)).eq(0)

    await bnb.connect(user0).transfer(vault.address, expandDecimals(200, 18))
    await vault.connect(user0).buyUSDG(bnb.address, user0.address)

    expect(await glpManager.getAumInUsdg(false)).eq(expandDecimals(59820, 18)) // 60,000 * 99.7%

    await btc.connect(user0).transfer(vault.address, expandDecimals(1, 8))
    await vault.connect(user0).buyUSDG(btc.address, user0.address)

    expect(await glpManager.getAumInUsdg(false)).eq(expandDecimals(119640, 18)) // 59,820 + (60,000 * 99.7%)

    expect(await usdg.balanceOf(user0.address)).eq(expandDecimals(120000, 18).sub(expandDecimals(360, 18))) // 120,000 * 0.3% => 360

    expect(await vault.feeReserves(bnb.address)).eq("600000000000000000") // 200 * 0.3% => 0.6
    expect(await vault.usdgAmounts(bnb.address)).eq(expandDecimals(200 * 300, 18).sub(expandDecimals(180, 18))) // 60,000 * 0.3% => 180
    expect(await vault.poolAmounts(bnb.address)).eq(expandDecimals(200, 18).sub("600000000000000000"))

    expect(await vault.feeReserves(btc.address)).eq("300000") // 1 * 0.3% => 0.003
    expect(await vault.usdgAmounts(btc.address)).eq(expandDecimals(200 * 300, 18).sub(expandDecimals(180, 18)))
    expect(await vault.poolAmounts(btc.address)).eq(expandDecimals(1, 8).sub("300000"))

    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(400))
    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(600))
    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(500))

    expect(await glpManager.getAumInUsdg(false)).eq(expandDecimals(139580, 18)) // 59,820 / 300 * 400 + 59820

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(90000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(100000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(80000))

    expect(await glpManager.getAumInUsdg(false)).eq(expandDecimals(159520, 18)) // 59,820 / 300 * 400 + 59820 / 60000 * 80000

    await bnb.mint(user1.address, expandDecimals(100, 18))
    await bnb.connect(user1).transfer(vault.address, expandDecimals(100, 18))

    expect(await btc.balanceOf(user1.address)).eq(0)
    expect(await btc.balanceOf(user2.address)).eq(0)
    const tx = await vault.connect(user1).swap(bnb.address, btc.address, user2.address)
    await reportGasUsed(provider, tx, "swap gas used")

    expect(await glpManager.getAumInUsdg(false)).eq(expandDecimals(167520, 18)) // 159520 + (100 * 400) - 32000

    expect(await btc.balanceOf(user1.address)).eq(0)
    expect(await btc.balanceOf(user2.address)).eq(expandDecimals(4, 7).sub("120000")) // 0.8 - 0.0012

    expect(await vault.feeReserves(bnb.address)).eq("600000000000000000") // 200 * 0.3% => 0.6
    expect(await vault.usdgAmounts(bnb.address)).eq(expandDecimals(100 * 400, 18).add(expandDecimals(200 * 300, 18)).sub(expandDecimals(180, 18)))
    expect(await vault.poolAmounts(bnb.address)).eq(expandDecimals(100, 18).add(expandDecimals(200, 18)).sub("600000000000000000"))

    expect(await vault.feeReserves(btc.address)).eq("420000") // 1 * 0.3% => 0.003, 0.4 * 0.3% => 0.0012
    expect(await vault.usdgAmounts(btc.address)).eq(expandDecimals(200 * 300, 18).sub(expandDecimals(180, 18)).sub(expandDecimals(100 * 400, 18)))
    expect(await vault.poolAmounts(btc.address)).eq(expandDecimals(1, 8).sub("300000").sub(expandDecimals(4, 7))) // 59700000, 0.597 BTC, 0.597 * 100,000 => 59700

    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(400))
    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(500))
    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(450))

    expect(await bnb.balanceOf(user0.address)).eq(0)
    expect(await bnb.balanceOf(user3.address)).eq(0)
    await usdg.connect(user0).transfer(vault.address, expandDecimals(50000, 18))
    await vault.sellUSDG(bnb.address, user3.address)
    expect(await bnb.balanceOf(user0.address)).eq(0)
    expect(await bnb.balanceOf(user3.address)).eq("99700000000000000000") // 99.7, 50000 / 500 * 99.7%

    await usdg.connect(user0).transfer(vault.address, expandDecimals(50000, 18))
    await vault.sellUSDG(btc.address, user3.address)

    await usdg.connect(user0).transfer(vault.address, expandDecimals(10000, 18))
    await expect(vault.sellUSDG(btc.address, user3.address))
      .to.be.revertedWith("Vault: poolAmount exceeded")
  })

  it("caps max USDG amount", async () => {
    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(600))
    await ethPriceFeed.setLatestAnswer(toChainlinkPrice(3000))

    const bnbConfig = getBnbConfig(bnb, bnbPriceFeed)
    const ethConfig = getBnbConfig(eth, ethPriceFeed)

    bnbConfig[4] = expandDecimals(299000, 18)
    await vault.setTokenConfig(...bnbConfig)

    ethConfig[4] = expandDecimals(30000, 18)
    await vault.setTokenConfig(...ethConfig)

    await bnb.mint(user0.address, expandDecimals(499, 18))
    await bnb.connect(user0).transfer(vault.address, expandDecimals(499, 18))
    await vault.connect(user0).buyUSDG(bnb.address, user0.address)

    await eth.mint(user0.address, expandDecimals(10, 18))
    await eth.connect(user0).transfer(vault.address, expandDecimals(10, 18))
    await vault.connect(user0).buyUSDG(eth.address, user1.address)

    await bnb.mint(user0.address, expandDecimals(1, 18))
    await bnb.connect(user0).transfer(vault.address, expandDecimals(1, 18))

    await expect(vault.connect(user0).buyUSDG(bnb.address, user0.address))
      .to.be.revertedWith("Vault: max USDG exceeded")

    bnbConfig[4] = expandDecimals(299100, 18)
    await vault.setTokenConfig(...bnbConfig)

    await vault.connect(user0).buyUSDG(bnb.address, user0.address)

    await bnb.mint(user0.address, expandDecimals(1, 18))
    await bnb.connect(user0).transfer(vault.address, expandDecimals(1, 18))
    await expect(vault.connect(user0).swap(bnb.address, eth.address, user1.address))
      .to.be.revertedWith("Vault: max USDG exceeded")

    bnbConfig[4] = expandDecimals(299700, 18)
    await vault.setTokenConfig(...bnbConfig)
    await vault.connect(user0).swap(bnb.address, eth.address, user1.address)
  })

  it("does not cap max USDG debt", async () => {
    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(600))
    await vault.setTokenConfig(...getBnbConfig(bnb, bnbPriceFeed))

    await ethPriceFeed.setLatestAnswer(toChainlinkPrice(3000))
    await vault.setTokenConfig(...getEthConfig(eth, ethPriceFeed))

    await bnb.mint(user0.address, expandDecimals(100, 18))
    await bnb.connect(user0).transfer(vault.address, expandDecimals(100, 18))
    await vault.connect(user0).buyUSDG(bnb.address, user0.address)

    await eth.mint(user0.address, expandDecimals(10, 18))

    expect(await eth.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await bnb.balanceOf(user1.address)).eq(0)

    await eth.connect(user0).transfer(vault.address, expandDecimals(10, 18))
    await vault.connect(user0).swap(eth.address, bnb.address, user1.address)

    expect(await eth.balanceOf(user0.address)).eq(0)
    expect(await bnb.balanceOf(user1.address)).eq("49850000000000000000")

    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(300))
    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(300))
    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(300))

    await eth.mint(user0.address, expandDecimals(1, 18))
    await eth.connect(user0).transfer(vault.address, expandDecimals(1, 18))
    await vault.connect(user0).swap(eth.address, bnb.address, user1.address)
  })

  it("ensures poolAmount >= buffer", async () => {
    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(600))
    await vault.setTokenConfig(...getBnbConfig(bnb, bnbPriceFeed))

    await ethPriceFeed.setLatestAnswer(toChainlinkPrice(3000))
    await vault.setTokenConfig(...getEthConfig(eth, ethPriceFeed))

    await bnb.mint(user0.address, expandDecimals(100, 18))
    await bnb.connect(user0).transfer(vault.address, expandDecimals(100, 18))
    await vault.connect(user0).buyUSDG(bnb.address, user0.address)

    await vault.setBufferAmount(bnb.address, "94700000000000000000") // 94.7

    expect(await vault.poolAmounts(bnb.address)).eq("99700000000000000000") // 99.7
    expect(await vault.poolAmounts(eth.address)).eq(0)
    expect(await bnb.balanceOf(user1.address)).eq(0)
    expect(await eth.balanceOf(user1.address)).eq(0)

    await eth.mint(user0.address, expandDecimals(1, 18))
    await eth.connect(user0).transfer(vault.address, expandDecimals(1, 18))
    await vault.connect(user0).swap(eth.address, bnb.address, user1.address)

    expect(await vault.poolAmounts(bnb.address)).eq("94700000000000000000") // 94.7
    expect(await vault.poolAmounts(eth.address)).eq(expandDecimals(1, 18))
    expect(await bnb.balanceOf(user1.address)).eq("4985000000000000000") // 4.985
    expect(await eth.balanceOf(user1.address)).eq(0)

    await eth.mint(user0.address, expandDecimals(1, 18))
    await eth.connect(user0).transfer(vault.address, expandDecimals(1, 18))
    await expect(vault.connect(user0).swap(eth.address, bnb.address, user1.address))
      .to.be.revertedWith("Vault: poolAmount < buffer")
  })
})
