const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed } = require("../shared/utilities")
const { toChainlinkPrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")
const { initVault } = require("../core/Vault/helpers")

use(solidity)

const { AddressZero } = ethers.constants

describe("PriceFeedTimelock", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3, rewardManager, tokenManager, mintReceiver, positionRouter] = provider.getWallets()
  let vault
  let glpManager
  let glp
  let vaultUtils
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
  let timelock
  let vaultTimelock
  let fastPriceEvents
  let fastPriceFeed

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

    glp = await deployContract("GLP", [])
    glpManager = await deployContract("GlpManager", [vault.address, usdg.address, glp.address, ethers.constants.AddressZero, 24 * 60 * 60])

    const initVaultResult = await initVault(vault, router, usdg, vaultPriceFeed)
    vaultUtils = initVaultResult.vaultUtils

    distributor0 = await deployContract("TimeDistributor", [])
    yieldTracker0 = await deployContract("YieldTracker", [usdg.address])

    await yieldTracker0.setDistributor(distributor0.address)
    await distributor0.setDistribution([yieldTracker0.address], [1000], [bnb.address])

    await bnb.mint(distributor0.address, 5000)
    await usdg.setYieldTrackers([yieldTracker0.address])

    await vault.setPriceFeed(user3.address)

    timelock = await deployContract("PriceFeedTimelock", [
      wallet.address, // admin
      5 * 24 * 60 * 60, // buffer
      tokenManager.address // tokenManager
    ])

    vaultTimelock = await deployContract("Timelock", [
      wallet.address, // admin
      5 * 24 * 60 * 60, // buffer
      tokenManager.address, // tokenManager
      mintReceiver.address, // mintReceiver
      glpManager.address, // glpManager
      user0.address, // rewardRouter
      expandDecimals(1000, 18), // maxTokenSupply
      50, // marginFeeBasisPoints 0.5%
      500, // maxMarginFeeBasisPoints 5%
    ])
    await vault.setGov(vaultTimelock.address)

    await vaultPriceFeed.setTokenConfig(bnb.address, bnbPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(dai.address, daiPriceFeed.address, 8, false)

    await vaultPriceFeed.setGov(timelock.address)
    await router.setGov(timelock.address)

    fastPriceEvents = await deployContract("FastPriceEvents", [])
    fastPriceFeed = await deployContract("FastPriceFeed", [
      5 * 60, // _priceDuration
      60 * 60, // _maxPriceUpdateDelay
      2, // _minBlockInterval
      250, // _allowedDeviationBasisPoints
      fastPriceEvents.address, // _fastPriceEvents
      tokenManager.address // _tokenManager
    ])

    await fastPriceFeed.setGov(timelock.address)
  })

  it("inits", async () => {
    expect(await timelock.admin()).eq(wallet.address)
    expect(await timelock.buffer()).eq(5 * 24 * 60 * 60)
    expect(await timelock.tokenManager()).eq(tokenManager.address)

    await expect(deployContract("PriceFeedTimelock", [
      wallet.address, // admin
      5 * 24 * 60 * 60 + 1, // buffer
      tokenManager.address // tokenManager
    ])).to.be.revertedWith("Timelock: invalid _buffer")
  })

  it("setAdmin", async () => {
    await expect(timelock.setAdmin(user1.address))
      .to.be.revertedWith("Timelock: forbidden")

    expect(await timelock.admin()).eq(wallet.address)
    await timelock.connect(tokenManager).setAdmin(user1.address)
    expect(await timelock.admin()).eq(user1.address)
  })

  it("setExternalAdmin", async () => {
    const distributor = await deployContract("RewardDistributor", [user1.address, user2.address])
    await distributor.setGov(timelock.address)
    await expect(timelock.connect(user0).setExternalAdmin(distributor.address, user3.address))
      .to.be.revertedWith("Timelock: forbidden")

    expect(await distributor.admin()).eq(wallet.address)
    await timelock.connect(wallet).setExternalAdmin(distributor.address, user3.address)
    expect(await distributor.admin()).eq(user3.address)

    await expect(timelock.connect(wallet).setExternalAdmin(timelock.address, user3.address))
      .to.be.revertedWith("Timelock: invalid _target")
  })

  it("setContractHandler", async() => {
    await expect(timelock.connect(user0).setContractHandler(user1.address, true))
      .to.be.revertedWith("Timelock: forbidden")

    expect(await timelock.isHandler(user1.address)).eq(false)
    await timelock.connect(wallet).setContractHandler(user1.address, true)
    expect(await timelock.isHandler(user1.address)).eq(true)
  })

  it("setKeeper", async() => {
    await expect(timelock.connect(user0).setKeeper(user1.address, true))
      .to.be.revertedWith("Timelock: forbidden")

    expect(await timelock.isKeeper(user1.address)).eq(false)
    await timelock.connect(wallet).setKeeper(user1.address, true)
    expect(await timelock.isKeeper(user1.address)).eq(true)
  })

  it("setBuffer", async () => {
    const timelock0 = await deployContract("Timelock", [
      user1.address, // _admin
      3 * 24 * 60 * 60, // _buffer
      tokenManager.address, // _tokenManager
      mintReceiver.address, // _mintReceiver
      user0.address, // _glpManager
      user1.address, // _rewardRouter
      1000, // _maxTokenSupply
      10, // marginFeeBasisPoints
      100 // maxMarginFeeBasisPoints
    ])
    await expect(timelock0.connect(user0).setBuffer(3 * 24 * 60 * 60 - 10))
      .to.be.revertedWith("Timelock: forbidden")

    await expect(timelock0.connect(user1).setBuffer(5 * 24 * 60 * 60 + 10))
      .to.be.revertedWith("Timelock: invalid _buffer")

    await expect(timelock0.connect(user1).setBuffer(3 * 24 * 60 * 60 - 10))
      .to.be.revertedWith("Timelock: buffer cannot be decreased")

    expect(await timelock0.buffer()).eq(3 * 24 * 60 * 60)
    await timelock0.connect(user1).setBuffer(3 * 24 * 60 * 60 + 10)
    expect(await timelock0.buffer()).eq(3 * 24 * 60 * 60 + 10)
  })

  it("setIsAmmEnabled", async () => {
    await expect(timelock.connect(user0).setIsAmmEnabled(vaultPriceFeed.address, false))
      .to.be.revertedWith("Timelock: forbidden")

    expect(await vaultPriceFeed.isAmmEnabled()).eq(true)
    await timelock.connect(wallet).setIsAmmEnabled(vaultPriceFeed.address, false)
    expect(await vaultPriceFeed.isAmmEnabled()).eq(false)
  })

  it("setMaxStrictPriceDeviation", async () => {
    await expect(timelock.connect(user0).setMaxStrictPriceDeviation(vaultPriceFeed.address, 100))
      .to.be.revertedWith("Timelock: forbidden")

    expect(await vaultPriceFeed.maxStrictPriceDeviation()).eq(0)
    await timelock.connect(wallet).setMaxStrictPriceDeviation(vaultPriceFeed.address, 100)
    expect(await vaultPriceFeed.maxStrictPriceDeviation()).eq(100)
  })

  it("setPriceSampleSpace", async () => {
    await expect(timelock.connect(user0).setPriceSampleSpace(vaultPriceFeed.address, 0))
      .to.be.revertedWith("Timelock: forbidden")

    expect(await vaultPriceFeed.priceSampleSpace()).eq(3)
    await timelock.connect(wallet).setPriceSampleSpace(vaultPriceFeed.address, 1)
    expect(await vaultPriceFeed.priceSampleSpace()).eq(1)
  })

  it("setVaultPriceFeed", async () => {
    await expect(timelock.connect(user0).setVaultPriceFeed(fastPriceFeed.address, vaultPriceFeed.address))
      .to.be.revertedWith("Timelock: forbidden")

    expect(await fastPriceFeed.vaultPriceFeed()).eq(AddressZero)
    await timelock.connect(wallet).setVaultPriceFeed(fastPriceFeed.address, vaultPriceFeed.address)
    expect(await fastPriceFeed.vaultPriceFeed()).eq(vaultPriceFeed.address)
  })

  it("setPriceDuration", async () => {
    await expect(timelock.connect(user0).setPriceDuration(fastPriceFeed.address, 1000))
      .to.be.revertedWith("Timelock: forbidden")

    expect(await fastPriceFeed.priceDuration()).eq(300)
    await timelock.connect(wallet).setPriceDuration(fastPriceFeed.address, 1000)
    expect(await fastPriceFeed.priceDuration()).eq(1000)
  })

  it("setMaxPriceUpdateDelay", async () => {
    await expect(timelock.connect(user0).setMaxPriceUpdateDelay(fastPriceFeed.address, 30 * 60))
      .to.be.revertedWith("Timelock: forbidden")

    expect(await fastPriceFeed.maxPriceUpdateDelay()).eq(60 * 60)
    await timelock.connect(wallet).setMaxPriceUpdateDelay(fastPriceFeed.address, 30 * 60)
    expect(await fastPriceFeed.maxPriceUpdateDelay()).eq(30 * 60)
  })

  it("setSpreadBasisPointsIfInactive", async () => {
    await expect(timelock.connect(user0).setSpreadBasisPointsIfInactive(fastPriceFeed.address, 30))
      .to.be.revertedWith("Timelock: forbidden")

    expect(await fastPriceFeed.spreadBasisPointsIfInactive()).eq(0)
    await timelock.connect(wallet).setSpreadBasisPointsIfInactive(fastPriceFeed.address, 30)
    expect(await fastPriceFeed.spreadBasisPointsIfInactive()).eq(30)
  })

  it("setSpreadBasisPointsIfChainError", async () => {
    await expect(timelock.connect(user0).setSpreadBasisPointsIfChainError(fastPriceFeed.address, 500))
      .to.be.revertedWith("Timelock: forbidden")

    expect(await fastPriceFeed.spreadBasisPointsIfChainError()).eq(0)
    await timelock.connect(wallet).setSpreadBasisPointsIfChainError(fastPriceFeed.address, 500)
    expect(await fastPriceFeed.spreadBasisPointsIfChainError()).eq(500)
  })

  it("transferIn", async () => {
    await bnb.mint(user1.address, 1000)
    await expect(timelock.connect(user0).transferIn(user1.address, bnb.address, 1000))
      .to.be.revertedWith("Timelock: forbidden")

    await expect(timelock.connect(wallet).transferIn(user1.address, bnb.address, 1000))
      .to.be.revertedWith("ERC20: transfer amount exceeds allowance")

    await bnb.connect(user1).approve(timelock.address, 1000)

    expect(await bnb.balanceOf(user1.address)).eq(1000)
    expect(await bnb.balanceOf(timelock.address)).eq(0)
    await timelock.connect(wallet).transferIn(user1.address, bnb.address, 1000)
    expect(await bnb.balanceOf(user1.address)).eq(0)
    expect(await bnb.balanceOf(timelock.address)).eq(1000)
  })

  it("approve", async () => {
    await timelock.setContractHandler(user0.address, true)
    await expect(timelock.connect(user0).approve(dai.address, user1.address, expandDecimals(100, 18)))
      .to.be.revertedWith("Timelock: forbidden")

    await expect(timelock.connect(wallet).approve(dai.address, user1.address, expandDecimals(100, 18)))
      .to.be.revertedWith("Timelock: action not signalled")

    await expect(timelock.connect(user0).signalApprove(dai.address, user1.address, expandDecimals(100, 18)))
      .to.be.revertedWith("Timelock: forbidden")

    await timelock.connect(wallet).signalApprove(dai.address, user1.address, expandDecimals(100, 18))

    await expect(timelock.connect(wallet).approve(dai.address, user1.address, expandDecimals(100, 18)))
      .to.be.revertedWith("Timelock: action time not yet passed")

    await increaseTime(provider, 4 * 24 * 60 * 60)
    await mineBlock(provider)

    await expect(timelock.connect(wallet).approve(dai.address, user1.address, expandDecimals(100, 18)))
      .to.be.revertedWith("Timelock: action time not yet passed")

    await increaseTime(provider, 1 * 24 * 60 * 60 + 10)
    await mineBlock(provider)

    await expect(timelock.connect(wallet).approve(bnb.address, user1.address, expandDecimals(100, 18)))
      .to.be.revertedWith("Timelock: action not signalled")

    await expect(timelock.connect(wallet).approve(dai.address, user2.address, expandDecimals(100, 18)))
      .to.be.revertedWith("Timelock: action not signalled")

    await expect(timelock.connect(wallet).approve(dai.address, user1.address, expandDecimals(101, 18)))
      .to.be.revertedWith("Timelock: action not signalled")

    await dai.mint(timelock.address, expandDecimals(150, 18))

    expect(await dai.balanceOf(timelock.address)).eq(expandDecimals(150, 18))
    expect(await dai.balanceOf(user1.address)).eq(0)

    await expect(dai.connect(user1).transferFrom(timelock.address, user1.address, expandDecimals(100, 18)))
      .to.be.revertedWith("ERC20: transfer amount exceeds allowance")

    await timelock.connect(wallet).approve(dai.address, user1.address, expandDecimals(100, 18))
    await expect(dai.connect(user2).transferFrom(timelock.address, user2.address, expandDecimals(100, 18)))
      .to.be.revertedWith("ERC20: transfer amount exceeds allowance")
    await dai.connect(user1).transferFrom(timelock.address, user1.address, expandDecimals(100, 18))

    expect(await dai.balanceOf(timelock.address)).eq(expandDecimals(50, 18))
    expect(await dai.balanceOf(user1.address)).eq(expandDecimals(100, 18))

    await expect(dai.connect(user1).transferFrom(timelock.address, user1.address, expandDecimals(1, 18)))
      .to.be.revertedWith("ERC20: transfer amount exceeds allowance")

    await expect(timelock.connect(wallet).approve(dai.address, user1.address, expandDecimals(100, 18)))
      .to.be.revertedWith("Timelock: action not signalled")

    await timelock.connect(wallet).signalApprove(dai.address, user1.address, expandDecimals(100, 18))

    await expect(timelock.connect(wallet).approve(dai.address, user1.address, expandDecimals(100, 18)))
      .to.be.revertedWith("Timelock: action time not yet passed")

    const action0 = ethers.utils.solidityKeccak256(["string", "address", "address", "uint256"], ["approve", bnb.address, user1.address, expandDecimals(100, 18)])
    const action1 = ethers.utils.solidityKeccak256(["string", "address", "address", "uint256"], ["approve", dai.address, user1.address, expandDecimals(100, 18)])

    await expect(timelock.connect(user0).cancelAction(action0))
      .to.be.revertedWith("Timelock: forbidden")

    await expect(timelock.connect(wallet).cancelAction(action0))
      .to.be.revertedWith("Timelock: invalid _action")

    await timelock.connect(wallet).cancelAction(action1)

    await expect(timelock.connect(wallet).approve(dai.address, user1.address, expandDecimals(100, 18)))
      .to.be.revertedWith("Timelock: action not signalled")
  })

  it("setGov", async () => {
    await timelock.setContractHandler(user0.address, true)

    await expect(timelock.connect(user0).setGov(fastPriceFeed.address, user1.address))
      .to.be.revertedWith("Timelock: forbidden")

    await expect(timelock.connect(wallet).setGov(fastPriceFeed.address, user1.address))
      .to.be.revertedWith("Timelock: action not signalled")

    await expect(timelock.connect(user0).signalSetGov(fastPriceFeed.address, user1.address))
      .to.be.revertedWith("Timelock: forbidden")

    await timelock.connect(wallet).signalSetGov(fastPriceFeed.address, user1.address)

    await expect(timelock.connect(wallet).setGov(fastPriceFeed.address, user1.address))
      .to.be.revertedWith("Timelock: action time not yet passed")

    await increaseTime(provider, 4 * 24 * 60 * 60)
    await mineBlock(provider)

    await expect(timelock.connect(wallet).setGov(fastPriceFeed.address, user1.address))
      .to.be.revertedWith("Timelock: action time not yet passed")

    await increaseTime(provider, 1 * 24 * 60 * 60 + 10)
    await mineBlock(provider)

    await expect(timelock.connect(wallet).setGov(user2.address, user1.address))
      .to.be.revertedWith("Timelock: action not signalled")

    await expect(timelock.connect(wallet).setGov(fastPriceFeed.address, user2.address))
      .to.be.revertedWith("Timelock: action not signalled")

    expect(await fastPriceFeed.gov()).eq(timelock.address)
    await timelock.connect(wallet).setGov(fastPriceFeed.address, user1.address)
    expect(await fastPriceFeed.gov()).eq(user1.address)

    await timelock.connect(wallet).signalSetGov(fastPriceFeed.address, user2.address)

    await expect(timelock.connect(wallet).setGov(fastPriceFeed.address, user2.address))
      .to.be.revertedWith("Timelock: action time not yet passed")

    const action0 = ethers.utils.solidityKeccak256(["string", "address", "address"], ["setGov", user1.address, user2.address])
    const action1 = ethers.utils.solidityKeccak256(["string", "address", "address"], ["setGov", fastPriceFeed.address, user2.address])

    await expect(timelock.connect(wallet).cancelAction(action0))
      .to.be.revertedWith("Timelock: invalid _action")

    await timelock.connect(wallet).cancelAction(action1)

    await expect(timelock.connect(wallet).setGov(fastPriceFeed.address, user2.address))
      .to.be.revertedWith("Timelock: action not signalled")
  })

  it("withdrawToken", async () => {
    await timelock.setContractHandler(user0.address, true)

    const gmx = await deployContract("GMX", [])
    await gmx.setGov(timelock.address)

    await expect(timelock.connect(user0).withdrawToken(gmx.address, bnb.address, user0.address, 100))
      .to.be.revertedWith("Timelock: forbidden")

    await expect(timelock.connect(wallet).withdrawToken(gmx.address, bnb.address, user0.address, 100))
      .to.be.revertedWith("Timelock: action not signalled")

    await expect(timelock.connect(user0).signalWithdrawToken(gmx.address, bnb.address, user0.address, 100))
      .to.be.revertedWith("Timelock: forbidden")

    await timelock.connect(wallet).signalWithdrawToken(gmx.address, bnb.address, user0.address, 100)

    await expect(timelock.connect(wallet).withdrawToken(gmx.address, bnb.address, user0.address, 100))
      .to.be.revertedWith("Timelock: action time not yet passed")

    await increaseTime(provider, 4 * 24 * 60 * 60)
    await mineBlock(provider)

    await expect(timelock.connect(wallet).withdrawToken(gmx.address, bnb.address, user0.address, 100))
      .to.be.revertedWith("Timelock: action time not yet passed")

    await increaseTime(provider, 1 * 24 * 60 * 60 + 10)
    await mineBlock(provider)

    await expect(timelock.connect(wallet).withdrawToken(dai.address, bnb.address, user0.address, 100))
      .to.be.revertedWith("Timelock: action not signalled")

    await expect(timelock.connect(wallet).withdrawToken(gmx.address, dai.address, user0.address, 100))
      .to.be.revertedWith("Timelock: action not signalled")

    await expect(timelock.connect(wallet).withdrawToken(gmx.address, bnb.address, user1.address, 100))
      .to.be.revertedWith("Timelock: action not signalled")

    await expect(timelock.connect(wallet).withdrawToken(gmx.address, bnb.address, user0.address, 101))
      .to.be.revertedWith("Timelock: action not signalled")

    await expect(timelock.connect(wallet).withdrawToken(gmx.address, bnb.address, user0.address, 100))
      .to.be.revertedWith("ERC20: transfer amount exceeds balance")

    await bnb.mint(gmx.address, 100)
    expect(await bnb.balanceOf(user0.address)).eq(0)
    await timelock.connect(wallet).withdrawToken(gmx.address, bnb.address, user0.address, 100)
    expect(await bnb.balanceOf(user0.address)).eq(100)
  })

  it("setPriceFeedWatcher", async () => {
    await timelock.setContractHandler(user0.address, true)

    await expect(timelock.connect(user0).setPriceFeedWatcher(fastPriceFeed.address, user1.address, true))
      .to.be.revertedWith("Timelock: forbidden")

    await expect(timelock.connect(wallet).setPriceFeedWatcher(fastPriceFeed.address, user1.address, true))
      .to.be.revertedWith("Timelock: action not signalled")

    await expect(timelock.connect(user0).signalSetPriceFeedWatcher(fastPriceFeed.address, user1.address, true))
      .to.be.revertedWith("Timelock: forbidden")

    await timelock.connect(wallet).signalSetPriceFeedWatcher(fastPriceFeed.address, user1.address, true)

    await expect(timelock.connect(wallet).setPriceFeedWatcher(fastPriceFeed.address, user1.address, true))
      .to.be.revertedWith("Timelock: action time not yet passed")

    await increaseTime(provider, 4 * 24 * 60 * 60)
    await mineBlock(provider)

    await expect(timelock.connect(wallet).setPriceFeedWatcher(fastPriceFeed.address, user1.address, true))
      .to.be.revertedWith("Timelock: action time not yet passed")

    await increaseTime(provider, 1 * 24 * 60 * 60 + 10)
    await mineBlock(provider)

    await expect(timelock.connect(wallet).setPriceFeedWatcher(user2.address, user1.address, true))
      .to.be.revertedWith("Timelock: action not signalled")

    await expect(timelock.connect(wallet).setPriceFeedWatcher(fastPriceFeed.address, user2.address, true))
      .to.be.revertedWith("Timelock: action not signalled")

    await expect(timelock.connect(wallet).setPriceFeedWatcher(fastPriceFeed.address, user1.address, false))
      .to.be.revertedWith("Timelock: action not signalled")

    expect(await fastPriceFeed.isSigner(user1.address)).eq(false)
    await timelock.connect(wallet).setPriceFeedWatcher(fastPriceFeed.address, user1.address, true)
    expect(await fastPriceFeed.isSigner(user1.address)).eq(true)
  })

  it("setPriceFeedUpdater", async () => {
    await timelock.setContractHandler(user0.address, true)

    await expect(timelock.connect(user0).setPriceFeedUpdater(fastPriceFeed.address, user1.address, true))
      .to.be.revertedWith("Timelock: forbidden")

    await expect(timelock.connect(wallet).setPriceFeedUpdater(fastPriceFeed.address, user1.address, true))
      .to.be.revertedWith("Timelock: action not signalled")

    await expect(timelock.connect(user0).signalSetPriceFeedUpdater(fastPriceFeed.address, user1.address, true))
      .to.be.revertedWith("Timelock: forbidden")

    await timelock.connect(wallet).signalSetPriceFeedUpdater(fastPriceFeed.address, user1.address, true)

    await expect(timelock.connect(wallet).setPriceFeedUpdater(fastPriceFeed.address, user1.address, true))
      .to.be.revertedWith("Timelock: action time not yet passed")

    await increaseTime(provider, 4 * 24 * 60 * 60)
    await mineBlock(provider)

    await expect(timelock.connect(wallet).setPriceFeedUpdater(fastPriceFeed.address, user1.address, true))
      .to.be.revertedWith("Timelock: action time not yet passed")

    await increaseTime(provider, 1 * 24 * 60 * 60 + 10)
    await mineBlock(provider)

    await expect(timelock.connect(wallet).setPriceFeedUpdater(user2.address, user1.address, true))
      .to.be.revertedWith("Timelock: action not signalled")

    await expect(timelock.connect(wallet).setPriceFeedUpdater(fastPriceFeed.address, user2.address, true))
      .to.be.revertedWith("Timelock: action not signalled")

    await expect(timelock.connect(wallet).setPriceFeedUpdater(fastPriceFeed.address, user1.address, false))
      .to.be.revertedWith("Timelock: action not signalled")

    expect(await fastPriceFeed.isUpdater(user1.address)).eq(false)
    await timelock.connect(wallet).setPriceFeedUpdater(fastPriceFeed.address, user1.address, true)
    expect(await fastPriceFeed.isUpdater(user1.address)).eq(true)
  })

  it("priceFeedSetTokenConfig", async () => {
    await timelock.setContractHandler(user0.address, true)

    await vaultTimelock.connect(wallet).signalSetPriceFeed(vault.address, vaultPriceFeed.address)
    await increaseTime(provider, 5 * 24 * 60 * 60 + 10)
    await mineBlock(provider)
    await vaultTimelock.connect(wallet).setPriceFeed(vault.address, vaultPriceFeed.address)

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(70000))

    await expect(timelock.connect(user0).priceFeedSetTokenConfig(
      vaultPriceFeed.address,
      btc.address, // _token
      btcPriceFeed.address, // _priceFeed
      8, // _priceDecimals
      true // _isStrictStable
    )).to.be.revertedWith("Timelock: forbidden")

    await expect(timelock.connect(wallet).priceFeedSetTokenConfig(
      vaultPriceFeed.address,
      btc.address, // _token
      btcPriceFeed.address, // _priceFeed
      8, // _priceDecimals
      true // _isStrictStable
    )).to.be.revertedWith("Timelock: action not signalled")

    await expect(timelock.connect(user0).signalPriceFeedSetTokenConfig(
      vaultPriceFeed.address,
      btc.address, // _token
      btcPriceFeed.address, // _priceFeed
      8, // _priceDecimals
      true // _isStrictStable
    )).to.be.revertedWith("Timelock: forbidden")

    await timelock.connect(wallet).signalPriceFeedSetTokenConfig(
      vaultPriceFeed.address,
      btc.address, // _token
      btcPriceFeed.address, // _priceFeed
      8, // _priceDecimals
      true // _isStrictStable
    )

    await expect(timelock.connect(wallet).priceFeedSetTokenConfig(
      vaultPriceFeed.address,
      btc.address, // _token
      btcPriceFeed.address, // _priceFeed
      8, // _priceDecimals
      true // _isStrictStable
    )).to.be.revertedWith("Timelock: action time not yet passed")

    await increaseTime(provider, 4 * 24 * 60 * 60)
    await mineBlock(provider)

    await expect(timelock.connect(wallet).priceFeedSetTokenConfig(
      vaultPriceFeed.address,
      btc.address, // _token
      btcPriceFeed.address, // _priceFeed
      8, // _priceDecimals
      true // _isStrictStable
    )).to.be.revertedWith("Timelock: action time not yet passed")


    await increaseTime(provider, 1 * 24 * 60 * 60 + 10)
    await mineBlock(provider)

    await expect(timelock.connect(wallet).priceFeedSetTokenConfig(
      user0.address,
      btc.address, // _token
      btcPriceFeed.address, // _priceFeed
      8, // _priceDecimals
      true // _isStrictStable
    )).to.be.revertedWith("Timelock: action not signalled")

    await expect(timelock.connect(wallet).priceFeedSetTokenConfig(
      vaultPriceFeed.address,
      bnb.address, // _token
      btcPriceFeed.address, // _priceFeed
      8, // _priceDecimals
      true // _isStrictStable
    )).to.be.revertedWith("Timelock: action not signalled")

    await expect(timelock.connect(wallet).priceFeedSetTokenConfig(
      vaultPriceFeed.address,
      btc.address, // _token
      bnbPriceFeed.address, // _priceFeed
      8, // _priceDecimals
      true // _isStrictStable
    )).to.be.revertedWith("Timelock: action not signalled")

    await expect(timelock.connect(wallet).priceFeedSetTokenConfig(
      vaultPriceFeed.address,
      btc.address, // _token
      btcPriceFeed.address, // _priceFeed
      9, // _priceDecimals
      true // _isStrictStable
    )).to.be.revertedWith("Timelock: action not signalled")

    await expect(timelock.connect(wallet).priceFeedSetTokenConfig(
      vaultPriceFeed.address,
      btc.address, // _token
      btcPriceFeed.address, // _priceFeed
      8, // _priceDecimals
      false // _isStrictStable
    )).to.be.revertedWith("Timelock: action not signalled")

    expect(await vaultPriceFeed.priceFeeds(btc.address)).eq(AddressZero)
    expect(await vaultPriceFeed.priceDecimals(btc.address)).eq(0)
    expect(await vaultPriceFeed.strictStableTokens(btc.address)).eq(false)
    await expect(vaultPriceFeed.getPrice(btc.address, true, false, false))
      .to.be.revertedWith("VaultPriceFeed: invalid price feed")

    await timelock.connect(wallet).priceFeedSetTokenConfig(
      vaultPriceFeed.address,
      btc.address, // _token
      btcPriceFeed.address, // _priceFeed
      8, // _priceDecimals
      true // _isStrictStable
    )

    expect(await vaultPriceFeed.priceFeeds(btc.address)).eq(btcPriceFeed.address)
    expect(await vaultPriceFeed.priceDecimals(btc.address)).eq(8)
    expect(await vaultPriceFeed.strictStableTokens(btc.address)).eq(true)
    expect(await vaultPriceFeed.getPrice(btc.address, true, false, false)).eq(toNormalizedPrice(70000))
  })
})
