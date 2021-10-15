const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed } = require("../../shared/utilities")
const { toChainlinkPrice } = require("../../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../../shared/units")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig, validateVaultBalance } = require("./helpers")

use(solidity)

describe("Vault.getFeeBasisPoints", function () {
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

    await vault.setFees(
      50, // _taxBasisPoints
      10, // _stableTaxBasisPoints
      20, // _mintBurnFeeBasisPoints
      30, // _swapFeeBasisPoints
      4, // _stableSwapFeeBasisPoints
      10, // _marginFeeBasisPoints
      toUsd(5), // _liquidationFeeUsd
      0, // _minProfitTime
      true // _hasDynamicFees
    )
  })

  it("getFeeBasisPoints", async () => {
    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(300))
    await vault.setTokenConfig(...getBnbConfig(bnb, bnbPriceFeed))
    expect(await vault.getTargetUsdgAmount(bnb.address)).eq(0)

    await bnb.mint(vault.address, 100)
    await vault.connect(user0).buyUSDG(bnb.address, wallet.address)

    expect(await vault.usdgAmounts(bnb.address)).eq(29700)
    expect(await vault.getTargetUsdgAmount(bnb.address)).eq(29700)

    // usdgAmount(bnb) is 29700, targetAmount(bnb) is 29700
    expect(await vault.getFeeBasisPoints(bnb.address, 1000, 100, 50, true)).eq(100)
    expect(await vault.getFeeBasisPoints(bnb.address, 5000, 100, 50, true)).eq(104)
    expect(await vault.getFeeBasisPoints(bnb.address, 1000, 100, 50, false)).eq(100)
    expect(await vault.getFeeBasisPoints(bnb.address, 5000, 100, 50, false)).eq(104)

    expect(await vault.getFeeBasisPoints(bnb.address, 1000, 50, 100, true)).eq(51)
    expect(await vault.getFeeBasisPoints(bnb.address, 5000, 50, 100, true)).eq(58)
    expect(await vault.getFeeBasisPoints(bnb.address, 1000, 50, 100, false)).eq(51)
    expect(await vault.getFeeBasisPoints(bnb.address, 5000, 50, 100, false)).eq(58)

    await daiPriceFeed.setLatestAnswer(toChainlinkPrice(1))
    await vault.setTokenConfig(...getDaiConfig(dai, daiPriceFeed))

    expect(await vault.getTargetUsdgAmount(bnb.address)).eq(14850)
    expect(await vault.getTargetUsdgAmount(dai.address)).eq(14850)

    // usdgAmount(bnb) is 29700, targetAmount(bnb) is 14850
    // incrementing bnb has an increased fee, while reducing bnb has a decreased fee
    expect(await vault.getFeeBasisPoints(bnb.address, 1000, 100, 50, true)).eq(150)
    expect(await vault.getFeeBasisPoints(bnb.address, 5000, 100, 50, true)).eq(150)
    expect(await vault.getFeeBasisPoints(bnb.address, 10000, 100, 50, true)).eq(150)
    expect(await vault.getFeeBasisPoints(bnb.address, 20000, 100, 50, true)).eq(150)
    expect(await vault.getFeeBasisPoints(bnb.address, 1000, 100, 50, false)).eq(50)
    expect(await vault.getFeeBasisPoints(bnb.address, 5000, 100, 50, false)).eq(50)
    expect(await vault.getFeeBasisPoints(bnb.address, 10000, 100, 50, false)).eq(50)
    expect(await vault.getFeeBasisPoints(bnb.address, 20000, 100, 50, false)).eq(50)
    expect(await vault.getFeeBasisPoints(bnb.address, 25000, 100, 50, false)).eq(50)
    expect(await vault.getFeeBasisPoints(bnb.address, 100000, 100, 50, false)).eq(150)

    await dai.mint(vault.address, 20000)
    await vault.connect(user0).buyUSDG(dai.address, wallet.address)

    expect(await vault.getTargetUsdgAmount(bnb.address)).eq(24850)
    expect(await vault.getTargetUsdgAmount(dai.address)).eq(24850)

    const bnbConfig = getBnbConfig(bnb, bnbPriceFeed)
    bnbConfig[2] = 30000
    await vault.setTokenConfig(...bnbConfig)

    expect(await vault.getTargetUsdgAmount(bnb.address)).eq(37275)
    expect(await vault.getTargetUsdgAmount(dai.address)).eq(12425)

    expect(await vault.usdgAmounts(bnb.address)).eq(29700)

    // usdgAmount(bnb) is 29700, targetAmount(bnb) is 37270
    // incrementing bnb has a decreased fee, while reducing bnb has an increased fee
    expect(await vault.getFeeBasisPoints(bnb.address, 1000, 100, 50, true)).eq(90)
    expect(await vault.getFeeBasisPoints(bnb.address, 5000, 100, 50, true)).eq(90)
    expect(await vault.getFeeBasisPoints(bnb.address, 10000, 100, 50, true)).eq(90)
    expect(await vault.getFeeBasisPoints(bnb.address, 1000, 100, 50, false)).eq(110)
    expect(await vault.getFeeBasisPoints(bnb.address, 5000, 100, 50, false)).eq(113)
    expect(await vault.getFeeBasisPoints(bnb.address, 10000, 100, 50, false)).eq(116)

    bnbConfig[2] = 5000
    await vault.setTokenConfig(...bnbConfig)

    await bnb.mint(vault.address, 200)
    await vault.connect(user0).buyUSDG(bnb.address, wallet.address)

    expect(await vault.usdgAmounts(bnb.address)).eq(89100)
    expect(await vault.getTargetUsdgAmount(bnb.address)).eq(36366)
    expect(await vault.getTargetUsdgAmount(dai.address)).eq(72733)

    // usdgAmount(bnb) is 88800, targetAmount(bnb) is 36266
    // incrementing bnb has an increased fee, while reducing bnb has a decreased fee
    expect(await vault.getFeeBasisPoints(bnb.address, 1000, 100, 50, true)).eq(150)
    expect(await vault.getFeeBasisPoints(bnb.address, 5000, 100, 50, true)).eq(150)
    expect(await vault.getFeeBasisPoints(bnb.address, 10000, 100, 50, true)).eq(150)
    expect(await vault.getFeeBasisPoints(bnb.address, 1000, 100, 50, false)).eq(28)
    expect(await vault.getFeeBasisPoints(bnb.address, 5000, 100, 50, false)).eq(28)
    expect(await vault.getFeeBasisPoints(bnb.address, 20000, 100, 50, false)).eq(28)
    expect(await vault.getFeeBasisPoints(bnb.address, 50000, 100, 50, false)).eq(28)
    expect(await vault.getFeeBasisPoints(bnb.address, 80000, 100, 50, false)).eq(28)

    expect(await vault.getFeeBasisPoints(bnb.address, 1000, 50, 100, true)).eq(150)
    expect(await vault.getFeeBasisPoints(bnb.address, 5000, 50, 100, true)).eq(150)
    expect(await vault.getFeeBasisPoints(bnb.address, 10000, 50, 100, true)).eq(150)
    expect(await vault.getFeeBasisPoints(bnb.address, 1000, 50, 100, false)).eq(0)
    expect(await vault.getFeeBasisPoints(bnb.address, 5000, 50, 100, false)).eq(0)
    expect(await vault.getFeeBasisPoints(bnb.address, 20000, 50, 100, false)).eq(0)
    expect(await vault.getFeeBasisPoints(bnb.address, 50000, 50, 100, false)).eq(0)
  })
})
