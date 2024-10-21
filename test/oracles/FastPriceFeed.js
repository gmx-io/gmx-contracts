const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, bigNumberify, getBlockTime, increaseTime,
  mineBlock, reportGasUsed, newWallet, getPriceBitArray, getPriceBits } = require("../shared/utilities")
const { toChainlinkPrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")

use(solidity)

function getExpandedPrice(price, precision) {
  return bigNumberify(price).mul(expandDecimals(1, 30)).div(precision)
}

describe("FastPriceFeed", function () {
  const provider = waffle.provider
  const { AddressZero } = ethers.constants
  const depositFee = 50
  const minExecutionFee = 4000
  const updateFee = "1000000000000"

  const [wallet, tokenManager, mintReceiver, user0, user1, user2, user3, signer0, signer1, updater0, updater1] = provider.getWallets()

  let bnbFeedId = ethers.utils.keccak256("0x01")
  let btcFeedId = ethers.utils.keccak256("0x02")
  let ethFeedId = ethers.utils.keccak256("0x03")

  let vaultPriceFeed
  let bnb
  let bnbPriceFeed
  let btc
  let btcPriceFeed
  let eth
  let ethPriceFeed
  let vault
  let timelock
  let usdg
  let router
  let positionUtils
  let fastPriceEvents
  let mockPyth
  let fastPriceFeed

  beforeEach(async () => {
    vaultPriceFeed = await deployContract("VaultPriceFeed", [])

    bnb = await deployContract("Token", [])
    bnbPriceFeed = await deployContract("PriceFeed", [])

    btc = await deployContract("Token", [])
    btcPriceFeed = await deployContract("PriceFeed", [])

    eth = await deployContract("Token", [])
    ethPriceFeed = await deployContract("PriceFeed", [])

    vault = await deployContract("Vault", [])
    timelock = await deployContract("Timelock", [
      wallet.address, // _admin
      5 * 24 * 60 * 60, // _buffer
      tokenManager.address, // _tokenManager
      mintReceiver.address, // _mintReceiver
      user0.address, // _glpManager
      user0.address, // _prevGlpManager
      user1.address, // _rewardRouter
      expandDecimals(1000, 18), // _maxTokenSupply
      10, // marginFeeBasisPoints 0.1%
      500, // maxMarginFeeBasisPoints 5%
    ])

    usdg = await deployContract("USDG", [vault.address])
    router = await deployContract("Router", [vault.address, usdg.address, bnb.address])
    positionUtils = await deployContract("PositionUtils", [])

    fastPriceEvents = await deployContract("FastPriceEvents", [])
    mockPyth = await deployContract("MockPyth", [])
    fastPriceFeed = await deployContract("FastPriceFeed", [
      mockPyth.address, // _pyth
      5 * 60, // _priceDuration
      120 * 60, // _maxPriceUpdateDelay
      2, // _minBlockInterval
      250, // _maxDeviationBasisPoints
      vaultPriceFeed.address, // _vaultPriceFeed
      fastPriceEvents.address, // _fastPriceEvents
      tokenManager.address // _tokenManager
    ])
    await fastPriceFeed.initialize(
      2,
      [signer0.address, signer1.address],
      [updater0.address, updater1.address],
      [bnb.address, btc.address, eth.address],
      [bnbFeedId, btcFeedId, ethFeedId]
    )

    await fastPriceEvents.setIsPriceFeed(fastPriceFeed.address, true)

    await vault.setGov(timelock.address)

    await vaultPriceFeed.setTokenConfig(bnb.address, bnbPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(eth.address, ethPriceFeed.address, 8, false)
  })

  it("inits", async () => {
    expect(await fastPriceFeed.gov()).eq(wallet.address)
    expect(await fastPriceFeed.priceDuration()).eq(5 * 60)
    expect(await fastPriceFeed.maxPriceUpdateDelay()).eq(120 * 60)
    expect(await fastPriceFeed.minBlockInterval()).eq(2)
    expect(await fastPriceFeed.maxDeviationBasisPoints()).eq(250)
    expect(await fastPriceFeed.fastPriceEvents()).eq(fastPriceEvents.address)
    expect(await fastPriceFeed.tokenManager()).eq(tokenManager.address)
    expect(await fastPriceFeed.minAuthorizations()).eq(2)
    expect(await fastPriceFeed.isSigner(wallet.address)).eq(false)
    expect(await fastPriceFeed.isSigner(signer0.address)).eq(true)
    expect(await fastPriceFeed.isSigner(signer1.address)).eq(true)

    expect(await fastPriceFeed.isUpdater(wallet.address)).eq(false)
    expect(await fastPriceFeed.isUpdater(updater0.address)).eq(true)
    expect(await fastPriceFeed.isUpdater(updater1.address)).eq(true)

    await expect(fastPriceFeed.initialize(
      2,
      [signer0.address, signer1.address],
      [updater0.address, updater1.address],
      [bnb.address, btc.address, eth.address],
      [bnbFeedId, btcFeedId, ethFeedId]
    ))
      .to.be.revertedWith("FastPriceFeed: already initialized")
  })

  it("setSigner", async () => {
    await expect(fastPriceFeed.connect(user0).setSigner(user1.address, true))
      .to.be.revertedWith("Governable: forbidden")

    await fastPriceFeed.setGov(user0.address)

    expect(await fastPriceFeed.isSigner(user1.address)).eq(false)
    await fastPriceFeed.connect(user0).setSigner(user1.address, true)
    expect(await fastPriceFeed.isSigner(user1.address)).eq(true)
  })

  it("setUpdater", async () => {
    await expect(fastPriceFeed.connect(user0).setUpdater(user1.address, true))
      .to.be.revertedWith("Governable: forbidden")

    await fastPriceFeed.setGov(user0.address)

    expect(await fastPriceFeed.isUpdater(user1.address)).eq(false)
    await fastPriceFeed.connect(user0).setUpdater(user1.address, true)
    expect(await fastPriceFeed.isUpdater(user1.address)).eq(true)
  })

  it("setPriceDuration", async () => {
    await expect(fastPriceFeed.connect(user0).setPriceDuration(30 * 60))
      .to.be.revertedWith("Governable: forbidden")

    await fastPriceFeed.setGov(user0.address)

    await expect(fastPriceFeed.connect(user0).setPriceDuration(31 * 60))
      .to.be.revertedWith("FastPriceFeed: invalid _priceDuration")

    expect(await fastPriceFeed.priceDuration()).eq(5 * 60)
    await fastPriceFeed.connect(user0).setPriceDuration(30 * 60)
    expect(await fastPriceFeed.priceDuration()).eq(30 * 60)
  })

  it("setMaxPriceUpdateDelay", async () => {
    await expect(fastPriceFeed.connect(user0).setMaxPriceUpdateDelay(50 * 60))
      .to.be.revertedWith("Governable: forbidden")

    await fastPriceFeed.setGov(user0.address)

    expect(await fastPriceFeed.maxPriceUpdateDelay()).eq(2 * 60 * 60)
    await fastPriceFeed.connect(user0).setMaxPriceUpdateDelay(50 * 60)
    expect(await fastPriceFeed.maxPriceUpdateDelay()).eq(50 * 60)
  })

  it("setSpreadBasisPointsIfInactive", async () => {
    await expect(fastPriceFeed.connect(user0).setSpreadBasisPointsIfInactive(30))
      .to.be.revertedWith("Governable: forbidden")

    await fastPriceFeed.setGov(user0.address)

    expect(await fastPriceFeed.spreadBasisPointsIfInactive()).eq(0)
    await fastPriceFeed.connect(user0).setSpreadBasisPointsIfInactive(30)
    expect(await fastPriceFeed.spreadBasisPointsIfInactive()).eq(30)
  })

  it("setSpreadBasisPointsIfChainError", async () => {
    await expect(fastPriceFeed.connect(user0).setSpreadBasisPointsIfChainError(500))
      .to.be.revertedWith("Governable: forbidden")

    await fastPriceFeed.setGov(user0.address)

    expect(await fastPriceFeed.spreadBasisPointsIfChainError()).eq(0)
    await fastPriceFeed.connect(user0).setSpreadBasisPointsIfChainError(500)
    expect(await fastPriceFeed.spreadBasisPointsIfChainError()).eq(500)
  })

  it("setMinBlockInterval", async () => {
    await expect(fastPriceFeed.connect(user0).setMinBlockInterval(10))
      .to.be.revertedWith("Governable: forbidden")

    await fastPriceFeed.setGov(user0.address)

    expect(await fastPriceFeed.minBlockInterval()).eq(2)
    await fastPriceFeed.connect(user0).setMinBlockInterval(10)
    expect(await fastPriceFeed.minBlockInterval()).eq(10)
  })

  it("setIsSpreadEnabled", async () => {
    await expect(fastPriceFeed.connect(user0).setIsSpreadEnabled(true))
      .to.be.revertedWith("Governable: forbidden")

    await fastPriceFeed.setGov(user0.address)

    expect(await fastPriceFeed.isSpreadEnabled()).eq(false)
    expect(await fastPriceFeed.favorFastPrice(AddressZero)).eq(true)
    await fastPriceFeed.connect(user0).setIsSpreadEnabled(true)
    expect(await fastPriceFeed.isSpreadEnabled()).eq(true)
    expect(await fastPriceFeed.favorFastPrice(AddressZero)).eq(false)
  })

  it("setTokenManager", async () => {
    await expect(fastPriceFeed.connect(user0).setTokenManager(user1.address))
      .to.be.revertedWith("FastPriceFeed: forbidden")

    expect(await fastPriceFeed.tokenManager()).eq(tokenManager.address)
    await fastPriceFeed.connect(tokenManager).setTokenManager(user1.address)
    expect(await fastPriceFeed.tokenManager()).eq(user1.address)
  })

  it("setMaxDeviationBasisPoints", async () => {
    await expect(fastPriceFeed.connect(wallet).setMaxDeviationBasisPoints(100))
      .to.be.revertedWith("FastPriceFeed: forbidden")

    expect(await fastPriceFeed.maxDeviationBasisPoints()).eq(250)
    await fastPriceFeed.connect(tokenManager).setMaxDeviationBasisPoints(100)
    expect(await fastPriceFeed.maxDeviationBasisPoints()).eq(100)
  })

  it("setMaxCumulativeDeltaDiffs", async () => {
    await expect(fastPriceFeed.connect(wallet).setMaxCumulativeDeltaDiffs([btc.address, eth.address], [300, 500]))
      .to.be.revertedWith("FastPriceFeed: forbidden")

    expect(await fastPriceFeed.maxCumulativeDeltaDiffs(btc.address)).eq(0)
    expect(await fastPriceFeed.maxCumulativeDeltaDiffs(eth.address)).eq(0)

    await fastPriceFeed.connect(tokenManager).setMaxCumulativeDeltaDiffs([btc.address, eth.address], [300, 500])

    expect(await fastPriceFeed.maxCumulativeDeltaDiffs(btc.address)).eq(300)
    expect(await fastPriceFeed.maxCumulativeDeltaDiffs(eth.address)).eq(500)
  })

  it("setPriceDataInterval", async () => {
    await expect(fastPriceFeed.connect(wallet).setPriceDataInterval(300))
      .to.be.revertedWith("FastPriceFeed: forbidden")

    expect(await fastPriceFeed.priceDataInterval()).eq(0)
    await fastPriceFeed.connect(tokenManager).setPriceDataInterval(300)
    expect(await fastPriceFeed.priceDataInterval()).eq(300)
  })

  it("setMinAuthorizations", async () => {
    await expect(fastPriceFeed.connect(wallet).setMinAuthorizations(3))
      .to.be.revertedWith("FastPriceFeed: forbidden")

    expect(await fastPriceFeed.minAuthorizations()).eq(2)
    await fastPriceFeed.connect(tokenManager).setMinAuthorizations(3)
    expect(await fastPriceFeed.minAuthorizations()).eq(3)
  })

  it("setLastUpdatedAt", async () => {
    await expect(fastPriceFeed.connect(user0).setLastUpdatedAt(700))
      .to.be.revertedWith("Governable: forbidden")

    await fastPriceFeed.setGov(user0.address)

    expect(await fastPriceFeed.lastUpdatedAt()).eq(0)
    await fastPriceFeed.connect(user0).setLastUpdatedAt(700)
    expect(await fastPriceFeed.lastUpdatedAt()).eq(700)
  })

  it("favorFastPrice", async () => {
    await expect(fastPriceFeed.connect(user0).disableFastPrice())
      .to.be.revertedWith("FastPriceFeed: forbidden")
    await expect(fastPriceFeed.connect(user1).disableFastPrice())
      .to.be.revertedWith("FastPriceFeed: forbidden")

    expect(await fastPriceFeed.favorFastPrice(AddressZero)).eq(true)
    expect(await fastPriceFeed.disableFastPriceVotes(signer0.address)).eq(false)
    expect(await fastPriceFeed.disableFastPriceVoteCount()).eq(0)

    await fastPriceFeed.connect(signer0).disableFastPrice()

    expect(await fastPriceFeed.favorFastPrice(AddressZero)).eq(true)
    expect(await fastPriceFeed.disableFastPriceVotes(signer0.address)).eq(true)
    expect(await fastPriceFeed.disableFastPriceVoteCount()).eq(1)

    await expect(fastPriceFeed.connect(signer0).disableFastPrice())
      .to.be.revertedWith("FastPriceFeed: already voted")

    expect(await fastPriceFeed.favorFastPrice(AddressZero)).eq(true)
    expect(await fastPriceFeed.disableFastPriceVotes(signer1.address)).eq(false)
    expect(await fastPriceFeed.disableFastPriceVoteCount()).eq(1)

    await fastPriceFeed.connect(signer1).disableFastPrice()

    expect(await fastPriceFeed.favorFastPrice(AddressZero)).eq(false)
    expect(await fastPriceFeed.disableFastPriceVotes(signer1.address)).eq(true)
    expect(await fastPriceFeed.disableFastPriceVoteCount()).eq(2)

    await expect(fastPriceFeed.connect(user1).enableFastPrice())
      .to.be.revertedWith("FastPriceFeed: forbidden")

    await fastPriceFeed.connect(signer1).enableFastPrice()

    expect(await fastPriceFeed.favorFastPrice(AddressZero)).eq(true)
    expect(await fastPriceFeed.disableFastPriceVotes(signer1.address)).eq(false)
    expect(await fastPriceFeed.disableFastPriceVoteCount()).eq(1)

    await expect(fastPriceFeed.connect(signer1).enableFastPrice())
      .to.be.revertedWith("FastPriceFeed: already enabled")
  })

  it("getPrice", async () => {
    await fastPriceFeed.connect(tokenManager).setPriceDataInterval(1 * 60)
    await fastPriceFeed.connect(tokenManager).setMaxCumulativeDeltaDiffs([bnb.address], [2000000]) // 20%

    await bnbPriceFeed.setLatestAnswer(800)
    await btcPriceFeed.setLatestAnswer(80_000)
    await ethPriceFeed.setLatestAnswer(5000)

    let blockTime = await getBlockTime(provider)

    expect(await fastPriceFeed.getPrice(bnb.address, 800, true)).eq(800)

    await mockPyth.setPrice(bnbFeedId, 801, -30, blockTime)
    await mockPyth.setPrice(btcFeedId, 80_000, -30, blockTime)
    await mockPyth.setPrice(ethFeedId, 5000, -30, blockTime)

    await fastPriceFeed.connect(updater0).setPricesWithData(["0x"], { value: updateFee })
    expect(await fastPriceFeed.getPrice(bnb.address, 800, true)).eq(801)

    await mineBlock(provider)
    await mockPyth.setPrice(bnbFeedId, 900, -30, blockTime)
    await fastPriceFeed.connect(updater0).setPricesWithData(["0x"], { value: updateFee })
    expect(await fastPriceFeed.getPrice(bnb.address, 800, true)).eq(900)
    expect(await fastPriceFeed.getPrice(bnb.address, 800, false)).eq(800)

    await mineBlock(provider)
    await mockPyth.setPrice(bnbFeedId, 700, -30, blockTime)
    await fastPriceFeed.connect(updater0).setPricesWithData(["0x"], { value: updateFee })
    expect(await fastPriceFeed.getPrice(bnb.address, 800, true)).eq(800)
    expect(await fastPriceFeed.getPrice(bnb.address, 800, false)).eq(700)

    await increaseTime(provider, 310)
    await mineBlock(provider)

    expect(await fastPriceFeed.getPrice(bnb.address, 800, true)).eq(800)
    expect(await fastPriceFeed.getPrice(bnb.address, 800, false)).eq(800)

    expect(await fastPriceFeed.spreadBasisPointsIfInactive()).eq(0)
    await fastPriceFeed.setSpreadBasisPointsIfInactive(50)

    expect(await fastPriceFeed.getPrice(bnb.address, 800, true)).eq(804)
    expect(await fastPriceFeed.getPrice(bnb.address, 800, false)).eq(796)

    blockTime = await getBlockTime(provider)
    await mockPyth.setPrice(bnbFeedId, 790, -30, blockTime)
    await mockPyth.setPrice(btcFeedId, 80_000, -30, blockTime)
    await mockPyth.setPrice(ethFeedId, 5000, -30, blockTime)
    await fastPriceFeed.connect(updater1).setPricesWithData(["0x"], { value: updateFee })

    await fastPriceFeed.setIsSpreadEnabled(false)

    expect(await fastPriceFeed.getPrice(bnb.address, 800, true)).eq(790)
    expect(await fastPriceFeed.getPrice(bnb.address, 800, false)).eq(790)

    await fastPriceFeed.setIsSpreadEnabled(true)

    expect(await fastPriceFeed.getPrice(bnb.address, 800, true)).eq(800)
    expect(await fastPriceFeed.getPrice(bnb.address, 800, false)).eq(790)

    await fastPriceFeed.setIsSpreadEnabled(false)

    expect((await fastPriceFeed.getPriceData(bnb.address))[3]).eq(1285714)
    expect(await fastPriceFeed.getPrice(bnb.address, 800, true)).eq(790)
    expect(await fastPriceFeed.getPrice(bnb.address, 800, false)).eq(790)

    await mockPyth.setPrice(bnbFeedId, 700, -30, blockTime)
    await fastPriceFeed.connect(updater1).setPricesWithData(["0x"], { value: updateFee })

    expect((await fastPriceFeed.getPriceData(bnb.address))[3]).eq(2424954)
    expect(await fastPriceFeed.getPrice(bnb.address, 800, true)).eq(800)
    expect(await fastPriceFeed.getPrice(bnb.address, 800, false)).eq(700)
  })
})
