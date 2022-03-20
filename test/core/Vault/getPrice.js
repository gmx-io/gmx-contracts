const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed, newWallet } = require("../../shared/utilities")
const { toChainlinkPrice } = require("../../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../../shared/units")
const { initVault, getDaiConfig, getBnbConfig, getBtcConfig } = require("./helpers")

use(solidity)

describe("Vault.getPrice", function () {
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
  let busd
  let busdPriceFeed
  let usdc
  let usdcPriceFeed
  let distributor0
  let yieldTracker0

  beforeEach(async () => {
    bnb = await deployContract("Token", [])
    bnbPriceFeed = await deployContract("PriceFeed", [])

    btc = await deployContract("Token", [])
    btcPriceFeed = await deployContract("PriceFeed", [])

    eth = await deployContract("Token", [])
    ethPriceFeed = await deployContract("PriceFeed", [])

    dai = await deployContract("Token", [])
    daiPriceFeed = await deployContract("PriceFeed", [])

    usdc = await deployContract("Token", [])
    usdcPriceFeed = await deployContract("PriceFeed", [])

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

    await vaultPriceFeed.setTokenConfig(bnb.address, bnbPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(dai.address, daiPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(usdc.address, usdcPriceFeed.address, 8, true)
  })

  it("getPrice", async () => {
    await daiPriceFeed.setLatestAnswer(toChainlinkPrice(1))
    await vault.setTokenConfig(...getDaiConfig(dai, daiPriceFeed))
    expect(await vaultPriceFeed.getPrice(dai.address, true, true, true)).eq(expandDecimals(1, 30))

    await daiPriceFeed.setLatestAnswer(toChainlinkPrice(1.1))
    expect(await vaultPriceFeed.getPrice(dai.address, true, true, true)).eq(expandDecimals(11, 29))

    await usdcPriceFeed.setLatestAnswer(toChainlinkPrice(1))
    await vault.setTokenConfig(
      usdc.address, // _token
      18, // _tokenDecimals
      10000, // _tokenWeight
      75, // _minProfitBps,
      0, // _maxUsdgAmount
      false, // _isStable
      true // _isShortable
    )

    expect(await vaultPriceFeed.getPrice(usdc.address, true, true, true)).eq(expandDecimals(1, 30))
    await usdcPriceFeed.setLatestAnswer(toChainlinkPrice(1.1))
    expect(await vaultPriceFeed.getPrice(usdc.address, true, true, true)).eq(expandDecimals(11, 29))

    await vaultPriceFeed.setMaxStrictPriceDeviation(expandDecimals(1, 29))
    expect(await vaultPriceFeed.getPrice(usdc.address, true, true, true)).eq(expandDecimals(1, 30))

    await usdcPriceFeed.setLatestAnswer(toChainlinkPrice(1.11))
    expect(await vaultPriceFeed.getPrice(usdc.address, true, true, true)).eq(expandDecimals(111, 28))
    expect(await vaultPriceFeed.getPrice(usdc.address, false, true, true)).eq(expandDecimals(1, 30))

    await usdcPriceFeed.setLatestAnswer(toChainlinkPrice(0.9))
    expect(await vaultPriceFeed.getPrice(usdc.address, true, true, true)).eq(expandDecimals(111, 28))
    expect(await vaultPriceFeed.getPrice(usdc.address, false, true, true)).eq(expandDecimals(1, 30))

    await vaultPriceFeed.setSpreadBasisPoints(usdc.address, 20)
    expect(await vaultPriceFeed.getPrice(usdc.address, false, true, true)).eq(expandDecimals(1, 30))

    await vaultPriceFeed.setSpreadBasisPoints(usdc.address, 0)
    await usdcPriceFeed.setLatestAnswer(toChainlinkPrice(0.89))
    await usdcPriceFeed.setLatestAnswer(toChainlinkPrice(0.89))
    expect(await vaultPriceFeed.getPrice(usdc.address, true, true, true)).eq(expandDecimals(1, 30))
    expect(await vaultPriceFeed.getPrice(usdc.address, false, true, true)).eq(expandDecimals(89, 28))

    await vaultPriceFeed.setSpreadBasisPoints(usdc.address, 20)
    expect(await vaultPriceFeed.getPrice(usdc.address, false, true, true)).eq(expandDecimals(89, 28))

    await vaultPriceFeed.setUseV2Pricing(true)
    expect(await vaultPriceFeed.getPrice(usdc.address, false, true, true)).eq(expandDecimals(89, 28))

    await vaultPriceFeed.setSpreadBasisPoints(btc.address, 0)
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    expect(await vaultPriceFeed.getPrice(btc.address, true, true, true)).eq(expandDecimals(40000, 30))

    await vaultPriceFeed.setSpreadBasisPoints(btc.address, 20)
    expect(await vaultPriceFeed.getPrice(btc.address, false, true, true)).eq(expandDecimals(39920, 30))
  })

  it("includes AMM price", async () => {
    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(600))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(80000))
    await busdPriceFeed.setLatestAnswer(toChainlinkPrice(1))

    await vault.setTokenConfig(...getBnbConfig(bnb, bnbPriceFeed))
    await vault.setTokenConfig(...getBtcConfig(btc, btcPriceFeed))

    const bnbBusd = await deployContract("PancakePair", [])
    await bnbBusd.setReserves(expandDecimals(1000, 18), expandDecimals(300 * 1000, 18))

    const ethBnb = await deployContract("PancakePair", [])
    await ethBnb.setReserves(expandDecimals(800, 18), expandDecimals(100, 18))

    const btcBnb = await deployContract("PancakePair", [])
    await btcBnb.setReserves(expandDecimals(10, 18), expandDecimals(2000, 18))

    await vaultPriceFeed.setTokens(btc.address, eth.address, bnb.address)
    await vaultPriceFeed.setPairs(bnbBusd.address, ethBnb.address, btcBnb.address)

    await vaultPriceFeed.setIsAmmEnabled(false)

    expect(await vaultPriceFeed.getPrice(bnb.address, false, true, true)).eq(toNormalizedPrice(600))
    expect(await vaultPriceFeed.getPrice(btc.address, false, true, true)).eq(toNormalizedPrice(80000))

    await vaultPriceFeed.setIsAmmEnabled(true)

    expect(await vaultPriceFeed.getPrice(bnb.address, false, true, true)).eq(toNormalizedPrice(300))
    expect(await vaultPriceFeed.getPrice(btc.address, false, true, true)).eq(toNormalizedPrice(60000))

    await vaultPriceFeed.setIsAmmEnabled(false)

    expect(await vaultPriceFeed.getPrice(bnb.address, false, true, true)).eq(toNormalizedPrice(600))
    expect(await vaultPriceFeed.getPrice(btc.address, false, true, true)).eq(toNormalizedPrice(80000))

    await vaultPriceFeed.setIsAmmEnabled(true)

    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(200))
    expect(await vaultPriceFeed.getPrice(bnb.address, false, true, true)).eq(toNormalizedPrice(200))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(50000))
    expect(await vaultPriceFeed.getPrice(btc.address, false, true, true)).eq(toNormalizedPrice(50000))

    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(250))
    expect(await vaultPriceFeed.getPrice(bnb.address, false, true, true)).eq(toNormalizedPrice(200))

    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(280))
    expect(await vaultPriceFeed.getPrice(bnb.address, true, true, true)).eq(toNormalizedPrice(300))

    await vaultPriceFeed.setSpreadBasisPoints(bnb.address, 20)
    expect(await vaultPriceFeed.getPrice(bnb.address, false, true, true)).eq(toNormalizedPrice(199.6))
    expect(await vaultPriceFeed.getPrice(bnb.address, true, true, true)).eq(toNormalizedPrice(300.6))

    await vaultPriceFeed.setUseV2Pricing(true)
    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(301))
    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(302))
    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(303))

    expect(await vaultPriceFeed.getPrice(bnb.address, false, true, true)).eq(toNormalizedPrice(299.4))
    expect(await vaultPriceFeed.getPrice(bnb.address, true, true, true)).eq(toNormalizedPrice(303.606))

    await vaultPriceFeed.setSpreadThresholdBasisPoints(90)

    expect(await vaultPriceFeed.getPrice(bnb.address, false, true, true)).eq(toNormalizedPrice(299.4))
    expect(await vaultPriceFeed.getPrice(bnb.address, true, true, true)).eq(toNormalizedPrice(303.606))

    await vaultPriceFeed.setSpreadThresholdBasisPoints(100)

    expect(await vaultPriceFeed.getPrice(bnb.address, false, true, true)).eq(toNormalizedPrice(299.4))
    expect(await vaultPriceFeed.getPrice(bnb.address, true, true, true)).eq(toNormalizedPrice(300.6))

    await vaultPriceFeed.setFavorPrimaryPrice(true)

    expect(await vaultPriceFeed.getPrice(bnb.address, false, true, true)).eq(toNormalizedPrice(300.398))
    expect(await vaultPriceFeed.getPrice(bnb.address, true, true, true)).eq(toNormalizedPrice(303.606))
  })
})
