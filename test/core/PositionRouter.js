const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed, newWallet } = require("../shared/utilities")
const { toChainlinkPrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig } = require("./Vault/helpers")

use(solidity)

describe("PositionRouter", function () {
  const { AddressZero, HashZero } = ethers.constants
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  const depositFee = 50
  const minExecutionFee = 4000
  let vault
  let usdg
  let router
  let positionRouter
  let referralStorage
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
    positionRouter = await deployContract("PositionRouter", [vault.address, router.address, bnb.address, depositFee, minExecutionFee])
    referralStorage = await deployContract("ReferralStorage", [])
    vaultPriceFeed = await deployContract("VaultPriceFeed", [])
    await positionRouter.setReferralStorage(referralStorage.address)
    await referralStorage.setHandler(positionRouter.address, true)

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

  it("inits", async () => {
    expect(await positionRouter.vault()).eq(vault.address)
    expect(await positionRouter.router()).eq(router.address)
    expect(await positionRouter.weth()).eq(bnb.address)
    expect(await positionRouter.depositFee()).eq(depositFee)
    expect(await positionRouter.minExecutionFee()).eq(minExecutionFee)
    expect(await positionRouter.admin()).eq(wallet.address)
    expect(await positionRouter.gov()).eq(wallet.address)
  })

  it("setAdmin", async () => {
    await expect(positionRouter.connect(user0).setAdmin(user1.address))
      .to.be.revertedWith("Governable: forbidden")

    await positionRouter.setGov(user0.address)

    expect(await positionRouter.admin()).eq(wallet.address)
    await positionRouter.connect(user0).setAdmin(user1.address)
    expect(await positionRouter.admin()).eq(user1.address)
  })

  it("setDepositFee", async () => {
    await expect(positionRouter.connect(user0).setDepositFee(25))
      .to.be.revertedWith("BasePositionManager: forbidden")

    await positionRouter.setAdmin(user0.address)

    expect(await positionRouter.depositFee()).eq(depositFee)
    await positionRouter.connect(user0).setDepositFee(25)
    expect(await positionRouter.depositFee()).eq(25)
  })

  it("setReferralStorage", async () => {
    await expect(positionRouter.connect(user0).setReferralStorage(user1.address))
      .to.be.revertedWith("BasePositionManager: forbidden")

    await positionRouter.setAdmin(user0.address)

    expect(await positionRouter.referralStorage()).eq(referralStorage.address)
    await positionRouter.connect(user0).setReferralStorage(user1.address)
    expect(await positionRouter.referralStorage()).eq(user1.address)
  })

  it("setMaxGlobalSizes", async () => {
    const tokens = [bnb.address, btc.address, eth.address]
    const maxGlobalLongSizes = [7, 20, 15]
    const maxGlobalShortSizes = [3, 12, 8]

    await expect(positionRouter.connect(user0).setMaxGlobalSizes(tokens, maxGlobalLongSizes, maxGlobalShortSizes))
      .to.be.revertedWith("BasePositionManager: forbidden")

    await positionRouter.setAdmin(user0.address)

    expect(await positionRouter.maxGlobalLongSizes(bnb.address)).eq(0)
    expect(await positionRouter.maxGlobalLongSizes(btc.address)).eq(0)
    expect(await positionRouter.maxGlobalLongSizes(eth.address)).eq(0)

    expect(await positionRouter.maxGlobalShortSizes(bnb.address)).eq(0)
    expect(await positionRouter.maxGlobalShortSizes(btc.address)).eq(0)
    expect(await positionRouter.maxGlobalShortSizes(eth.address)).eq(0)

    await positionRouter.connect(user0).setMaxGlobalSizes(tokens, maxGlobalLongSizes, maxGlobalShortSizes)

    expect(await positionRouter.maxGlobalLongSizes(bnb.address)).eq(7)
    expect(await positionRouter.maxGlobalLongSizes(btc.address)).eq(20)
    expect(await positionRouter.maxGlobalLongSizes(eth.address)).eq(15)

    expect(await positionRouter.maxGlobalShortSizes(bnb.address)).eq(3)
    expect(await positionRouter.maxGlobalShortSizes(btc.address)).eq(12)
    expect(await positionRouter.maxGlobalShortSizes(eth.address)).eq(8)
  })

  it("approve", async () => {
    await expect(positionRouter.connect(user0).approve(bnb.address, user1.address, 100))
      .to.be.revertedWith("Governable: forbidden")

    await positionRouter.setGov(user0.address)

    expect(await bnb.allowance(positionRouter.address, user1.address)).eq(0)
    await positionRouter.connect(user0).approve(bnb.address, user1.address, 100)
    expect(await bnb.allowance(positionRouter.address, user1.address)).eq(100)
  })

  it("sendValue", async () => {
    await expect(positionRouter.connect(user0).sendValue(user1.address, 0))
      .to.be.revertedWith("Governable: forbidden")

    await positionRouter.setGov(user0.address)

    await positionRouter.connect(user0).sendValue(user1.address, 0)
  })

  it("setPositionKeeper", async () => {
    await expect(positionRouter.connect(user0).setPositionKeeper(user1.address, true))
      .to.be.revertedWith("BasePositionManager: forbidden")

    await positionRouter.setAdmin(user0.address)

    expect(await positionRouter.isPositionKeeper(user1.address)).eq(false)
    await positionRouter.connect(user0).setPositionKeeper(user1.address, true)
    expect(await positionRouter.isPositionKeeper(user1.address)).eq(true)

    await positionRouter.connect(user0).setPositionKeeper(user1.address, false)
    expect(await positionRouter.isPositionKeeper(user1.address)).eq(false)
  })

  it("setMinExecutionFee", async () => {
    await expect(positionRouter.connect(user0).setMinExecutionFee("7000"))
      .to.be.revertedWith("BasePositionManager: forbidden")

    await positionRouter.setAdmin(user0.address)

    expect(await positionRouter.minExecutionFee()).eq(minExecutionFee)
    await positionRouter.connect(user0).setMinExecutionFee("7000")
    expect(await positionRouter.minExecutionFee()).eq("7000")
  })

  it("setIsLeverageEnabled", async () => {
    await expect(positionRouter.connect(user0).setIsLeverageEnabled(false))
      .to.be.revertedWith("BasePositionManager: forbidden")

    await positionRouter.setAdmin(user0.address)

    expect(await positionRouter.isLeverageEnabled()).eq(true)
    await positionRouter.connect(user0).setIsLeverageEnabled(false)
    expect(await positionRouter.isLeverageEnabled()).eq(false)
  })

  it("setDelayValues", async () => {
    await expect(positionRouter.connect(user0).setDelayValues(7, 21, 600))
      .to.be.revertedWith("BasePositionManager: forbidden")

    await positionRouter.setAdmin(user0.address)

    expect(await positionRouter.minBlockDelayKeeper()).eq(0)
    expect(await positionRouter.minTimeDelayPublic()).eq(0)
    expect(await positionRouter.maxTimeDelay()).eq(0)

    await positionRouter.connect(user0).setDelayValues(7, 21, 600)

    expect(await positionRouter.minBlockDelayKeeper()).eq(7)
    expect(await positionRouter.minTimeDelayPublic()).eq(21)
    expect(await positionRouter.maxTimeDelay()).eq(600)
  })

  it("createIncreasePosition", async () => {
    const referralCode = "0x0000000000000000000000000000000000000000000000000000000000000123"

    const params = [
      [dai.address, bnb.address], // _path
      bnb.address, // _indexToken
      expandDecimals(600, 18), // _amountIn
      expandDecimals(1, 18), // _minOut
      toUsd(6000), // _sizeDelta
      true, // _isLong
      toUsd(300), // _acceptablePrice
    ]

    await expect(positionRouter.connect(user0).createIncreasePosition(...params.concat([3000, referralCode])))
      .to.be.revertedWith("PositionRouter: invalid executionFee")

    await expect(positionRouter.connect(user0).createIncreasePosition(...params.concat([4000, referralCode])))
      .to.be.revertedWith("PositionRouter: invalid msg.value")

    await expect(positionRouter.connect(user0).createIncreasePosition(...params.concat([4000, referralCode]), { value: 3000 }))
      .to.be.revertedWith("PositionRouter: invalid msg.value")

    await expect(positionRouter.connect(user0).createIncreasePosition(...params.concat([4000, referralCode]), { value: 4000 }))
      .to.be.revertedWith("Router: invalid plugin")

    await router.addPlugin(positionRouter.address)

    await expect(positionRouter.connect(user0).createIncreasePosition(...params.concat([4000, referralCode]), { value: 4000 }))
      .to.be.revertedWith("Router: plugin not approved")

    await router.connect(user0).approvePlugin(positionRouter.address)

    await expect(positionRouter.connect(user0).createIncreasePosition(...params.concat([4000, referralCode]), { value: 4000 }))
      .to.be.revertedWith("ERC20: transfer amount exceeds balance")

    await dai.mint(user0.address, expandDecimals(600, 18))

    await expect(positionRouter.connect(user0).createIncreasePosition(...params.concat([4000, referralCode]), { value: 4000 }))
      .to.be.revertedWith("ERC20: transfer amount exceeds allowance")

    await dai.connect(user0).approve(router.address, expandDecimals(600, 18))

    const key = await positionRouter.getRequestKey(user0.address, 1)
    let request = await positionRouter.increasePositionRequests(key)

    expect(await referralStorage.traderReferralCodes(user0.address)).eq(HashZero)
    expect(await dai.balanceOf(positionRouter.address)).eq(0)
    expect(await positionRouter.increasePositionsIndex(user0.address)).eq(0)

    expect(request.account).eq(AddressZero)
    expect(request.path).eq(undefined)
    expect(request.indexToken).eq(AddressZero)
    expect(request.amountIn).eq(0)
    expect(request.minOut).eq(0)
    expect(request.sizeDelta).eq(0)
    expect(request.isLong).eq(false)
    expect(request.acceptablePrice).eq(0)
    expect(request.executionFee).eq(0)
    expect(request.blockNumber).eq(0)
    expect(request.blockTime).eq(0)
    expect(request.hasCollateralInETH).eq(false)

    const tx = await positionRouter.connect(user0).createIncreasePosition(...params.concat([4000, referralCode]), { value: 4000 })
    await reportGasUsed(provider, tx, "createIncreasePosition gas used")

    const blockNumber = await provider.getBlockNumber()
    const blockTime = await getBlockTime(provider)

    request = await positionRouter.increasePositionRequests(key)

    expect(await referralStorage.traderReferralCodes(user0.address)).eq(referralCode)
    expect(await dai.balanceOf(positionRouter.address)).eq(expandDecimals(600, 18))
    expect(await positionRouter.increasePositionsIndex(user0.address)).eq(1)

    expect(request.account).eq(user0.address)
    expect(request.path).eq(undefined)
    expect(request.indexToken).eq(bnb.address)
    expect(request.amountIn).eq(expandDecimals(600, 18))
    expect(request.minOut).eq(expandDecimals(1, 18))
    expect(request.sizeDelta).eq(toUsd(6000))
    expect(request.isLong).eq(true)
    expect(request.acceptablePrice).eq(toUsd(300))
    expect(request.executionFee).eq(4000)
    expect(request.blockNumber).eq(blockNumber)
    expect(request.blockTime).eq(blockTime)
    expect(request.hasCollateralInETH).eq(false)
  })

  it("createIncreasePositionETH", async () => {
    const referralCode = "0x0000000000000000000000000000000000000000000000000000000000000123"

    const params = [
      [dai.address, bnb.address], // _path
      bnb.address, // _indexToken
      expandDecimals(1, 18), // _minOut
      toUsd(6000), // _sizeDelta
      false, // _isLong
      toUsd(300), // _acceptablePrice
    ]

    await expect(positionRouter.connect(user0).createIncreasePositionETH(...params.concat([3000, referralCode])))
      .to.be.revertedWith("PositionRouter: invalid executionFee")

    await expect(positionRouter.connect(user0).createIncreasePositionETH(...params.concat([4000, referralCode])), { value: 3000 })
      .to.be.revertedWith("PositionRouter: invalid msg.value")

    await expect(positionRouter.connect(user0).createIncreasePositionETH(...params.concat([4000, referralCode]), { value: 4000 }))
      .to.be.revertedWith("Router: invalid _path")

    params[0] = [bnb.address, dai.address]

    const key = await positionRouter.getRequestKey(user0.address, 1)
    let request = await positionRouter.increasePositionRequests(key)

    expect(await referralStorage.traderReferralCodes(user0.address)).eq(HashZero)
    expect(await bnb.balanceOf(positionRouter.address)).eq(0)
    expect(await positionRouter.increasePositionsIndex(user0.address)).eq(0)

    expect(request.account).eq(AddressZero)
    expect(request.path).eq(undefined)
    expect(request.indexToken).eq(AddressZero)
    expect(request.amountIn).eq(0)
    expect(request.minOut).eq(0)
    expect(request.sizeDelta).eq(0)
    expect(request.isLong).eq(false)
    expect(request.acceptablePrice).eq(0)
    expect(request.executionFee).eq(0)
    expect(request.blockNumber).eq(0)
    expect(request.blockTime).eq(0)
    expect(request.hasCollateralInETH).eq(false)

    const tx = await positionRouter.connect(user0).createIncreasePositionETH(...params.concat([4000, referralCode]), { value: 5000 })
    await reportGasUsed(provider, tx, "createIncreasePositionETH gas used")

    const blockNumber = await provider.getBlockNumber()
    const blockTime = await getBlockTime(provider)

    request = await positionRouter.increasePositionRequests(key)

    expect(await referralStorage.traderReferralCodes(user0.address)).eq(referralCode)
    expect(await bnb.balanceOf(positionRouter.address)).eq(5000)
    expect(await positionRouter.increasePositionsIndex(user0.address)).eq(1)

    expect(request.account).eq(user0.address)
    expect(request.path).eq(undefined)
    expect(request.indexToken).eq(bnb.address)
    expect(request.amountIn).eq(1000)
    expect(request.minOut).eq(expandDecimals(1, 18))
    expect(request.sizeDelta).eq(toUsd(6000))
    expect(request.isLong).eq(false)
    expect(request.acceptablePrice).eq(toUsd(300))
    expect(request.executionFee).eq(4000)
    expect(request.blockNumber).eq(blockNumber)
    expect(request.blockTime).eq(blockTime)
    expect(request.hasCollateralInETH).eq(true)
  })
})
