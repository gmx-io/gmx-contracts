const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed, newWallet } = require("../shared/utilities")
const { toChainlinkPrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig } = require("./Vault/helpers")

use(solidity)

describe("RouterV2", function () {
  const { AddressZero, HashZero } = ethers.constants
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  const depositFee = 50
  const minExecutionFee = 4000
  let vault
  let usdg
  let router
  let routerV2
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
    routerV2 = await deployContract("RouterV2", [vault.address, router.address, bnb.address, depositFee, minExecutionFee])
    referralStorage = await deployContract("ReferralStorage", [])
    vaultPriceFeed = await deployContract("VaultPriceFeed", [])
    await routerV2.setReferralStorage(referralStorage.address)
    await referralStorage.setHandler(routerV2.address, true)

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
    expect(await routerV2.vault()).eq(vault.address)
    expect(await routerV2.router()).eq(router.address)
    expect(await routerV2.weth()).eq(bnb.address)
    expect(await routerV2.depositFee()).eq(depositFee)
    expect(await routerV2.minExecutionFee()).eq(minExecutionFee)
    expect(await routerV2.admin()).eq(wallet.address)
    expect(await routerV2.gov()).eq(wallet.address)
  })

  it("setAdmin", async () => {
    await expect(routerV2.connect(user0).setAdmin(user1.address))
      .to.be.revertedWith("Governable: forbidden")

    await routerV2.setGov(user0.address)

    expect(await routerV2.admin()).eq(wallet.address)
    await routerV2.connect(user0).setAdmin(user1.address)
    expect(await routerV2.admin()).eq(user1.address)
  })

  it("setDepositFee", async () => {
    await expect(routerV2.connect(user0).setDepositFee(25))
      .to.be.revertedWith("BasePositionManager: forbidden")

    await routerV2.setAdmin(user0.address)

    expect(await routerV2.depositFee()).eq(depositFee)
    await routerV2.connect(user0).setDepositFee(25)
    expect(await routerV2.depositFee()).eq(25)
  })

  it("setReferralStorage", async () => {
    await expect(routerV2.connect(user0).setReferralStorage(user1.address))
      .to.be.revertedWith("BasePositionManager: forbidden")

    await routerV2.setAdmin(user0.address)

    expect(await routerV2.referralStorage()).eq(referralStorage.address)
    await routerV2.connect(user0).setReferralStorage(user1.address)
    expect(await routerV2.referralStorage()).eq(user1.address)
  })

  it("setMaxGlobalSizes", async () => {
    const tokens = [bnb.address, btc.address, eth.address]
    const maxGlobalLongSizes = [7, 20, 15]
    const maxGlobalShortSizes = [3, 12, 8]

    await expect(routerV2.connect(user0).setMaxGlobalSizes(tokens, maxGlobalLongSizes, maxGlobalShortSizes))
      .to.be.revertedWith("BasePositionManager: forbidden")

    await routerV2.setAdmin(user0.address)

    expect(await routerV2.maxGlobalLongSizes(bnb.address)).eq(0)
    expect(await routerV2.maxGlobalLongSizes(btc.address)).eq(0)
    expect(await routerV2.maxGlobalLongSizes(eth.address)).eq(0)

    expect(await routerV2.maxGlobalShortSizes(bnb.address)).eq(0)
    expect(await routerV2.maxGlobalShortSizes(btc.address)).eq(0)
    expect(await routerV2.maxGlobalShortSizes(eth.address)).eq(0)

    await routerV2.connect(user0).setMaxGlobalSizes(tokens, maxGlobalLongSizes, maxGlobalShortSizes)

    expect(await routerV2.maxGlobalLongSizes(bnb.address)).eq(7)
    expect(await routerV2.maxGlobalLongSizes(btc.address)).eq(20)
    expect(await routerV2.maxGlobalLongSizes(eth.address)).eq(15)

    expect(await routerV2.maxGlobalShortSizes(bnb.address)).eq(3)
    expect(await routerV2.maxGlobalShortSizes(btc.address)).eq(12)
    expect(await routerV2.maxGlobalShortSizes(eth.address)).eq(8)
  })

  it("approve", async () => {
    await expect(routerV2.connect(user0).approve(bnb.address, user1.address, 100))
      .to.be.revertedWith("Governable: forbidden")

    await routerV2.setGov(user0.address)

    expect(await bnb.allowance(routerV2.address, user1.address)).eq(0)
    await routerV2.connect(user0).approve(bnb.address, user1.address, 100)
    expect(await bnb.allowance(routerV2.address, user1.address)).eq(100)
  })

  it("sendValue", async () => {
    await expect(routerV2.connect(user0).sendValue(user1.address, 0))
      .to.be.revertedWith("Governable: forbidden")

    await routerV2.setGov(user0.address)

    await routerV2.connect(user0).sendValue(user1.address, 0)
  })

  it("setPositionKeeper", async () => {
    await expect(routerV2.connect(user0).setPositionKeeper(user1.address, true))
      .to.be.revertedWith("BasePositionManager: forbidden")

    await routerV2.setAdmin(user0.address)

    expect(await routerV2.isPositionKeeper(user1.address)).eq(false)
    await routerV2.connect(user0).setPositionKeeper(user1.address, true)
    expect(await routerV2.isPositionKeeper(user1.address)).eq(true)

    await routerV2.connect(user0).setPositionKeeper(user1.address, false)
    expect(await routerV2.isPositionKeeper(user1.address)).eq(false)
  })

  it("setMinExecutionFee", async () => {
    await expect(routerV2.connect(user0).setMinExecutionFee("7000"))
      .to.be.revertedWith("BasePositionManager: forbidden")

    await routerV2.setAdmin(user0.address)

    expect(await routerV2.minExecutionFee()).eq(minExecutionFee)
    await routerV2.connect(user0).setMinExecutionFee("7000")
    expect(await routerV2.minExecutionFee()).eq("7000")
  })

  it("setIsLeverageEnabled", async () => {
    await expect(routerV2.connect(user0).setIsLeverageEnabled(false))
      .to.be.revertedWith("BasePositionManager: forbidden")

    await routerV2.setAdmin(user0.address)

    expect(await routerV2.isLeverageEnabled()).eq(true)
    await routerV2.connect(user0).setIsLeverageEnabled(false)
    expect(await routerV2.isLeverageEnabled()).eq(false)
  })

  it("setDelayValues", async () => {
    await expect(routerV2.connect(user0).setDelayValues(7, 21, 600))
      .to.be.revertedWith("BasePositionManager: forbidden")

    await routerV2.setAdmin(user0.address)

    expect(await routerV2.minBlockDelayKeeper()).eq(0)
    expect(await routerV2.minTimeDelayPublic()).eq(0)
    expect(await routerV2.maxTimeDelay()).eq(0)

    await routerV2.connect(user0).setDelayValues(7, 21, 600)

    expect(await routerV2.minBlockDelayKeeper()).eq(7)
    expect(await routerV2.minTimeDelayPublic()).eq(21)
    expect(await routerV2.maxTimeDelay()).eq(600)
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

    await expect(routerV2.connect(user0).createIncreasePosition(...params.concat([3000, referralCode])))
      .to.be.revertedWith("RouterV2: invalid executionFee")

    await expect(routerV2.connect(user0).createIncreasePosition(...params.concat([4000, referralCode])))
      .to.be.revertedWith("RouterV2: invalid msg.value")

    await expect(routerV2.connect(user0).createIncreasePosition(...params.concat([4000, referralCode]), { value: 3000 }))
      .to.be.revertedWith("RouterV2: invalid msg.value")

    await expect(routerV2.connect(user0).createIncreasePosition(...params.concat([4000, referralCode]), { value: 4000 }))
      .to.be.revertedWith("Router: invalid plugin")

    await router.addPlugin(routerV2.address)

    await expect(routerV2.connect(user0).createIncreasePosition(...params.concat([4000, referralCode]), { value: 4000 }))
      .to.be.revertedWith("Router: plugin not approved")

    await router.connect(user0).approvePlugin(routerV2.address)

    await expect(routerV2.connect(user0).createIncreasePosition(...params.concat([4000, referralCode]), { value: 4000 }))
      .to.be.revertedWith("ERC20: transfer amount exceeds balance")

    await dai.mint(user0.address, expandDecimals(600, 18))

    await expect(routerV2.connect(user0).createIncreasePosition(...params.concat([4000, referralCode]), { value: 4000 }))
      .to.be.revertedWith("ERC20: transfer amount exceeds allowance")

    await dai.connect(user0).approve(router.address, expandDecimals(600, 18))

    const key = await routerV2.getRequestKey(user0.address, 1)
    let request = await routerV2.increasePositionRequests(key)

    expect(await referralStorage.referrals(user0.address)).eq(HashZero)
    expect(await dai.balanceOf(routerV2.address)).eq(0)
    expect(await routerV2.increasePositionsIndex(user0.address)).eq(0)

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

    const tx = await routerV2.connect(user0).createIncreasePosition(...params.concat([4000, referralCode]), { value: 4000 })
    await reportGasUsed(provider, tx, "createIncreasePosition gas used")

    const blockNumber = await provider.getBlockNumber()
    const blockTime = await getBlockTime(provider)

    request = await routerV2.increasePositionRequests(key)

    expect(await referralStorage.referrals(user0.address)).eq(referralCode)
    expect(await dai.balanceOf(routerV2.address)).eq(expandDecimals(600, 18))
    expect(await routerV2.increasePositionsIndex(user0.address)).eq(1)

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

    await expect(routerV2.connect(user0).createIncreasePosition(...params.concat([3000, referralCode])))
      .to.be.revertedWith("RouterV2: invalid executionFee")

    await expect(routerV2.connect(user0).createIncreasePosition(...params.concat([4000, referralCode])))
      .to.be.revertedWith("RouterV2: invalid msg.value")

    await expect(routerV2.connect(user0).createIncreasePosition(...params.concat([4000, referralCode]), { value: 3000 }))
      .to.be.revertedWith("RouterV2: invalid msg.value")

    await expect(routerV2.connect(user0).createIncreasePosition(...params.concat([4000, referralCode]), { value: 4000 }))
      .to.be.revertedWith("Router: invalid plugin")

    await router.addPlugin(routerV2.address)

    await expect(routerV2.connect(user0).createIncreasePosition(...params.concat([4000, referralCode]), { value: 4000 }))
      .to.be.revertedWith("Router: plugin not approved")

    await router.connect(user0).approvePlugin(routerV2.address)

    await expect(routerV2.connect(user0).createIncreasePosition(...params.concat([4000, referralCode]), { value: 4000 }))
      .to.be.revertedWith("ERC20: transfer amount exceeds balance")

    await dai.mint(user0.address, expandDecimals(600, 18))

    await expect(routerV2.connect(user0).createIncreasePosition(...params.concat([4000, referralCode]), { value: 4000 }))
      .to.be.revertedWith("ERC20: transfer amount exceeds allowance")

    await dai.connect(user0).approve(router.address, expandDecimals(600, 18))

    const key = await routerV2.getRequestKey(user0.address, 1)
    let request = await routerV2.increasePositionRequests(key)

    expect(await referralStorage.referrals(user0.address)).eq(HashZero)
    expect(await dai.balanceOf(routerV2.address)).eq(0)
    expect(await routerV2.increasePositionsIndex(user0.address)).eq(0)

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

    const tx = await routerV2.connect(user0).createIncreasePosition(...params.concat([4000, referralCode]), { value: 4000 })
    await reportGasUsed(provider, tx, "createIncreasePosition gas used")

    const blockNumber = await provider.getBlockNumber()
    const blockTime = await getBlockTime(provider)

    request = await routerV2.increasePositionRequests(key)

    expect(await referralStorage.referrals(user0.address)).eq(referralCode)
    expect(await dai.balanceOf(routerV2.address)).eq(expandDecimals(600, 18))
    expect(await routerV2.increasePositionsIndex(user0.address)).eq(1)

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
})
