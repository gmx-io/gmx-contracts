const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed, print, newWallet, maxUint256 } = require("../shared/utilities")
const { toChainlinkPrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig } = require("../core/Vault/helpers")

use(solidity)

describe("RewardRouterV2", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3, user4, tokenManager] = provider.getWallets()

  const vestingDuration = 365 * 24 * 60 * 60

  let timelock

  let vault
  let glpManager
  let glp
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

  let gmx
  let esGmx
  let bnGmx

  let stakedGmxTracker
  let stakedGmxDistributor
  let bonusGmxTracker
  let bonusGmxDistributor
  let externalGmxTracker
  let externalGmxDistributor
  let feeGmxTracker
  let feeGmxDistributor

  let feeGlpTracker
  let feeGlpDistributor
  let stakedGlpTracker
  let stakedGlpDistributor

  let gmxVester
  let glpVester

  let mockExternalHandler

  let govToken

  let rewardRouter

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
    glp = await deployContract("GLP", [])

    await initVault(vault, router, usdg, vaultPriceFeed)
    glpManager = await deployContract("GlpManager", [vault.address, usdg.address, glp.address, ethers.constants.AddressZero, 24 * 60 * 60])

    timelock = await deployContract("Timelock", [
      wallet.address, // _admin
      10, // _buffer
      tokenManager.address, // _tokenManager
      tokenManager.address, // _mintReceiver
      glpManager.address, // _glpManager
      glpManager.address, // _prevGlpManager
      user0.address, // _rewardRouter
      expandDecimals(1000000, 18), // _maxTokenSupply
      10, // marginFeeBasisPoints
      100 // maxMarginFeeBasisPoints
    ])

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

    await glp.setInPrivateTransferMode(true)
    await glp.setMinter(glpManager.address, true)
    await glpManager.setInPrivateMode(true)

    gmx = await deployContract("GMX", []);
    esGmx = await deployContract("EsGMX", []);
    bnGmx = await deployContract("MintableBaseToken", ["Bonus GMX", "bnGMX", 0]);

    // GMX
    stakedGmxTracker = await deployContract("RewardTracker", ["Staked GMX", "sGMX"])
    stakedGmxDistributor = await deployContract("RewardDistributor", [esGmx.address, stakedGmxTracker.address])
    await stakedGmxTracker.initialize([gmx.address, esGmx.address], stakedGmxDistributor.address)
    await stakedGmxDistributor.updateLastDistributionTime()

    bonusGmxTracker = await deployContract("RewardTracker", ["Staked + Bonus GMX", "sbGMX"])
    bonusGmxDistributor = await deployContract("BonusDistributor", [bnGmx.address, bonusGmxTracker.address])
    await bonusGmxTracker.initialize([stakedGmxTracker.address], bonusGmxDistributor.address)
    await bonusGmxDistributor.updateLastDistributionTime()

    extendedGmxTracker = await deployContract("RewardTracker", ["Staked + Bonus + Extended GMX", "sbeGMX"])
    extendedGmxDistributor = await deployContract("RewardDistributor", [gmx.address, extendedGmxTracker.address])
    await extendedGmxTracker.initialize([bonusGmxTracker.address, bnGmx.address], extendedGmxDistributor.address)
    await extendedGmxDistributor.updateLastDistributionTime()

    feeGmxTracker = await deployContract("RewardTracker", ["Staked + Bonus + Fee GMX", "sbfGMX"])
    feeGmxDistributor = await deployContract("RewardDistributor", [eth.address, feeGmxTracker.address])
    await feeGmxTracker.initialize([extendedGmxTracker.address], feeGmxDistributor.address)
    await feeGmxDistributor.updateLastDistributionTime()

    // GLP
    feeGlpTracker = await deployContract("RewardTracker", ["Fee GLP", "fGLP"])
    feeGlpDistributor = await deployContract("RewardDistributor", [eth.address, feeGlpTracker.address])
    await feeGlpTracker.initialize([glp.address], feeGlpDistributor.address)
    await feeGlpDistributor.updateLastDistributionTime()

    stakedGlpTracker = await deployContract("RewardTracker", ["Fee + Staked GLP", "fsGLP"])
    stakedGlpDistributor = await deployContract("RewardDistributor", [esGmx.address, stakedGlpTracker.address])
    await stakedGlpTracker.initialize([feeGlpTracker.address], stakedGlpDistributor.address)
    await stakedGlpDistributor.updateLastDistributionTime()

    gmxVester = await deployContract("Vester", [
      "Vested GMX", // _name
      "vGMX", // _symbol
      vestingDuration, // _vestingDuration
      esGmx.address, // _esToken
      feeGmxTracker.address, // _pairToken
      gmx.address, // _claimableToken
      stakedGmxTracker.address, // _rewardTracker
    ])

    glpVester = await deployContract("Vester", [
      "Vested GLP", // _name
      "vGLP", // _symbol
      vestingDuration, // _vestingDuration
      esGmx.address, // _esToken
      stakedGlpTracker.address, // _pairToken
      gmx.address, // _claimableToken
      stakedGlpTracker.address, // _rewardTracker
    ])

    await stakedGmxTracker.setInPrivateTransferMode(true)
    await stakedGmxTracker.setInPrivateStakingMode(true)
    await bonusGmxTracker.setInPrivateTransferMode(true)
    await bonusGmxTracker.setInPrivateStakingMode(true)
    await bonusGmxTracker.setInPrivateClaimingMode(true)
    await extendedGmxTracker.setInPrivateTransferMode(true)
    await extendedGmxTracker.setInPrivateStakingMode(true)
    await feeGmxTracker.setInPrivateTransferMode(true)
    await feeGmxTracker.setInPrivateStakingMode(true)

    await feeGlpTracker.setInPrivateTransferMode(true)
    await feeGlpTracker.setInPrivateStakingMode(true)
    await stakedGlpTracker.setInPrivateTransferMode(true)
    await stakedGlpTracker.setInPrivateStakingMode(true)

    await esGmx.setInPrivateTransferMode(true)
    await bnGmx.setInPrivateTransferMode(true)

    mockExternalHandler = await deployContract("MockExternalHandler", [])

    govToken = await deployContract("MintableBaseToken", ["GOV", "GOV", 0])

    rewardRouter = await deployContract("RewardRouterV2", []);

    await rewardRouter.initialize([
      bnb.address,
      gmx.address,
      esGmx.address,
      bnGmx.address,
      glp.address,
      stakedGmxTracker.address,
      bonusGmxTracker.address,
      extendedGmxTracker.address,
      feeGmxTracker.address,
      feeGlpTracker.address,
      stakedGlpTracker.address,
      glpManager.address,
      gmxVester.address,
      glpVester.address,
      mockExternalHandler.address,
      govToken.address
    ])

    // allow bonusGmxTracker to stake stakedGmxTracker
    await stakedGmxTracker.setHandler(bonusGmxTracker.address, true)
    // allow extendedGmxTracker to stake bonusGmxTracker
    await bonusGmxTracker.setHandler(extendedGmxTracker.address, true)
    await bonusGmxDistributor.setBonusMultiplier(10000)
    // allow extendedGmxTracker to stake bnGmx
    await bnGmx.setHandler(extendedGmxTracker.address, true)
    // allow feeGmxTracker to stake extendedGmxTracker
    await extendedGmxTracker.setHandler(feeGmxTracker.address, true)
    // allow stakedGlpTracker to stake feeGlpTracker
    await feeGlpTracker.setHandler(stakedGlpTracker.address, true)
    // allow feeGlpTracker to stake glp
    await glp.setHandler(feeGlpTracker.address, true)

    // mint esGmx for distributors
    await esGmx.setMinter(wallet.address, true)
    await esGmx.mint(stakedGmxDistributor.address, expandDecimals(50000, 18))
    await stakedGmxDistributor.setTokensPerInterval("20667989410000000") // 0.02066798941 esGmx per second
    await esGmx.mint(stakedGlpDistributor.address, expandDecimals(50000, 18))
    await stakedGlpDistributor.setTokensPerInterval("20667989410000000") // 0.02066798941 esGmx per second

    // mint bnGmx for distributor
    await bnGmx.setMinter(wallet.address, true)
    await bnGmx.mint(bonusGmxDistributor.address, expandDecimals(1500, 18))

    await esGmx.setHandler(tokenManager.address, true)
    await gmxVester.setHandler(wallet.address, true)

    await esGmx.setHandler(rewardRouter.address, true)
    await esGmx.setHandler(stakedGmxDistributor.address, true)
    await esGmx.setHandler(stakedGlpDistributor.address, true)
    await esGmx.setHandler(stakedGmxTracker.address, true)
    await esGmx.setHandler(stakedGlpTracker.address, true)
    await esGmx.setHandler(gmxVester.address, true)
    await esGmx.setHandler(glpVester.address, true)

    await bnGmx.setHandler(bonusGmxDistributor.address, true)
    await bnGmx.setHandler(bonusGmxTracker.address, true)

    await glpManager.setHandler(rewardRouter.address, true)
    await stakedGmxTracker.setHandler(rewardRouter.address, true)
    await bonusGmxTracker.setHandler(rewardRouter.address, true)
    await extendedGmxTracker.setHandler(rewardRouter.address, true)
    await feeGmxTracker.setHandler(rewardRouter.address, true)
    await feeGlpTracker.setHandler(rewardRouter.address, true)
    await stakedGlpTracker.setHandler(rewardRouter.address, true)

    await bnGmx.setMinter(rewardRouter.address, true)
    await esGmx.setMinter(gmxVester.address, true)
    await esGmx.setMinter(glpVester.address, true)

    await gmxVester.setHandler(rewardRouter.address, true)
    await glpVester.setHandler(rewardRouter.address, true)

    await feeGmxTracker.setHandler(gmxVester.address, true)
    await stakedGlpTracker.setHandler(glpVester.address, true)

    await glpManager.setGov(timelock.address)
    await stakedGmxTracker.setGov(timelock.address)
    await bonusGmxTracker.setGov(timelock.address)
    await extendedGmxTracker.setGov(timelock.address)
    await feeGmxTracker.setGov(timelock.address)
    await feeGlpTracker.setGov(timelock.address)
    await stakedGlpTracker.setGov(timelock.address)
    await stakedGmxDistributor.setGov(timelock.address)
    await stakedGlpDistributor.setGov(timelock.address)
    await esGmx.setGov(timelock.address)
    await bnGmx.setGov(timelock.address)
    await gmxVester.setGov(timelock.address)
    await glpVester.setGov(timelock.address)

    await rewardRouter.setMaxBoostBasisPoints(20_000)
  })

  it("inits", async () => {
    expect(await rewardRouter.isInitialized()).eq(true)

    expect(await rewardRouter.weth()).eq(bnb.address)
    expect(await rewardRouter.gmx()).eq(gmx.address)
    expect(await rewardRouter.esGmx()).eq(esGmx.address)
    expect(await rewardRouter.bnGmx()).eq(bnGmx.address)

    expect(await rewardRouter.glp()).eq(glp.address)

    expect(await rewardRouter.stakedGmxTracker()).eq(stakedGmxTracker.address)
    expect(await rewardRouter.bonusGmxTracker()).eq(bonusGmxTracker.address)
    expect(await rewardRouter.extendedGmxTracker()).eq(extendedGmxTracker.address)
    expect(await rewardRouter.feeGmxTracker()).eq(feeGmxTracker.address)

    expect(await rewardRouter.feeGlpTracker()).eq(feeGlpTracker.address)
    expect(await rewardRouter.stakedGlpTracker()).eq(stakedGlpTracker.address)

    expect(await rewardRouter.glpManager()).eq(glpManager.address)

    expect(await rewardRouter.gmxVester()).eq(gmxVester.address)
    expect(await rewardRouter.glpVester()).eq(glpVester.address)

    expect(await rewardRouter.externalHandler()).eq(mockExternalHandler.address)

    await expect(rewardRouter.initialize([
      bnb.address,
      gmx.address,
      esGmx.address,
      bnGmx.address,
      glp.address,
      stakedGmxTracker.address,
      bonusGmxTracker.address,
      extendedGmxTracker.address,
      feeGmxTracker.address,
      feeGlpTracker.address,
      stakedGlpTracker.address,
      glpManager.address,
      gmxVester.address,
      glpVester.address,
      mockExternalHandler.address,
      govToken.address
    ])).to.be.revertedWith("already initialized")
  })

  it("setMaxBoostBasisPoints", async () => {
    expect(await rewardRouter.maxBoostBasisPoints()).eq(20_000)
    await expect(rewardRouter.connect(user0).setMaxBoostBasisPoints(50_000))
      .to.be.revertedWith("Governable: forbidden")

    await rewardRouter.connect(wallet).setMaxBoostBasisPoints(50_000)
    expect(await rewardRouter.maxBoostBasisPoints()).eq(50_000)
  })

  it("setInStrictTransferMode", async () => {
    expect(await rewardRouter.inStrictTransferMode()).eq(false)
    await expect(rewardRouter.connect(user0).setInStrictTransferMode(true))
      .to.be.revertedWith("Governable: forbidden")

    await rewardRouter.connect(wallet).setInStrictTransferMode(true)
    expect(await rewardRouter.inStrictTransferMode()).eq(true)
  })

  it("setVotingPowerType", async () => {
    expect(await rewardRouter.votingPowerType()).eq(0)
    await expect(rewardRouter.connect(user0).setVotingPowerType(2))
      .to.be.revertedWith("Governable: forbidden")

    await rewardRouter.connect(wallet).setVotingPowerType(2)
    expect(await rewardRouter.votingPowerType()).eq(2)
  })

  it("batchStakeGmxForAccounts, stakeGmx, stakeEsGmx, unstakeGmx, unstakeEsGmx, claimEsGmx, claimFees, compound, batchCompoundForAccounts", async () => {
    await eth.mint(feeGmxDistributor.address, expandDecimals(100, 18))
    await feeGmxDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await gmx.setMinter(wallet.address, true)

    await gmx.mint(extendedGmxDistributor.address, expandDecimals(200, 18))
    await extendedGmxDistributor.setTokensPerInterval("82671940000000") // 0.00008267194 GMX per second
    expect(await gmx.balanceOf(extendedGmxDistributor.address)).eq(expandDecimals(200, 18))

    await gmx.mint(user0.address, expandDecimals(1500, 18))
    expect(await gmx.balanceOf(user0.address)).eq(expandDecimals(1500, 18))

    await gmx.connect(user0).approve(stakedGmxTracker.address, expandDecimals(1000, 18))
    await expect(rewardRouter.connect(user0).batchStakeGmxForAccounts([user1.address], [expandDecimals(1000, 18)]))
      .to.be.revertedWith("Governable: forbidden")

    await rewardRouter.setGov(user0.address)
    await rewardRouter.connect(user0).batchStakeGmxForAccounts([user1.address], [expandDecimals(800, 18)])
    expect(await gmx.balanceOf(user0.address)).eq(expandDecimals(700, 18))

    await gmx.mint(user1.address, expandDecimals(200, 18))
    expect(await gmx.balanceOf(user1.address)).eq(expandDecimals(200, 18))
    await gmx.connect(user1).approve(stakedGmxTracker.address, expandDecimals(200, 18))
    await rewardRouter.connect(user1).stakeGmx(expandDecimals(200, 18))
    expect(await gmx.balanceOf(user1.address)).eq(0)

    expect(await stakedGmxTracker.stakedAmounts(user0.address)).eq(0)
    expect(await stakedGmxTracker.depositBalances(user0.address, gmx.address)).eq(0)
    expect(await stakedGmxTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).eq(expandDecimals(1000, 18))

    expect(await bonusGmxTracker.stakedAmounts(user0.address)).eq(0)
    expect(await bonusGmxTracker.depositBalances(user0.address, stakedGmxTracker.address)).eq(0)
    expect(await bonusGmxTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await bonusGmxTracker.depositBalances(user1.address, stakedGmxTracker.address)).eq(expandDecimals(1000, 18))

    expect(await extendedGmxTracker.stakedAmounts(user0.address)).eq(0)
    expect(await extendedGmxTracker.depositBalances(user0.address, bonusGmxTracker.address)).eq(0)
    expect(await extendedGmxTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).eq(expandDecimals(1000, 18))

    expect(await feeGmxTracker.stakedAmounts(user0.address)).eq(0)
    expect(await feeGmxTracker.depositBalances(user0.address, extendedGmxTracker.address)).eq(0)
    expect(await feeGmxTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, extendedGmxTracker.address)).eq(expandDecimals(1000, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await stakedGmxTracker.claimable(user0.address)).eq(0)
    expect(await stakedGmxTracker.claimable(user1.address)).gt(expandDecimals(1785, 18)) // 50000 / 28 => ~1785
    expect(await stakedGmxTracker.claimable(user1.address)).lt(expandDecimals(1786, 18))

    expect(await bonusGmxTracker.claimable(user0.address)).eq(0)
    expect(await bonusGmxTracker.claimable(user1.address)).gt("2730000000000000000") // 2.73, 1000 / 365 => ~2.74
    expect(await bonusGmxTracker.claimable(user1.address)).lt("2750000000000000000") // 2.75

    expect(await extendedGmxTracker.claimable(user0.address)).eq(0)
    expect(await extendedGmxTracker.claimable(user1.address)).gt("7130000000000000000") // 7.13, 200 / 28 => ~7.14
    expect(await extendedGmxTracker.claimable(user1.address)).lt("7150000000000000000") // 7.15

    expect(await feeGmxTracker.claimable(user0.address)).eq(0)
    expect(await feeGmxTracker.claimable(user1.address)).gt("3560000000000000000") // 3.56, 100 / 28 => ~3.57
    expect(await feeGmxTracker.claimable(user1.address)).lt("3580000000000000000") // 3.58

    await timelock.signalMint(esGmx.address, tokenManager.address, expandDecimals(500, 18))
    await increaseTime(provider, 20)
    await mineBlock(provider)

    await timelock.processMint(esGmx.address, tokenManager.address, expandDecimals(500, 18))
    await esGmx.connect(tokenManager).transferFrom(tokenManager.address, user2.address, expandDecimals(500, 18))
    await rewardRouter.connect(user2).stakeEsGmx(expandDecimals(500, 18))

    expect(await stakedGmxTracker.stakedAmounts(user0.address)).eq(0)
    expect(await stakedGmxTracker.depositBalances(user0.address, gmx.address)).eq(0)
    expect(await stakedGmxTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).eq(expandDecimals(1000, 18))
    expect(await stakedGmxTracker.stakedAmounts(user2.address)).eq(expandDecimals(500, 18))
    expect(await stakedGmxTracker.depositBalances(user2.address, esGmx.address)).eq(expandDecimals(500, 18))

    expect(await bonusGmxTracker.stakedAmounts(user0.address)).eq(0)
    expect(await bonusGmxTracker.depositBalances(user0.address, stakedGmxTracker.address)).eq(0)
    expect(await bonusGmxTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await bonusGmxTracker.depositBalances(user1.address, stakedGmxTracker.address)).eq(expandDecimals(1000, 18))
    expect(await bonusGmxTracker.stakedAmounts(user2.address)).eq(expandDecimals(500, 18))
    expect(await bonusGmxTracker.depositBalances(user2.address, stakedGmxTracker.address)).eq(expandDecimals(500, 18))

    expect(await extendedGmxTracker.stakedAmounts(user0.address)).eq(0)
    expect(await extendedGmxTracker.depositBalances(user0.address, bonusGmxTracker.address)).eq(0)
    expect(await extendedGmxTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).eq(expandDecimals(1000, 18))
    expect(await extendedGmxTracker.stakedAmounts(user2.address)).eq(expandDecimals(500, 18))
    expect(await extendedGmxTracker.depositBalances(user2.address, bonusGmxTracker.address)).eq(expandDecimals(500, 18))

    expect(await feeGmxTracker.stakedAmounts(user0.address)).eq(0)
    expect(await feeGmxTracker.depositBalances(user0.address, extendedGmxTracker.address)).eq(0)
    expect(await feeGmxTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, extendedGmxTracker.address)).eq(expandDecimals(1000, 18))
    expect(await feeGmxTracker.stakedAmounts(user2.address)).eq(expandDecimals(500, 18))
    expect(await feeGmxTracker.depositBalances(user2.address, extendedGmxTracker.address)).eq(expandDecimals(500, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await stakedGmxTracker.claimable(user0.address)).eq(0)
    expect(await stakedGmxTracker.claimable(user1.address)).gt(expandDecimals(1785 + 1190, 18))
    expect(await stakedGmxTracker.claimable(user1.address)).lt(expandDecimals(1786 + 1191, 18))
    expect(await stakedGmxTracker.claimable(user2.address)).gt(expandDecimals(595, 18))
    expect(await stakedGmxTracker.claimable(user2.address)).lt(expandDecimals(596, 18))

    expect(await bonusGmxTracker.claimable(user0.address)).eq(0)
    expect(await bonusGmxTracker.claimable(user1.address)).gt("5470000000000000000") // 5.47, 1000 / 365 * 2 => ~5.48
    expect(await bonusGmxTracker.claimable(user1.address)).lt("5490000000000000000")
    expect(await bonusGmxTracker.claimable(user2.address)).gt("1360000000000000000") // 1.36, 500 / 365 => ~1.37
    expect(await bonusGmxTracker.claimable(user2.address)).lt("1380000000000000000")

    expect(await extendedGmxTracker.claimable(user0.address)).eq(0)
    expect(await extendedGmxTracker.claimable(user1.address)).gt("11890000000000000000") // 11.89, 7.14 + 200 / 28 / 3 * 2 => ~11.90
    expect(await extendedGmxTracker.claimable(user1.address)).lt("11910000000000000000")
    expect(await extendedGmxTracker.claimable(user2.address)).gt("2370000000000000000") // 2.37, 200 / 28 / 3 => ~2.38
    expect(await extendedGmxTracker.claimable(user2.address)).lt("2390000000000000000")

    expect(await feeGmxTracker.claimable(user0.address)).eq(0)
    expect(await feeGmxTracker.claimable(user1.address)).gt("5940000000000000000") // 5.94, 3.57 + 100 / 28 / 3 * 2 => ~5.95
    expect(await feeGmxTracker.claimable(user1.address)).lt("5960000000000000000")
    expect(await feeGmxTracker.claimable(user2.address)).gt("1180000000000000000") // 1.18, 100 / 28 / 3 => ~1.19
    expect(await feeGmxTracker.claimable(user2.address)).lt("1200000000000000000")

    expect(await esGmx.balanceOf(user1.address)).eq(0)
    await rewardRouter.connect(user1).claimEsGmx()
    expect(await esGmx.balanceOf(user1.address)).gt(expandDecimals(1785 + 1190, 18))
    expect(await esGmx.balanceOf(user1.address)).lt(expandDecimals(1786 + 1191, 18))

    expect(await eth.balanceOf(user1.address)).eq(0)
    expect(await gmx.balanceOf(user1.address)).eq(0)
    await rewardRouter.connect(user1).claimFees()
    expect(await eth.balanceOf(user1.address)).gt("5940000000000000000")
    expect(await eth.balanceOf(user1.address)).lt("5960000000000000000")
    expect(await gmx.balanceOf(user1.address)).gt("11890000000000000000")
    expect(await gmx.balanceOf(user1.address)).lt("11910000000000000000")

    expect(await esGmx.balanceOf(user2.address)).eq(0)
    await rewardRouter.connect(user2).claimEsGmx()
    expect(await esGmx.balanceOf(user2.address)).gt(expandDecimals(595, 18))
    expect(await esGmx.balanceOf(user2.address)).lt(expandDecimals(596, 18))

    expect(await eth.balanceOf(user2.address)).eq(0)
    expect(await gmx.balanceOf(user2.address)).eq(0)
    await rewardRouter.connect(user2).claimFees()
    expect(await eth.balanceOf(user2.address)).gt("1180000000000000000")
    expect(await eth.balanceOf(user2.address)).lt("1200000000000000000")
    expect(await gmx.balanceOf(user2.address)).gt("2370000000000000000")
    expect(await gmx.balanceOf(user2.address)).lt("2390000000000000000")

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    await gmx.connect(user1).approve(stakedGmxTracker.address, maxUint256)
    const tx0 = await rewardRouter.connect(user1).compound()
    await reportGasUsed(provider, tx0, "compound gas used")

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    await gmx.connect(user2).approve(stakedGmxTracker.address, maxUint256)
    const tx1 = await rewardRouter.connect(user0).batchCompoundForAccounts([user1.address, user2.address])
    await reportGasUsed(provider, tx1, "batchCompoundForAccounts gas used")

    expect(await stakedGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(3655, 18))
    expect(await stakedGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(3657, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).gt("1010580000000000000000") // 1010.58
    expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).lt("1010600000000000000000") // 1010.60
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).gt(expandDecimals(2644, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).lt(expandDecimals(2646, 18))

    expect(await bonusGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(3655, 18))
    expect(await bonusGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(3657, 18))

    expect(await extendedGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(3669, 18))
    expect(await extendedGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(3671, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).gt(expandDecimals(3655, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).lt(expandDecimals(3657, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).gt("14100000000000000000") // 14.1
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).lt("14300000000000000000") // 14.3

    expect(await feeGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(3669, 18))
    expect(await feeGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(3671, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, extendedGmxTracker.address)).gt(expandDecimals(3669, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, extendedGmxTracker.address)).lt(expandDecimals(3671, 18))

    expect(await gmx.balanceOf(user1.address)).gt("11890000000000000000")
    expect(await gmx.balanceOf(user1.address)).lt("11910000000000000000")
    await rewardRouter.connect(user1).unstakeGmx(expandDecimals(300, 18))
    expect(await gmx.balanceOf(user1.address)).gt("311890000000000000000")
    expect(await gmx.balanceOf(user1.address)).lt("311910000000000000000")

    expect(await stakedGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(3355, 18))
    expect(await stakedGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(3357, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).gt("710580000000000000000") // 710.58
    expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).lt("710600000000000000000") // 710.60
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).gt(expandDecimals(2644, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).lt(expandDecimals(2646, 18))

    expect(await bonusGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(3355, 18))
    expect(await bonusGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(3357, 18))

    expect(await extendedGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(3368, 18))
    expect(await extendedGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(3370, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).gt(expandDecimals(3355, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).lt(expandDecimals(3357, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).gt("13000000000000000000") // 13
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).lt("13100000000000000000") // 13.1

    expect(await feeGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(3368, 18))
    expect(await feeGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(3370, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, extendedGmxTracker.address)).gt(expandDecimals(3368, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, extendedGmxTracker.address)).lt(expandDecimals(3370, 18))

    const esGmxBalance1 = await esGmx.balanceOf(user1.address)
    const esGmxUnstakeBalance1 = await stakedGmxTracker.depositBalances(user1.address, esGmx.address)
    await rewardRouter.connect(user1).unstakeEsGmx(esGmxUnstakeBalance1)
    expect(await esGmx.balanceOf(user1.address)).eq(esGmxBalance1.add(esGmxUnstakeBalance1))

    expect(await stakedGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(710, 18))
    expect(await stakedGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(711, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).gt("710580000000000000000") // 710.58
    expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).lt("710600000000000000000") // 710.60
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).eq(0)

    expect(await bonusGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(710, 18))
    expect(await bonusGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(711, 18))

    expect(await extendedGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(713, 18))
    expect(await extendedGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(714, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).gt("710580000000000000000") // 710.58
    expect(await extendedGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).lt("710600000000000000000") // 710.60
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).gt("2760000000000000000") // 2.76
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).lt("2780000000000000000") // 2.78

    expect(await feeGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(713, 18))
    expect(await feeGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(714, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, extendedGmxTracker.address)).gt(expandDecimals(713, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, extendedGmxTracker.address)).lt(expandDecimals(714, 18))

    await expect(rewardRouter.connect(user1).unstakeEsGmx(expandDecimals(1, 18)))
      .to.be.revertedWith("RewardTracker: _amount exceeds depositBalance")
  })

  it("mintAndStakeGlp, unstakeAndRedeemGlp, compound, batchCompoundForAccounts", async () => {
    await eth.mint(feeGlpDistributor.address, expandDecimals(100, 18))
    await feeGlpDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await bnb.mint(user1.address, expandDecimals(1, 18))
    await bnb.connect(user1).approve(glpManager.address, expandDecimals(1, 18))
    const tx0 = await rewardRouter.connect(user1).mintAndStakeGlp(
      bnb.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )
    await reportGasUsed(provider, tx0, "mintAndStakeGlp gas used")

    expect(await feeGlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await feeGlpTracker.depositBalances(user1.address, glp.address)).eq(expandDecimals(2991, 17))

    expect(await stakedGlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await stakedGlpTracker.depositBalances(user1.address, feeGlpTracker.address)).eq(expandDecimals(2991, 17))

    await bnb.mint(user1.address, expandDecimals(2, 18))
    await bnb.connect(user1).approve(glpManager.address, expandDecimals(2, 18))
    await rewardRouter.connect(user1).mintAndStakeGlp(
      bnb.address,
      expandDecimals(2, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )

    await increaseTime(provider, 24 * 60 * 60 + 1)
    await mineBlock(provider)

    expect(await feeGlpTracker.claimable(user1.address)).gt("3560000000000000000") // 3.56, 100 / 28 => ~3.57
    expect(await feeGlpTracker.claimable(user1.address)).lt("3580000000000000000") // 3.58

    expect(await stakedGlpTracker.claimable(user1.address)).gt(expandDecimals(1785, 18)) // 50000 / 28 => ~1785
    expect(await stakedGlpTracker.claimable(user1.address)).lt(expandDecimals(1786, 18))

    await bnb.mint(user2.address, expandDecimals(1, 18))
    await bnb.connect(user2).approve(glpManager.address, expandDecimals(1, 18))
    await rewardRouter.connect(user2).mintAndStakeGlp(
      bnb.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )

    await expect(rewardRouter.connect(user2).unstakeAndRedeemGlp(
      bnb.address,
      expandDecimals(299, 18),
      "990000000000000000", // 0.99
      user2.address
    )).to.be.revertedWith("GlpManager: cooldown duration not yet passed")

    expect(await feeGlpTracker.stakedAmounts(user1.address)).eq("897300000000000000000") // 897.3
    expect(await stakedGlpTracker.stakedAmounts(user1.address)).eq("897300000000000000000")
    expect(await bnb.balanceOf(user1.address)).eq(0)

    const tx1 = await rewardRouter.connect(user1).unstakeAndRedeemGlp(
      bnb.address,
      expandDecimals(299, 18),
      "990000000000000000", // 0.99
      user1.address
    )
    await reportGasUsed(provider, tx1, "unstakeAndRedeemGlp gas used")

    expect(await feeGlpTracker.stakedAmounts(user1.address)).eq("598300000000000000000") // 598.3
    expect(await stakedGlpTracker.stakedAmounts(user1.address)).eq("598300000000000000000")
    expect(await bnb.balanceOf(user1.address)).eq("993676666666666666") // ~0.99

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await feeGlpTracker.claimable(user1.address)).gt("5940000000000000000") // 5.94, 3.57 + 100 / 28 / 3 * 2 => ~5.95
    expect(await feeGlpTracker.claimable(user1.address)).lt("5960000000000000000")
    expect(await feeGlpTracker.claimable(user2.address)).gt("1180000000000000000") // 1.18, 100 / 28 / 3 => ~1.19
    expect(await feeGlpTracker.claimable(user2.address)).lt("1200000000000000000")

    expect(await stakedGlpTracker.claimable(user1.address)).gt(expandDecimals(1785 + 1190, 18))
    expect(await stakedGlpTracker.claimable(user1.address)).lt(expandDecimals(1786 + 1191, 18))
    expect(await stakedGlpTracker.claimable(user2.address)).gt(expandDecimals(595, 18))
    expect(await stakedGlpTracker.claimable(user2.address)).lt(expandDecimals(596, 18))

    expect(await esGmx.balanceOf(user1.address)).eq(0)
    await rewardRouter.connect(user1).claimEsGmx()
    expect(await esGmx.balanceOf(user1.address)).gt(expandDecimals(1785 + 1190, 18))
    expect(await esGmx.balanceOf(user1.address)).lt(expandDecimals(1786 + 1191, 18))

    expect(await eth.balanceOf(user1.address)).eq(0)
    await rewardRouter.connect(user1).claimFees()
    expect(await eth.balanceOf(user1.address)).gt("5940000000000000000")
    expect(await eth.balanceOf(user1.address)).lt("5960000000000000000")

    expect(await esGmx.balanceOf(user2.address)).eq(0)
    await rewardRouter.connect(user2).claimEsGmx()
    expect(await esGmx.balanceOf(user2.address)).gt(expandDecimals(595, 18))
    expect(await esGmx.balanceOf(user2.address)).lt(expandDecimals(596, 18))

    expect(await eth.balanceOf(user2.address)).eq(0)
    await rewardRouter.connect(user2).claimFees()
    expect(await eth.balanceOf(user2.address)).gt("1180000000000000000")
    expect(await eth.balanceOf(user2.address)).lt("1200000000000000000")

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    const tx2 = await rewardRouter.connect(user1).compound()
    await reportGasUsed(provider, tx2, "compound gas used")

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    const tx3 = await rewardRouter.batchCompoundForAccounts([user1.address, user2.address])
    await reportGasUsed(provider, tx3, "batchCompoundForAccounts gas used")

    expect(await stakedGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(4165, 18))
    expect(await stakedGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(4167, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).eq(0)
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).gt(expandDecimals(4165, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).lt(expandDecimals(4167, 18))

    expect(await bonusGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(4165, 18))
    expect(await bonusGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(4167, 18))

    expect(await extendedGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(4179, 18))
    expect(await extendedGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(4180, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).gt(expandDecimals(4165, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).lt(expandDecimals(4167, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).gt("12900000000000000000") // 12.9
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).lt("13100000000000000000") // 13.1

    expect(await feeGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(4179, 18))
    expect(await feeGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(4180, 18))

    expect(await feeGlpTracker.stakedAmounts(user1.address)).eq("598300000000000000000") // 598.3
    expect(await stakedGlpTracker.stakedAmounts(user1.address)).eq("598300000000000000000")
    expect(await bnb.balanceOf(user1.address)).eq("993676666666666666") // ~0.99
  })

  it("mintAndStakeGlpETH, unstakeAndRedeemGlpETH", async () => {
    const receiver0 = newWallet()
    await expect(rewardRouter.connect(user0).mintAndStakeGlpETH(expandDecimals(300, 18), expandDecimals(300, 18), { value: 0 }))
      .to.be.revertedWith("invalid msg.value")

    await expect(rewardRouter.connect(user0).mintAndStakeGlpETH(expandDecimals(300, 18), expandDecimals(300, 18), { value: expandDecimals(1, 18) }))
      .to.be.revertedWith("GlpManager: insufficient USDG output")

    await expect(rewardRouter.connect(user0).mintAndStakeGlpETH(expandDecimals(299, 18), expandDecimals(300, 18), { value: expandDecimals(1, 18) }))
      .to.be.revertedWith("GlpManager: insufficient GLP output")

    expect(await bnb.balanceOf(user0.address)).eq(0)
    expect(await bnb.balanceOf(vault.address)).eq(0)
    expect(await bnb.totalSupply()).eq(0)
    expect(await provider.getBalance(bnb.address)).eq(0)
    expect(await stakedGlpTracker.balanceOf(user0.address)).eq(0)

    await rewardRouter.connect(user0).mintAndStakeGlpETH(expandDecimals(299, 18), expandDecimals(299, 18), { value: expandDecimals(1, 18) })

    expect(await bnb.balanceOf(user0.address)).eq(0)
    expect(await bnb.balanceOf(vault.address)).eq(expandDecimals(1, 18))
    expect(await provider.getBalance(bnb.address)).eq(expandDecimals(1, 18))
    expect(await bnb.totalSupply()).eq(expandDecimals(1, 18))
    expect(await stakedGlpTracker.balanceOf(user0.address)).eq("299100000000000000000") // 299.1

    await expect(rewardRouter.connect(user0).unstakeAndRedeemGlpETH(expandDecimals(300, 18), expandDecimals(1, 18), receiver0.address))
      .to.be.revertedWith("RewardTracker: _amount exceeds stakedAmount")

    await expect(rewardRouter.connect(user0).unstakeAndRedeemGlpETH("299100000000000000000", expandDecimals(1, 18), receiver0.address))
      .to.be.revertedWith("GlpManager: cooldown duration not yet passed")

    await increaseTime(provider, 24 * 60 * 60 + 10)

    await expect(rewardRouter.connect(user0).unstakeAndRedeemGlpETH("299100000000000000000", expandDecimals(1, 18), receiver0.address))
      .to.be.revertedWith("GlpManager: insufficient output")

    await rewardRouter.connect(user0).unstakeAndRedeemGlpETH("299100000000000000000", "990000000000000000", receiver0.address)
    expect(await provider.getBalance(receiver0.address)).eq("994009000000000000") // 0.994009
    expect(await bnb.balanceOf(vault.address)).eq("5991000000000000") // 0.005991
    expect(await provider.getBalance(bnb.address)).eq("5991000000000000")
    expect(await bnb.totalSupply()).eq("5991000000000000")
  })

  it("gmx: signalTransfer, acceptTransfer", async () =>{
    await rewardRouter.setVotingPowerType(2)
    await govToken.setMinter(rewardRouter.address, true)

    await gmx.setMinter(wallet.address, true)
    await gmx.mint(user1.address, expandDecimals(200, 18))
    expect(await gmx.balanceOf(user1.address)).eq(expandDecimals(200, 18))
    await gmx.connect(user1).approve(stakedGmxTracker.address, expandDecimals(200, 18))
    await rewardRouter.connect(user1).stakeGmx(expandDecimals(200, 18))
    expect(await gmx.balanceOf(user1.address)).eq(0)

    await gmx.mint(user2.address, expandDecimals(200, 18))
    expect(await gmx.balanceOf(user2.address)).eq(expandDecimals(200, 18))
    await gmx.connect(user2).approve(stakedGmxTracker.address, expandDecimals(400, 18))
    await rewardRouter.connect(user2).stakeGmx(expandDecimals(200, 18))
    expect(await gmx.balanceOf(user2.address)).eq(0)

    await rewardRouter.connect(user2).signalTransfer(user1.address)

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    await rewardRouter.connect(user2).signalTransfer(user1.address)
    await rewardRouter.connect(user1).claim()

    await expect(rewardRouter.connect(user2).signalTransfer(user1.address))
      .to.be.revertedWith("stakedGmxTracker.averageStakedAmounts > 0")

    await rewardRouter.connect(user2).signalTransfer(user3.address)

    await expect(rewardRouter.connect(user3).acceptTransfer(user1.address))
      .to.be.revertedWith("transfer not signalled")

    await gmxVester.setBonusRewards(user2.address, expandDecimals(100, 18))

    expect(await stakedGmxTracker.depositBalances(user2.address, gmx.address)).eq(expandDecimals(200, 18))
    expect(await stakedGmxTracker.depositBalances(user2.address, esGmx.address)).eq(0)
    expect(await extendedGmxTracker.depositBalances(user2.address, bnGmx.address)).eq(0)
    expect(await stakedGmxTracker.depositBalances(user3.address, gmx.address)).eq(0)
    expect(await stakedGmxTracker.depositBalances(user3.address, esGmx.address)).eq(0)
    expect(await extendedGmxTracker.depositBalances(user3.address, bnGmx.address)).eq(0)
    expect(await gmxVester.transferredAverageStakedAmounts(user3.address)).eq(0)
    expect(await gmxVester.transferredCumulativeRewards(user3.address)).eq(0)
    expect(await gmxVester.bonusRewards(user2.address)).eq(expandDecimals(100, 18))
    expect(await gmxVester.bonusRewards(user3.address)).eq(0)
    expect(await gmxVester.getCombinedAverageStakedAmount(user2.address)).eq(0)
    expect(await gmxVester.getCombinedAverageStakedAmount(user3.address)).eq(0)
    expect(await gmxVester.getMaxVestableAmount(user2.address)).eq(expandDecimals(100, 18))
    expect(await gmxVester.getMaxVestableAmount(user3.address)).eq(0)
    expect(await gmxVester.getPairAmount(user2.address, expandDecimals(892, 18))).eq(0)
    expect(await gmxVester.getPairAmount(user3.address, expandDecimals(892, 18))).eq(0)

    expect(await govToken.balanceOf(user2.address)).eq(expandDecimals(200, 18))
    expect(await govToken.balanceOf(user3.address)).eq(0)
    await rewardRouter.connect(user3).acceptTransfer(user2.address)
    expect(await govToken.balanceOf(user2.address)).eq(0)
    expect(await govToken.balanceOf(user3.address)).gt(expandDecimals(1093, 18))
    expect(await govToken.balanceOf(user3.address)).lt(expandDecimals(1094, 18))

    expect(await stakedGmxTracker.depositBalances(user2.address, gmx.address)).eq(0)
    expect(await stakedGmxTracker.depositBalances(user2.address, esGmx.address)).eq(0)
    expect(await extendedGmxTracker.depositBalances(user2.address, bnGmx.address)).eq(0)
    expect(await stakedGmxTracker.depositBalances(user3.address, gmx.address)).eq(expandDecimals(200, 18))
    expect(await stakedGmxTracker.depositBalances(user3.address, esGmx.address)).gt(expandDecimals(892, 18))
    expect(await stakedGmxTracker.depositBalances(user3.address, esGmx.address)).lt(expandDecimals(893, 18))
    expect(await extendedGmxTracker.depositBalances(user3.address, bnGmx.address)).gt("547000000000000000") // 0.547
    expect(await extendedGmxTracker.depositBalances(user3.address, bnGmx.address)).lt("549000000000000000") // 0.548
    expect(await gmxVester.transferredAverageStakedAmounts(user3.address)).eq(expandDecimals(200, 18))
    expect(await gmxVester.transferredCumulativeRewards(user3.address)).gt(expandDecimals(892, 18))
    expect(await gmxVester.transferredCumulativeRewards(user3.address)).lt(expandDecimals(893, 18))
    expect(await gmxVester.bonusRewards(user2.address)).eq(0)
    expect(await gmxVester.bonusRewards(user3.address)).eq(expandDecimals(100, 18))
    expect(await gmxVester.getCombinedAverageStakedAmount(user2.address)).eq(expandDecimals(200, 18))
    expect(await gmxVester.getCombinedAverageStakedAmount(user3.address)).eq(expandDecimals(200, 18))
    expect(await gmxVester.getMaxVestableAmount(user2.address)).eq(0)
    expect(await gmxVester.getMaxVestableAmount(user3.address)).gt(expandDecimals(992, 18))
    expect(await gmxVester.getMaxVestableAmount(user3.address)).lt(expandDecimals(993, 18))
    expect(await gmxVester.getPairAmount(user2.address, expandDecimals(992, 18))).eq(0)
    expect(await gmxVester.getPairAmount(user3.address, expandDecimals(992, 18))).gt(expandDecimals(199, 18))
    expect(await gmxVester.getPairAmount(user3.address, expandDecimals(992, 18))).lt(expandDecimals(200, 18))

    await gmx.connect(user3).approve(stakedGmxTracker.address, expandDecimals(400, 18))
    await rewardRouter.connect(user3).signalTransfer(user4.address)

    expect(await govToken.balanceOf(user3.address)).gt(expandDecimals(1093, 18))
    expect(await govToken.balanceOf(user3.address)).lt(expandDecimals(1094, 18))
    expect(await govToken.balanceOf(user4.address)).eq(0)
    await rewardRouter.connect(user4).acceptTransfer(user3.address)
    expect(await govToken.balanceOf(user3.address)).eq(0)
    expect(await govToken.balanceOf(user4.address)).gt(expandDecimals(1093, 18))
    expect(await govToken.balanceOf(user4.address)).lt(expandDecimals(1094, 18))

    expect(await stakedGmxTracker.depositBalances(user3.address, gmx.address)).eq(0)
    expect(await stakedGmxTracker.depositBalances(user3.address, esGmx.address)).eq(0)
    expect(await extendedGmxTracker.depositBalances(user3.address, bnGmx.address)).eq(0)
    expect(await stakedGmxTracker.depositBalances(user4.address, gmx.address)).eq(expandDecimals(200, 18))
    expect(await stakedGmxTracker.depositBalances(user4.address, esGmx.address)).gt(expandDecimals(892, 18))
    expect(await stakedGmxTracker.depositBalances(user4.address, esGmx.address)).lt(expandDecimals(894, 18))
    expect(await extendedGmxTracker.depositBalances(user4.address, bnGmx.address)).gt("547000000000000000") // 0.547
    expect(await extendedGmxTracker.depositBalances(user4.address, bnGmx.address)).lt("549000000000000000") // 0.548
    expect(await gmxVester.transferredAverageStakedAmounts(user4.address)).gt(expandDecimals(200, 18))
    expect(await gmxVester.transferredAverageStakedAmounts(user4.address)).lt(expandDecimals(201, 18))
    expect(await gmxVester.transferredCumulativeRewards(user4.address)).gt(expandDecimals(892, 18))
    expect(await gmxVester.transferredCumulativeRewards(user4.address)).lt(expandDecimals(894, 18))
    expect(await gmxVester.bonusRewards(user3.address)).eq(0)
    expect(await gmxVester.bonusRewards(user4.address)).eq(expandDecimals(100, 18))
    expect(await stakedGmxTracker.averageStakedAmounts(user3.address)).gt(expandDecimals(1092, 18))
    expect(await stakedGmxTracker.averageStakedAmounts(user3.address)).lt(expandDecimals(1094, 18))
    expect(await gmxVester.transferredAverageStakedAmounts(user3.address)).eq(0)
    expect(await gmxVester.getCombinedAverageStakedAmount(user3.address)).gt(expandDecimals(1092, 18))
    expect(await gmxVester.getCombinedAverageStakedAmount(user3.address)).lt(expandDecimals(1094, 18))
    expect(await gmxVester.getCombinedAverageStakedAmount(user4.address)).gt(expandDecimals(200, 18))
    expect(await gmxVester.getCombinedAverageStakedAmount(user4.address)).lt(expandDecimals(201, 18))
    expect(await gmxVester.getMaxVestableAmount(user3.address)).eq(0)
    expect(await gmxVester.getMaxVestableAmount(user4.address)).gt(expandDecimals(992, 18))
    expect(await gmxVester.getMaxVestableAmount(user4.address)).lt(expandDecimals(994, 18))
    expect(await gmxVester.getPairAmount(user3.address, expandDecimals(992, 18))).eq(0)
    expect(await gmxVester.getPairAmount(user4.address, expandDecimals(992, 18))).gt(expandDecimals(199, 18))
    expect(await gmxVester.getPairAmount(user4.address, expandDecimals(992, 18))).lt(expandDecimals(200, 18))

    await expect(rewardRouter.connect(user4).acceptTransfer(user3.address))
      .to.be.revertedWith("transfer not signalled")
  })

  it("gmx, glp: signalTransfer, acceptTransfer", async () =>{
    await gmx.setMinter(wallet.address, true)
    await gmx.mint(gmxVester.address, expandDecimals(10000, 18))
    await gmx.mint(glpVester.address, expandDecimals(10000, 18))
    await eth.mint(feeGlpDistributor.address, expandDecimals(100, 18))
    await feeGlpDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await bnb.mint(user1.address, expandDecimals(1, 18))
    await bnb.connect(user1).approve(glpManager.address, expandDecimals(1, 18))
    await rewardRouter.connect(user1).mintAndStakeGlp(
      bnb.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )

    await bnb.mint(user2.address, expandDecimals(1, 18))
    await bnb.connect(user2).approve(glpManager.address, expandDecimals(1, 18))
    await rewardRouter.connect(user2).mintAndStakeGlp(
      bnb.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )

    await gmx.mint(user1.address, expandDecimals(200, 18))
    expect(await gmx.balanceOf(user1.address)).eq(expandDecimals(200, 18))
    await gmx.connect(user1).approve(stakedGmxTracker.address, expandDecimals(200, 18))
    await rewardRouter.connect(user1).stakeGmx(expandDecimals(200, 18))
    expect(await gmx.balanceOf(user1.address)).eq(0)

    await gmx.mint(user2.address, expandDecimals(200, 18))
    expect(await gmx.balanceOf(user2.address)).eq(expandDecimals(200, 18))
    await gmx.connect(user2).approve(stakedGmxTracker.address, expandDecimals(400, 18))
    await rewardRouter.connect(user2).stakeGmx(expandDecimals(200, 18))
    expect(await gmx.balanceOf(user2.address)).eq(0)

    expect(await feeGmxTracker.stakedAmounts(user2.address)).eq(expandDecimals(200, 18))

    await rewardRouter.setInStrictTransferMode(true)
    await expect(rewardRouter.connect(user2).signalTransfer(user1.address))
      .to.be.revertedWith("insufficient allowance")

    await feeGmxTracker.connect(user2).approve(user1.address, expandDecimals(150, 18))

    await expect(rewardRouter.connect(user2).signalTransfer(user1.address))
      .to.be.revertedWith("insufficient allowance")

    await feeGmxTracker.connect(user2).approve(user1.address, expandDecimals(2000, 18))

    await rewardRouter.connect(user2).signalTransfer(user1.address)

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    await rewardRouter.connect(user2).signalTransfer(user1.address)
    await rewardRouter.connect(user1).compound()

    await expect(rewardRouter.connect(user2).signalTransfer(user1.address))
      .to.be.revertedWith("stakedGmxTracker.averageStakedAmounts > 0")

    await feeGmxTracker.connect(user2).approve(user3.address, expandDecimals(2000, 18))

    await rewardRouter.connect(user2).signalTransfer(user3.address)

    await expect(rewardRouter.connect(user3).acceptTransfer(user1.address))
      .to.be.revertedWith("transfer not signalled")

    await gmxVester.setBonusRewards(user2.address, expandDecimals(100, 18))

    expect(await stakedGmxTracker.depositBalances(user2.address, gmx.address)).eq(expandDecimals(200, 18))
    expect(await stakedGmxTracker.depositBalances(user2.address, esGmx.address)).eq(0)
    expect(await stakedGmxTracker.depositBalances(user3.address, gmx.address)).eq(0)
    expect(await stakedGmxTracker.depositBalances(user3.address, esGmx.address)).eq(0)

    expect(await extendedGmxTracker.depositBalances(user2.address, bnGmx.address)).eq(0)
    expect(await extendedGmxTracker.depositBalances(user3.address, bnGmx.address)).eq(0)

    expect(await feeGlpTracker.depositBalances(user2.address, glp.address)).eq("299100000000000000000") // 299.1
    expect(await feeGlpTracker.depositBalances(user3.address, glp.address)).eq(0)

    expect(await stakedGlpTracker.depositBalances(user2.address, feeGlpTracker.address)).eq("299100000000000000000") // 299.1
    expect(await stakedGlpTracker.depositBalances(user3.address, feeGlpTracker.address)).eq(0)

    expect(await gmxVester.transferredAverageStakedAmounts(user3.address)).eq(0)
    expect(await gmxVester.transferredCumulativeRewards(user3.address)).eq(0)
    expect(await gmxVester.bonusRewards(user2.address)).eq(expandDecimals(100, 18))
    expect(await gmxVester.bonusRewards(user3.address)).eq(0)
    expect(await gmxVester.getCombinedAverageStakedAmount(user2.address)).eq(0)
    expect(await gmxVester.getCombinedAverageStakedAmount(user3.address)).eq(0)
    expect(await gmxVester.getMaxVestableAmount(user2.address)).eq(expandDecimals(100, 18))
    expect(await gmxVester.getMaxVestableAmount(user3.address)).eq(0)
    expect(await gmxVester.getPairAmount(user2.address, expandDecimals(892, 18))).eq(0)
    expect(await gmxVester.getPairAmount(user3.address, expandDecimals(892, 18))).eq(0)

    await rewardRouter.connect(user3).acceptTransfer(user2.address)

    expect(await stakedGmxTracker.depositBalances(user2.address, gmx.address)).eq(0)
    expect(await stakedGmxTracker.depositBalances(user2.address, esGmx.address)).eq(0)
    expect(await stakedGmxTracker.depositBalances(user3.address, gmx.address)).eq(expandDecimals(200, 18))
    expect(await stakedGmxTracker.depositBalances(user3.address, esGmx.address)).gt(expandDecimals(1786, 18))
    expect(await stakedGmxTracker.depositBalances(user3.address, esGmx.address)).lt(expandDecimals(1787, 18))

    expect(await extendedGmxTracker.depositBalances(user2.address, bnGmx.address)).eq(0)
    expect(await extendedGmxTracker.depositBalances(user3.address, bnGmx.address)).gt("547000000000000000") // 0.547
    expect(await extendedGmxTracker.depositBalances(user3.address, bnGmx.address)).lt("549000000000000000") // 0.548

    expect(await feeGlpTracker.depositBalances(user2.address, glp.address)).eq(0)
    expect(await feeGlpTracker.depositBalances(user3.address, glp.address)).eq("299100000000000000000") // 299.1

    expect(await stakedGlpTracker.depositBalances(user2.address, feeGlpTracker.address)).eq(0)
    expect(await stakedGlpTracker.depositBalances(user3.address, feeGlpTracker.address)).eq("299100000000000000000") // 299.1

    expect(await gmxVester.transferredAverageStakedAmounts(user3.address)).eq(expandDecimals(200, 18))
    expect(await gmxVester.transferredCumulativeRewards(user3.address)).gt(expandDecimals(892, 18))
    expect(await gmxVester.transferredCumulativeRewards(user3.address)).lt(expandDecimals(893, 18))
    expect(await gmxVester.bonusRewards(user2.address)).eq(0)
    expect(await gmxVester.bonusRewards(user3.address)).eq(expandDecimals(100, 18))
    expect(await gmxVester.getCombinedAverageStakedAmount(user2.address)).eq(expandDecimals(200, 18))
    expect(await gmxVester.getCombinedAverageStakedAmount(user3.address)).eq(expandDecimals(200, 18))
    expect(await gmxVester.getMaxVestableAmount(user2.address)).eq(0)
    expect(await gmxVester.getMaxVestableAmount(user3.address)).gt(expandDecimals(992, 18))
    expect(await gmxVester.getMaxVestableAmount(user3.address)).lt(expandDecimals(993, 18))
    expect(await gmxVester.getPairAmount(user2.address, expandDecimals(992, 18))).eq(0)
    expect(await gmxVester.getPairAmount(user3.address, expandDecimals(992, 18))).gt(expandDecimals(199, 18))
    expect(await gmxVester.getPairAmount(user3.address, expandDecimals(992, 18))).lt(expandDecimals(200, 18))
    expect(await gmxVester.getPairAmount(user1.address, expandDecimals(892, 18))).gt(expandDecimals(199, 18))
    expect(await gmxVester.getPairAmount(user1.address, expandDecimals(892, 18))).lt(expandDecimals(200, 18))

    await rewardRouter.connect(user1).compound()

    await expect(rewardRouter.connect(user3).acceptTransfer(user1.address))
      .to.be.revertedWith("transfer not signalled")

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    await rewardRouter.connect(user1).claim()
    await rewardRouter.connect(user2).claim()
    await rewardRouter.connect(user3).claim()

    expect(await gmxVester.getCombinedAverageStakedAmount(user1.address)).gt(expandDecimals(1092, 18))
    expect(await gmxVester.getCombinedAverageStakedAmount(user1.address)).lt(expandDecimals(1094, 18))
    expect(await gmxVester.getCombinedAverageStakedAmount(user3.address)).gt(expandDecimals(1092, 18))
    expect(await gmxVester.getCombinedAverageStakedAmount(user3.address)).lt(expandDecimals(1094, 18))

    expect(await gmxVester.getMaxVestableAmount(user2.address)).eq(0)
    expect(await gmxVester.getMaxVestableAmount(user3.address)).gt(expandDecimals(1885, 18))
    expect(await gmxVester.getMaxVestableAmount(user3.address)).lt(expandDecimals(1887, 18))
    expect(await gmxVester.getMaxVestableAmount(user1.address)).gt(expandDecimals(1785, 18))
    expect(await gmxVester.getMaxVestableAmount(user1.address)).lt(expandDecimals(1787, 18))

    expect(await gmxVester.getPairAmount(user2.address, expandDecimals(992, 18))).eq(0)
    expect(await gmxVester.getPairAmount(user3.address, expandDecimals(1885, 18))).gt(expandDecimals(1092, 18))
    expect(await gmxVester.getPairAmount(user3.address, expandDecimals(1885, 18))).lt(expandDecimals(1094, 18))
    expect(await gmxVester.getPairAmount(user1.address, expandDecimals(1785, 18))).gt(expandDecimals(1092, 18))
    expect(await gmxVester.getPairAmount(user1.address, expandDecimals(1785, 18))).lt(expandDecimals(1094, 18))

    await rewardRouter.connect(user1).compound()
    await rewardRouter.connect(user3).compound()

    expect(await feeGmxTracker.balanceOf(user1.address)).gt(expandDecimals(1992, 18))
    expect(await feeGmxTracker.balanceOf(user1.address)).lt(expandDecimals(1993, 18))

    await gmxVester.connect(user1).deposit(expandDecimals(1785, 18))

    expect(await feeGmxTracker.balanceOf(user1.address)).gt(expandDecimals(1991 - 1092, 18)) // 899
    expect(await feeGmxTracker.balanceOf(user1.address)).lt(expandDecimals(1993 - 1092, 18)) // 901

    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).gt(expandDecimals(4, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).lt(expandDecimals(6, 18))

    await rewardRouter.connect(user1).unstakeGmx(expandDecimals(200, 18))
    await expect(rewardRouter.connect(user1).unstakeEsGmx(expandDecimals(699, 18)))
      .to.be.revertedWith("RewardTracker: burn amount exceeds balance")

    await rewardRouter.connect(user1).unstakeEsGmx(expandDecimals(599, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await feeGmxTracker.balanceOf(user1.address)).gt(expandDecimals(97, 18))
    expect(await feeGmxTracker.balanceOf(user1.address)).lt(expandDecimals(99, 18))

    expect(await esGmx.balanceOf(user1.address)).gt(expandDecimals(599, 18))
    expect(await esGmx.balanceOf(user1.address)).lt(expandDecimals(601, 18))

    expect(await gmx.balanceOf(user1.address)).eq(expandDecimals(200, 18))

    await gmxVester.connect(user1).withdraw()

    expect(await feeGmxTracker.balanceOf(user1.address)).gt(expandDecimals(1190, 18)) // 1190 - 98 => 1092
    expect(await feeGmxTracker.balanceOf(user1.address)).lt(expandDecimals(1191, 18))

    expect(await esGmx.balanceOf(user1.address)).gt(expandDecimals(2378, 18))
    expect(await esGmx.balanceOf(user1.address)).lt(expandDecimals(2380, 18))

    expect(await gmx.balanceOf(user1.address)).gt(expandDecimals(204, 18))
    expect(await gmx.balanceOf(user1.address)).lt(expandDecimals(206, 18))

    expect(await glpVester.getMaxVestableAmount(user3.address)).gt(expandDecimals(1785, 18))
    expect(await glpVester.getMaxVestableAmount(user3.address)).lt(expandDecimals(1787, 18))

    expect(await glpVester.getPairAmount(user3.address, expandDecimals(1785, 18))).gt(expandDecimals(298, 18))
    expect(await glpVester.getPairAmount(user3.address, expandDecimals(1785, 18))).lt(expandDecimals(300, 18))

    expect(await stakedGlpTracker.balanceOf(user3.address)).eq("299100000000000000000")

    expect(await esGmx.balanceOf(user3.address)).gt(expandDecimals(1785, 18))
    expect(await esGmx.balanceOf(user3.address)).lt(expandDecimals(1787, 18))

    expect(await gmx.balanceOf(user3.address)).eq(0)

    await glpVester.connect(user3).deposit(expandDecimals(1785, 18))

    expect(await stakedGlpTracker.balanceOf(user3.address)).gt(0)
    expect(await stakedGlpTracker.balanceOf(user3.address)).lt(expandDecimals(1, 18))

    expect(await esGmx.balanceOf(user3.address)).gt(0)
    expect(await esGmx.balanceOf(user3.address)).lt(expandDecimals(1, 18))

    expect(await gmx.balanceOf(user3.address)).eq(0)

    await expect(rewardRouter.connect(user3).unstakeAndRedeemGlp(
      bnb.address,
      expandDecimals(1, 18),
      0,
      user3.address
    )).to.be.revertedWith("RewardTracker: burn amount exceeds balance")

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    await glpVester.connect(user3).withdraw()

    expect(await stakedGlpTracker.balanceOf(user3.address)).eq("299100000000000000000")

    expect(await esGmx.balanceOf(user3.address)).gt(expandDecimals(1785 - 5, 18))
    expect(await esGmx.balanceOf(user3.address)).lt(expandDecimals(1787 - 5, 18))

    expect(await gmx.balanceOf(user3.address)).gt(expandDecimals(4, 18))
    expect(await gmx.balanceOf(user3.address)).lt(expandDecimals(6, 18))

    expect(await feeGmxTracker.balanceOf(user1.address)).gt(expandDecimals(1190, 18))
    expect(await feeGmxTracker.balanceOf(user1.address)).lt(expandDecimals(1191, 18))

    expect(await esGmx.balanceOf(user1.address)).gt(expandDecimals(2379, 18))
    expect(await esGmx.balanceOf(user1.address)).lt(expandDecimals(2381, 18))

    expect(await gmx.balanceOf(user1.address)).gt(expandDecimals(204, 18))
    expect(await gmx.balanceOf(user1.address)).lt(expandDecimals(206, 18))

    await gmxVester.connect(user1).deposit(expandDecimals(365 * 2, 18))

    expect(await feeGmxTracker.balanceOf(user1.address)).gt(expandDecimals(743, 18)) // 1190 - 743 => 447
    expect(await feeGmxTracker.balanceOf(user1.address)).lt(expandDecimals(754, 18))

    expect(await gmxVester.claimable(user1.address)).eq(0)

    await increaseTime(provider, 48 * 60 * 60)
    await mineBlock(provider)

    expect(await gmxVester.claimable(user1.address)).gt("3900000000000000000") // 3.9
    expect(await gmxVester.claimable(user1.address)).lt("4100000000000000000") // 4.1

    await gmxVester.connect(user1).deposit(expandDecimals(365, 18))

    expect(await feeGmxTracker.balanceOf(user1.address)).gt(expandDecimals(522, 18)) // 743 - 522 => 221
    expect(await feeGmxTracker.balanceOf(user1.address)).lt(expandDecimals(524, 18))

    await increaseTime(provider, 48 * 60 * 60)
    await mineBlock(provider)

    expect(await gmxVester.claimable(user1.address)).gt("9900000000000000000") // 9.9
    expect(await gmxVester.claimable(user1.address)).lt("10100000000000000000") // 10.1

    expect(await gmx.balanceOf(user1.address)).gt(expandDecimals(204, 18))
    expect(await gmx.balanceOf(user1.address)).lt(expandDecimals(206, 18))

    await gmxVester.connect(user1).claim()

    expect(await gmx.balanceOf(user1.address)).gt(expandDecimals(214, 18))
    expect(await gmx.balanceOf(user1.address)).lt(expandDecimals(216, 18))

    await gmxVester.connect(user1).deposit(expandDecimals(365, 18))
    expect(await gmxVester.balanceOf(user1.address)).gt(expandDecimals(1449, 18)) // 365 * 4 => 1460, 1460 - 10 => 1450
    expect(await gmxVester.balanceOf(user1.address)).lt(expandDecimals(1451, 18))
    expect(await gmxVester.getVestedAmount(user1.address)).eq(expandDecimals(1460, 18))

    expect(await feeGmxTracker.balanceOf(user1.address)).gt(expandDecimals(303, 18)) // 522 - 303 => 219
    expect(await feeGmxTracker.balanceOf(user1.address)).lt(expandDecimals(304, 18))

    await increaseTime(provider, 48 * 60 * 60)
    await mineBlock(provider)

    expect(await gmxVester.claimable(user1.address)).gt("7900000000000000000") // 7.9
    expect(await gmxVester.claimable(user1.address)).lt("8100000000000000000") // 8.1

    await gmxVester.connect(user1).withdraw()

    expect(await feeGmxTracker.balanceOf(user1.address)).gt(expandDecimals(1190, 18))
    expect(await feeGmxTracker.balanceOf(user1.address)).lt(expandDecimals(1191, 18))

    expect(await gmx.balanceOf(user1.address)).gt(expandDecimals(222, 18))
    expect(await gmx.balanceOf(user1.address)).lt(expandDecimals(224, 18))

    expect(await esGmx.balanceOf(user1.address)).gt(expandDecimals(2360, 18))
    expect(await esGmx.balanceOf(user1.address)).lt(expandDecimals(2362, 18))

    await gmxVester.connect(user1).deposit(expandDecimals(365, 18))

    await increaseTime(provider, 500 * 24 * 60 * 60)
    await mineBlock(provider)

    expect(await gmxVester.claimable(user1.address)).eq(expandDecimals(365, 18))

    await gmxVester.connect(user1).withdraw()

    expect(await gmx.balanceOf(user1.address)).gt(expandDecimals(222 + 365, 18))
    expect(await gmx.balanceOf(user1.address)).lt(expandDecimals(224 + 365, 18))

    expect(await esGmx.balanceOf(user1.address)).gt(expandDecimals(2360 - 365, 18))
    expect(await esGmx.balanceOf(user1.address)).lt(expandDecimals(2362 - 365, 18))

    expect(await gmxVester.transferredAverageStakedAmounts(user2.address)).eq(0)
    expect(await gmxVester.transferredAverageStakedAmounts(user3.address)).eq(expandDecimals(200, 18))
    expect(await stakedGmxTracker.cumulativeRewards(user2.address)).gt(expandDecimals(892, 18))
    expect(await stakedGmxTracker.cumulativeRewards(user2.address)).lt(expandDecimals(893, 18))
    expect(await stakedGmxTracker.cumulativeRewards(user3.address)).gt(expandDecimals(892, 18))
    expect(await stakedGmxTracker.cumulativeRewards(user3.address)).lt(expandDecimals(893, 18))
    expect(await gmxVester.transferredCumulativeRewards(user3.address)).gt(expandDecimals(892, 18))
    expect(await gmxVester.transferredCumulativeRewards(user3.address)).lt(expandDecimals(893, 18))
    expect(await gmxVester.bonusRewards(user2.address)).eq(0)
    expect(await gmxVester.bonusRewards(user3.address)).eq(expandDecimals(100, 18))
    expect(await gmxVester.getCombinedAverageStakedAmount(user2.address)).eq(expandDecimals(200, 18))
    expect(await gmxVester.getCombinedAverageStakedAmount(user3.address)).gt(expandDecimals(1092, 18))
    expect(await gmxVester.getCombinedAverageStakedAmount(user3.address)).lt(expandDecimals(1093, 18))
    expect(await gmxVester.getMaxVestableAmount(user2.address)).eq(0)
    expect(await gmxVester.getMaxVestableAmount(user3.address)).gt(expandDecimals(1884, 18))
    expect(await gmxVester.getMaxVestableAmount(user3.address)).lt(expandDecimals(1886, 18))
    expect(await gmxVester.getPairAmount(user2.address, expandDecimals(992, 18))).eq(0)
    expect(await gmxVester.getPairAmount(user3.address, expandDecimals(992, 18))).gt(expandDecimals(574, 18))
    expect(await gmxVester.getPairAmount(user3.address, expandDecimals(992, 18))).lt(expandDecimals(575, 18))
    expect(await gmxVester.getPairAmount(user1.address, expandDecimals(892, 18))).gt(expandDecimals(545, 18))
    expect(await gmxVester.getPairAmount(user1.address, expandDecimals(892, 18))).lt(expandDecimals(546, 18))

    const esGmxBatchSender = await deployContract("EsGmxBatchSender", [esGmx.address])

    await timelock.signalSetHandler(esGmx.address, esGmxBatchSender.address, true)
    await timelock.signalSetHandler(gmxVester.address, esGmxBatchSender.address, true)
    await timelock.signalSetHandler(glpVester.address, esGmxBatchSender.address, true)
    await timelock.signalMint(esGmx.address, wallet.address, expandDecimals(1000, 18))

    await increaseTime(provider, 20)
    await mineBlock(provider)

    await timelock.setHandler(esGmx.address, esGmxBatchSender.address, true)
    await timelock.setHandler(gmxVester.address, esGmxBatchSender.address, true)
    await timelock.setHandler(glpVester.address, esGmxBatchSender.address, true)
    await timelock.processMint(esGmx.address, wallet.address, expandDecimals(1000, 18))

    await esGmxBatchSender.connect(wallet).send(
      gmxVester.address,
      4,
      [user2.address, user3.address],
      [expandDecimals(100, 18), expandDecimals(200, 18)]
    )

    expect(await gmxVester.transferredAverageStakedAmounts(user2.address)).gt(expandDecimals(37651, 18))
    expect(await gmxVester.transferredAverageStakedAmounts(user2.address)).lt(expandDecimals(37653, 18))
    expect(await gmxVester.transferredAverageStakedAmounts(user3.address)).gt(expandDecimals(12810, 18))
    expect(await gmxVester.transferredAverageStakedAmounts(user3.address)).lt(expandDecimals(12811, 18))
    expect(await gmxVester.transferredCumulativeRewards(user2.address)).eq(expandDecimals(100, 18))
    expect(await gmxVester.transferredCumulativeRewards(user3.address)).gt(expandDecimals(892 + 200, 18))
    expect(await gmxVester.transferredCumulativeRewards(user3.address)).lt(expandDecimals(893 + 200, 18))
    expect(await gmxVester.bonusRewards(user2.address)).eq(0)
    expect(await gmxVester.bonusRewards(user3.address)).eq(expandDecimals(100, 18))
    expect(await gmxVester.getCombinedAverageStakedAmount(user2.address)).gt(expandDecimals(3971, 18))
    expect(await gmxVester.getCombinedAverageStakedAmount(user2.address)).lt(expandDecimals(3972, 18))
    expect(await gmxVester.getCombinedAverageStakedAmount(user3.address)).gt(expandDecimals(7943, 18))
    expect(await gmxVester.getCombinedAverageStakedAmount(user3.address)).lt(expandDecimals(7944, 18))
    expect(await gmxVester.getMaxVestableAmount(user2.address)).eq(expandDecimals(100, 18))
    expect(await gmxVester.getMaxVestableAmount(user3.address)).gt(expandDecimals(1884 + 200, 18))
    expect(await gmxVester.getMaxVestableAmount(user3.address)).lt(expandDecimals(1886 + 200, 18))
    expect(await gmxVester.getPairAmount(user2.address, expandDecimals(100, 18))).gt(expandDecimals(3971, 18))
    expect(await gmxVester.getPairAmount(user2.address, expandDecimals(100, 18))).lt(expandDecimals(3972, 18))
    expect(await gmxVester.getPairAmount(user3.address, expandDecimals(1884 + 200, 18))).gt(expandDecimals(7936, 18))
    expect(await gmxVester.getPairAmount(user3.address, expandDecimals(1884 + 200, 18))).lt(expandDecimals(7937, 18))

    expect(await glpVester.transferredAverageStakedAmounts(user4.address)).eq(0)
    expect(await glpVester.transferredCumulativeRewards(user4.address)).eq(0)
    expect(await glpVester.bonusRewards(user4.address)).eq(0)
    expect(await glpVester.getCombinedAverageStakedAmount(user4.address)).eq(0)
    expect(await glpVester.getMaxVestableAmount(user4.address)).eq(0)
    expect(await glpVester.getPairAmount(user4.address, expandDecimals(10, 18))).eq(0)

    await esGmxBatchSender.connect(wallet).send(
      glpVester.address,
      320,
      [user4.address],
      [expandDecimals(10, 18)]
    )

    expect(await glpVester.transferredAverageStakedAmounts(user4.address)).eq(expandDecimals(3200, 18))
    expect(await glpVester.transferredCumulativeRewards(user4.address)).eq(expandDecimals(10, 18))
    expect(await glpVester.bonusRewards(user4.address)).eq(0)
    expect(await glpVester.getCombinedAverageStakedAmount(user4.address)).eq(expandDecimals(3200, 18))
    expect(await glpVester.getMaxVestableAmount(user4.address)).eq(expandDecimals(10, 18))
    expect(await glpVester.getPairAmount(user4.address, expandDecimals(10, 18))).eq(expandDecimals(3200, 18))

    await esGmxBatchSender.connect(wallet).send(
      glpVester.address,
      320,
      [user4.address],
      [expandDecimals(10, 18)]
    )

    expect(await glpVester.transferredAverageStakedAmounts(user4.address)).eq(expandDecimals(6400, 18))
    expect(await glpVester.transferredCumulativeRewards(user4.address)).eq(expandDecimals(20, 18))
    expect(await glpVester.bonusRewards(user4.address)).eq(0)
    expect(await glpVester.getCombinedAverageStakedAmount(user4.address)).eq(expandDecimals(6400, 18))
    expect(await glpVester.getMaxVestableAmount(user4.address)).eq(expandDecimals(20, 18))
    expect(await glpVester.getPairAmount(user4.address, expandDecimals(10, 18))).eq(expandDecimals(3200, 18))
  })

  it("handleRewards", async () => {
    const timelockV2 = wallet

    // use new rewardRouter, use eth for weth
    const rewardRouterV2 = await deployContract("RewardRouterV2", []);
    await rewardRouterV2.initialize([
      eth.address,
      gmx.address,
      esGmx.address,
      bnGmx.address,
      glp.address,
      stakedGmxTracker.address,
      bonusGmxTracker.address,
      extendedGmxTracker.address,
      feeGmxTracker.address,
      feeGlpTracker.address,
      stakedGlpTracker.address,
      glpManager.address,
      gmxVester.address,
      glpVester.address,
      mockExternalHandler.address,
      govToken.address
    ])

    await rewardRouterV2.setMaxBoostBasisPoints(20_000)

    await timelock.signalSetGov(glpManager.address, timelockV2.address)
    await timelock.signalSetGov(stakedGmxTracker.address, timelockV2.address)
    await timelock.signalSetGov(bonusGmxTracker.address, timelockV2.address)
    await timelock.signalSetGov(extendedGmxTracker.address, timelockV2.address)
    await timelock.signalSetGov(feeGmxTracker.address, timelockV2.address)
    await timelock.signalSetGov(feeGlpTracker.address, timelockV2.address)
    await timelock.signalSetGov(stakedGlpTracker.address, timelockV2.address)
    await timelock.signalSetGov(stakedGmxDistributor.address, timelockV2.address)
    await timelock.signalSetGov(stakedGlpDistributor.address, timelockV2.address)
    await timelock.signalSetGov(esGmx.address, timelockV2.address)
    await timelock.signalSetGov(bnGmx.address, timelockV2.address)
    await timelock.signalSetGov(gmxVester.address, timelockV2.address)
    await timelock.signalSetGov(glpVester.address, timelockV2.address)

    await increaseTime(provider, 20)
    await mineBlock(provider)

    await timelock.connect(timelockV2).setGov(glpManager.address)
    await timelock.connect(timelockV2).setGov(stakedGmxTracker.address)
    await timelock.connect(timelockV2).setGov(bonusGmxTracker.address)
    await timelock.connect(timelockV2).setGov(extendedGmxTracker.address)
    await timelock.connect(timelockV2).setGov(feeGmxTracker.address)
    await timelock.connect(timelockV2).setGov(feeGlpTracker.address)
    await timelock.connect(timelockV2).setGov(stakedGlpTracker.address)
    await timelock.connect(timelockV2).setGov(stakedGmxDistributor.address)
    await timelock.connect(timelockV2).setGov(stakedGlpDistributor.address)
    await timelock.connect(timelockV2).setGov(esGmx.address)
    await timelock.connect(timelockV2).setGov(bnGmx.address)
    await timelock.connect(timelockV2).setGov(gmxVester.address)
    await timelock.connect(timelockV2).setGov(glpVester.address)

    await esGmx.setHandler(rewardRouterV2.address, true)
    await esGmx.setHandler(stakedGmxDistributor.address, true)
    await esGmx.setHandler(stakedGlpDistributor.address, true)
    await esGmx.setHandler(stakedGmxTracker.address, true)
    await esGmx.setHandler(stakedGlpTracker.address, true)
    await esGmx.setHandler(gmxVester.address, true)
    await esGmx.setHandler(glpVester.address, true)

    await glpManager.setHandler(rewardRouterV2.address, true)
    await stakedGmxTracker.setHandler(rewardRouterV2.address, true)
    await bonusGmxTracker.setHandler(rewardRouterV2.address, true)
    await extendedGmxTracker.setHandler(rewardRouterV2.address, true)
    await feeGmxTracker.setHandler(rewardRouterV2.address, true)
    await feeGlpTracker.setHandler(rewardRouterV2.address, true)
    await stakedGlpTracker.setHandler(rewardRouterV2.address, true)

    await esGmx.setHandler(rewardRouterV2.address, true)
    await bnGmx.setMinter(rewardRouterV2.address, true)
    await esGmx.setMinter(gmxVester.address, true)
    await esGmx.setMinter(glpVester.address, true)

    await gmxVester.setHandler(rewardRouterV2.address, true)
    await glpVester.setHandler(rewardRouterV2.address, true)

    await feeGmxTracker.setHandler(gmxVester.address, true)
    await stakedGlpTracker.setHandler(glpVester.address, true)

    await eth.deposit({ value: expandDecimals(10, 18) })

    await gmx.setMinter(wallet.address, true)
    await gmx.mint(gmxVester.address, expandDecimals(10000, 18))
    await gmx.mint(glpVester.address, expandDecimals(10000, 18))

    await eth.mint(feeGlpDistributor.address, expandDecimals(50, 18))
    await feeGlpDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await eth.mint(feeGmxDistributor.address, expandDecimals(50, 18))
    await feeGmxDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await bnb.mint(user1.address, expandDecimals(1, 18))
    await bnb.connect(user1).approve(glpManager.address, expandDecimals(1, 18))
    await rewardRouterV2.connect(user1).mintAndStakeGlp(
      bnb.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )

    await gmx.mint(user1.address, expandDecimals(200, 18))
    expect(await gmx.balanceOf(user1.address)).eq(expandDecimals(200, 18))
    await gmx.connect(user1).approve(stakedGmxTracker.address, expandDecimals(200, 18))
    await rewardRouterV2.connect(user1).stakeGmx(expandDecimals(200, 18))
    expect(await gmx.balanceOf(user1.address)).eq(0)

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await gmx.balanceOf(user1.address)).eq(0)
    expect(await esGmx.balanceOf(user1.address)).eq(0)
    expect(await bnGmx.balanceOf(user1.address)).eq(0)
    expect(await glp.balanceOf(user1.address)).eq(0)
    expect(await eth.balanceOf(user1.address)).eq(0)

    expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).eq(expandDecimals(200, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).eq(0)
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).eq(0)

    await rewardRouterV2.connect(user1).handleRewards(
      true, // _shouldClaimGmx
      true, // _shouldStakeGmx
      true, // _shouldClaimEsGmx
      true, // _shouldStakeEsGmx
      true, // _shouldStakeMultiplierPoints
      true, // _shouldClaimWeth
      false // _shouldConvertWethToEth
    )

    expect(await gmx.balanceOf(user1.address)).eq(0)
    expect(await esGmx.balanceOf(user1.address)).eq(0)
    expect(await bnGmx.balanceOf(user1.address)).eq(0)
    expect(await glp.balanceOf(user1.address)).eq(0)
    expect(await eth.balanceOf(user1.address)).gt(expandDecimals(7, 18))
    expect(await eth.balanceOf(user1.address)).lt(expandDecimals(8, 18))

    expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).eq(expandDecimals(200, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).gt(expandDecimals(3571, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).lt(expandDecimals(3572, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).gt("540000000000000000") // 0.54
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).lt("560000000000000000") // 0.56

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    const ethBalance0 = await provider.getBalance(user1.address)

    await rewardRouterV2.connect(user1).handleRewards(
      false, // _shouldClaimGmx
      false, // _shouldStakeGmx
      false, // _shouldClaimEsGmx
      false, // _shouldStakeEsGmx
      false, // _shouldStakeMultiplierPoints
      true, // _shouldClaimWeth
      true // _shouldConvertWethToEth
    )

    const ethBalance1 = await provider.getBalance(user1.address)

    expect(await ethBalance1.sub(ethBalance0)).gt(expandDecimals(7, 18))
    expect(await ethBalance1.sub(ethBalance0)).lt(expandDecimals(8, 18))
    expect(await gmx.balanceOf(user1.address)).eq(0)
    expect(await esGmx.balanceOf(user1.address)).eq(0)
    expect(await bnGmx.balanceOf(user1.address)).eq(0)
    expect(await glp.balanceOf(user1.address)).eq(0)
    expect(await eth.balanceOf(user1.address)).gt(expandDecimals(7, 18))
    expect(await eth.balanceOf(user1.address)).lt(expandDecimals(8, 18))

    expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).eq(expandDecimals(200, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).gt(expandDecimals(3571, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).lt(expandDecimals(3572, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).gt("540000000000000000") // 0.54
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).lt("560000000000000000") // 0.56

    await rewardRouterV2.connect(user1).handleRewards(
      false, // _shouldClaimGmx
      false, // _shouldStakeGmx
      true, // _shouldClaimEsGmx
      false, // _shouldStakeEsGmx
      false, // _shouldStakeMultiplierPoints
      false, // _shouldClaimWeth
      false // _shouldConvertWethToEth
    )

    expect(await ethBalance1.sub(ethBalance0)).gt(expandDecimals(7, 18))
    expect(await ethBalance1.sub(ethBalance0)).lt(expandDecimals(8, 18))
    expect(await gmx.balanceOf(user1.address)).eq(0)
    expect(await esGmx.balanceOf(user1.address)).gt(expandDecimals(3571, 18))
    expect(await esGmx.balanceOf(user1.address)).lt(expandDecimals(3572, 18))
    expect(await bnGmx.balanceOf(user1.address)).eq(0)
    expect(await glp.balanceOf(user1.address)).eq(0)
    expect(await eth.balanceOf(user1.address)).gt(expandDecimals(7, 18))
    expect(await eth.balanceOf(user1.address)).lt(expandDecimals(8, 18))

    expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).eq(expandDecimals(200, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).gt(expandDecimals(3571, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).lt(expandDecimals(3572, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).gt("540000000000000000") // 0.54
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).lt("560000000000000000") // 0.56

    await gmxVester.connect(user1).deposit(expandDecimals(365, 18))
    await glpVester.connect(user1).deposit(expandDecimals(365 * 2, 18))

    expect(await ethBalance1.sub(ethBalance0)).gt(expandDecimals(7, 18))
    expect(await ethBalance1.sub(ethBalance0)).lt(expandDecimals(8, 18))
    expect(await gmx.balanceOf(user1.address)).eq(0)
    expect(await esGmx.balanceOf(user1.address)).gt(expandDecimals(3571 - 365 * 3, 18))
    expect(await esGmx.balanceOf(user1.address)).lt(expandDecimals(3572 - 365 * 3, 18))
    expect(await bnGmx.balanceOf(user1.address)).eq(0)
    expect(await glp.balanceOf(user1.address)).eq(0)
    expect(await eth.balanceOf(user1.address)).gt(expandDecimals(7, 18))
    expect(await eth.balanceOf(user1.address)).lt(expandDecimals(8, 18))

    expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).eq(expandDecimals(200, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).gt(expandDecimals(3571, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).lt(expandDecimals(3572, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).gt("540000000000000000") // 0.54
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).lt("560000000000000000") // 0.56

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    await rewardRouterV2.connect(user1).handleRewards(
      true, // _shouldClaimGmx
      false, // _shouldStakeGmx
      false, // _shouldClaimEsGmx
      false, // _shouldStakeEsGmx
      false, // _shouldStakeMultiplierPoints
      false, // _shouldClaimWeth
      false // _shouldConvertWethToEth
    )

    expect(await ethBalance1.sub(ethBalance0)).gt(expandDecimals(7, 18))
    expect(await ethBalance1.sub(ethBalance0)).lt(expandDecimals(8, 18))
    expect(await gmx.balanceOf(user1.address)).gt("2900000000000000000") // 2.9
    expect(await gmx.balanceOf(user1.address)).lt("3100000000000000000") // 3.1
    expect(await esGmx.balanceOf(user1.address)).gt(expandDecimals(3571 - 365 * 3, 18))
    expect(await esGmx.balanceOf(user1.address)).lt(expandDecimals(3572 - 365 * 3, 18))
    expect(await bnGmx.balanceOf(user1.address)).eq(0)
    expect(await glp.balanceOf(user1.address)).eq(0)
    expect(await eth.balanceOf(user1.address)).gt(expandDecimals(7, 18))
    expect(await eth.balanceOf(user1.address)).lt(expandDecimals(8, 18))

    expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).eq(expandDecimals(200, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).gt(expandDecimals(3571, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).lt(expandDecimals(3572, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).gt("540000000000000000") // 0.54
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).lt("560000000000000000") // 0.56
  })

  it("StakedGlp", async () => {
    await eth.mint(feeGlpDistributor.address, expandDecimals(100, 18))
    await feeGlpDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await bnb.mint(user1.address, expandDecimals(1, 18))
    await bnb.connect(user1).approve(glpManager.address, expandDecimals(1, 18))
    await rewardRouter.connect(user1).mintAndStakeGlp(
      bnb.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )

    expect(await feeGlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await feeGlpTracker.depositBalances(user1.address, glp.address)).eq(expandDecimals(2991, 17))

    expect(await stakedGlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await stakedGlpTracker.depositBalances(user1.address, feeGlpTracker.address)).eq(expandDecimals(2991, 17))

    const stakedGlp = await deployContract("StakedGlp", [glp.address, glpManager.address, stakedGlpTracker.address, feeGlpTracker.address])

    await expect(stakedGlp.connect(user2).transferFrom(user1.address, user3.address, expandDecimals(2991, 17)))
      .to.be.revertedWith("StakedGlp: transfer amount exceeds allowance")

    await stakedGlp.connect(user1).approve(user2.address, expandDecimals(2991, 17))

    await expect(stakedGlp.connect(user2).transferFrom(user1.address, user3.address, expandDecimals(2991, 17)))
      .to.be.revertedWith("StakedGlp: cooldown duration not yet passed")

    await increaseTime(provider, 24 * 60 * 60 + 10)
    await mineBlock(provider)

    await expect(stakedGlp.connect(user2).transferFrom(user1.address, user3.address, expandDecimals(2991, 17)))
      .to.be.revertedWith("RewardTracker: forbidden")

    await timelock.signalSetHandler(stakedGlpTracker.address, stakedGlp.address, true)
    await increaseTime(provider, 20)
    await mineBlock(provider)
    await timelock.setHandler(stakedGlpTracker.address, stakedGlp.address, true)

    await expect(stakedGlp.connect(user2).transferFrom(user1.address, user3.address, expandDecimals(2991, 17)))
      .to.be.revertedWith("RewardTracker: forbidden")

    await timelock.signalSetHandler(feeGlpTracker.address, stakedGlp.address, true)
    await increaseTime(provider, 20)
    await mineBlock(provider)
    await timelock.setHandler(feeGlpTracker.address, stakedGlp.address, true)

    expect(await feeGlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await feeGlpTracker.depositBalances(user1.address, glp.address)).eq(expandDecimals(2991, 17))

    expect(await stakedGlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await stakedGlpTracker.depositBalances(user1.address, feeGlpTracker.address)).eq(expandDecimals(2991, 17))

    expect(await feeGlpTracker.stakedAmounts(user3.address)).eq(0)
    expect(await feeGlpTracker.depositBalances(user3.address, glp.address)).eq(0)

    expect(await stakedGlpTracker.stakedAmounts(user3.address)).eq(0)
    expect(await stakedGlpTracker.depositBalances(user3.address, feeGlpTracker.address)).eq(0)

    await stakedGlp.connect(user2).transferFrom(user1.address, user3. address, expandDecimals(2991, 17))

    expect(await feeGlpTracker.stakedAmounts(user1.address)).eq(0)
    expect(await feeGlpTracker.depositBalances(user1.address, glp.address)).eq(0)

    expect(await stakedGlpTracker.stakedAmounts(user1.address)).eq(0)
    expect(await stakedGlpTracker.depositBalances(user1.address, feeGlpTracker.address)).eq(0)

    expect(await feeGlpTracker.stakedAmounts(user3.address)).eq(expandDecimals(2991, 17))
    expect(await feeGlpTracker.depositBalances(user3.address, glp.address)).eq(expandDecimals(2991, 17))

    expect(await stakedGlpTracker.stakedAmounts(user3.address)).eq(expandDecimals(2991, 17))
    expect(await stakedGlpTracker.depositBalances(user3.address, feeGlpTracker.address)).eq(expandDecimals(2991, 17))

    await expect(stakedGlp.connect(user2).transferFrom(user3.address, user1.address, expandDecimals(3000, 17)))
      .to.be.revertedWith("StakedGlp: transfer amount exceeds allowance")

    await stakedGlp.connect(user3).approve(user2.address, expandDecimals(3000, 17))

    await expect(stakedGlp.connect(user2).transferFrom(user3.address, user1.address, expandDecimals(3000, 17)))
      .to.be.revertedWith("RewardTracker: _amount exceeds stakedAmount")

    await stakedGlp.connect(user2).transferFrom(user3.address, user1.address, expandDecimals(1000, 17))

    expect(await feeGlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 17))
    expect(await feeGlpTracker.depositBalances(user1.address, glp.address)).eq(expandDecimals(1000, 17))

    expect(await stakedGlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 17))
    expect(await stakedGlpTracker.depositBalances(user1.address, feeGlpTracker.address)).eq(expandDecimals(1000, 17))

    expect(await feeGlpTracker.stakedAmounts(user3.address)).eq(expandDecimals(1991, 17))
    expect(await feeGlpTracker.depositBalances(user3.address, glp.address)).eq(expandDecimals(1991, 17))

    expect(await stakedGlpTracker.stakedAmounts(user3.address)).eq(expandDecimals(1991, 17))
    expect(await stakedGlpTracker.depositBalances(user3.address, feeGlpTracker.address)).eq(expandDecimals(1991, 17))

    await stakedGlp.connect(user3).transfer(user1.address, expandDecimals(1500, 17))

    expect(await feeGlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2500, 17))
    expect(await feeGlpTracker.depositBalances(user1.address, glp.address)).eq(expandDecimals(2500, 17))

    expect(await stakedGlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2500, 17))
    expect(await stakedGlpTracker.depositBalances(user1.address, feeGlpTracker.address)).eq(expandDecimals(2500, 17))

    expect(await feeGlpTracker.stakedAmounts(user3.address)).eq(expandDecimals(491, 17))
    expect(await feeGlpTracker.depositBalances(user3.address, glp.address)).eq(expandDecimals(491, 17))

    expect(await stakedGlpTracker.stakedAmounts(user3.address)).eq(expandDecimals(491, 17))
    expect(await stakedGlpTracker.depositBalances(user3.address, feeGlpTracker.address)).eq(expandDecimals(491, 17))

    await expect(stakedGlp.connect(user3).transfer(user1.address, expandDecimals(492, 17)))
      .to.be.revertedWith("RewardTracker: _amount exceeds stakedAmount")

    expect(await bnb.balanceOf(user1.address)).eq(0)

    await rewardRouter.connect(user1).unstakeAndRedeemGlp(
      bnb.address,
      expandDecimals(2500, 17),
      "830000000000000000", // 0.83
      user1.address
    )

    expect(await bnb.balanceOf(user1.address)).eq("830833333333333333")

    await usdg.addVault(glpManager.address)

    expect(await bnb.balanceOf(user3.address)).eq("0")

    await rewardRouter.connect(user3).unstakeAndRedeemGlp(
      bnb.address,
      expandDecimals(491, 17),
      "160000000000000000", // 0.16
      user3.address
    )

    expect(await bnb.balanceOf(user3.address)).eq("163175666666666666")
  })

  it("FeeGlp", async () => {
    await eth.mint(feeGlpDistributor.address, expandDecimals(100, 18))
    await feeGlpDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await bnb.mint(user1.address, expandDecimals(1, 18))
    await bnb.connect(user1).approve(glpManager.address, expandDecimals(1, 18))
    await rewardRouter.connect(user1).mintAndStakeGlp(
      bnb.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )

    expect(await feeGlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await feeGlpTracker.depositBalances(user1.address, glp.address)).eq(expandDecimals(2991, 17))

    expect(await stakedGlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await stakedGlpTracker.depositBalances(user1.address, feeGlpTracker.address)).eq(expandDecimals(2991, 17))

    const glpBalance = await deployContract("GlpBalance", [glpManager.address, stakedGlpTracker.address])

    await expect(glpBalance.connect(user2).transferFrom(user1.address, user3.address, expandDecimals(2991, 17)))
      .to.be.revertedWith("GlpBalance: transfer amount exceeds allowance")

    await glpBalance.connect(user1).approve(user2.address, expandDecimals(2991, 17))

    await expect(glpBalance.connect(user2).transferFrom(user1.address, user3.address, expandDecimals(2991, 17)))
      .to.be.revertedWith("GlpBalance: cooldown duration not yet passed")

    await increaseTime(provider, 24 * 60 * 60 + 10)
    await mineBlock(provider)

    await expect(glpBalance.connect(user2).transferFrom(user1.address, user3.address, expandDecimals(2991, 17)))
      .to.be.revertedWith("RewardTracker: transfer amount exceeds allowance")

    await timelock.signalSetHandler(stakedGlpTracker.address, glpBalance.address, true)
    await increaseTime(provider, 20)
    await mineBlock(provider)
    await timelock.setHandler(stakedGlpTracker.address, glpBalance.address, true)

    expect(await feeGlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await feeGlpTracker.depositBalances(user1.address, glp.address)).eq(expandDecimals(2991, 17))

    expect(await stakedGlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await stakedGlpTracker.depositBalances(user1.address, feeGlpTracker.address)).eq(expandDecimals(2991, 17))
    expect(await stakedGlpTracker.balanceOf(user1.address)).eq(expandDecimals(2991, 17))

    expect(await feeGlpTracker.stakedAmounts(user3.address)).eq(0)
    expect(await feeGlpTracker.depositBalances(user3.address, glp.address)).eq(0)

    expect(await stakedGlpTracker.stakedAmounts(user3.address)).eq(0)
    expect(await stakedGlpTracker.depositBalances(user3.address, feeGlpTracker.address)).eq(0)
    expect(await stakedGlpTracker.balanceOf(user3.address)).eq(0)

    await glpBalance.connect(user2).transferFrom(user1.address, user3.address, expandDecimals(2991, 17))

    expect(await feeGlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await feeGlpTracker.depositBalances(user1.address, glp.address)).eq(expandDecimals(2991, 17))

    expect(await stakedGlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await stakedGlpTracker.depositBalances(user1.address, feeGlpTracker.address)).eq(expandDecimals(2991, 17))
    expect(await stakedGlpTracker.balanceOf(user1.address)).eq(0)

    expect(await feeGlpTracker.stakedAmounts(user3.address)).eq(0)
    expect(await feeGlpTracker.depositBalances(user3.address, glp.address)).eq(0)

    expect(await stakedGlpTracker.stakedAmounts(user3.address)).eq(0)
    expect(await stakedGlpTracker.depositBalances(user3.address, feeGlpTracker.address)).eq(0)
    expect(await stakedGlpTracker.balanceOf(user3.address)).eq(expandDecimals(2991, 17))

    await expect(rewardRouter.connect(user1).unstakeAndRedeemGlp(
      bnb.address,
      expandDecimals(2991, 17),
      "0",
      user1.address
    )).to.be.revertedWith("RewardTracker: burn amount exceeds balance")

    await glpBalance.connect(user3).approve(user2.address, expandDecimals(3000, 17))

    await expect(glpBalance.connect(user2).transferFrom(user3.address, user1.address, expandDecimals(2992, 17)))
      .to.be.revertedWith("RewardTracker: transfer amount exceeds balance")

    await glpBalance.connect(user2).transferFrom(user3.address, user1.address, expandDecimals(2991, 17))

    expect(await bnb.balanceOf(user1.address)).eq(0)

    await rewardRouter.connect(user1).unstakeAndRedeemGlp(
      bnb.address,
      expandDecimals(2991, 17),
      "0",
      user1.address
    )

    expect(await bnb.balanceOf(user1.address)).eq("994009000000000000")
  })

  it("syncs voting power", async () => {
    await gmx.setMinter(wallet.address, true)
    await gmx.mint(user1.address, expandDecimals(100, 18))
    await esGmx.mint(user1.address, expandDecimals(25, 18))
    await bnGmx.mint(user1.address, expandDecimals(1000, 18))
    await govToken.setMinter(rewardRouter.address, true)

    expect(await gmx.balanceOf(user1.address)).eq(expandDecimals(100, 18))
    await gmx.connect(user1).approve(stakedGmxTracker.address, expandDecimals(1000, 18))
    await rewardRouter.connect(user1).stakeGmx(expandDecimals(100, 18))
    expect(await gmx.balanceOf(user1.address)).eq(0)

    expect(await esGmx.balanceOf(user1.address)).eq(expandDecimals(25, 18))
    await rewardRouter.connect(user1).stakeEsGmx(expandDecimals(25, 18))
    expect(await esGmx.balanceOf(user1.address)).eq(0)

    expect(await feeGmxTracker.stakedAmounts(user1.address)).eq(expandDecimals(125, 18))

    expect(await govToken.balanceOf(user1.address)).eq(0)

    await rewardRouter.setVotingPowerType(1)

    await gmx.mint(user1.address, expandDecimals(1, 18))
    await rewardRouter.connect(user1).stakeGmx(expandDecimals(1, 18))

    expect(await feeGmxTracker.stakedAmounts(user1.address)).eq(expandDecimals(126, 18))
    expect(await govToken.balanceOf(user1.address)).eq(expandDecimals(126, 18))

    await rewardRouter.connect(user1).handleRewards(
      false, // _shouldClaimGmx
      false, // _shouldStakeGmx
      false, // _shouldClaimEsGmx
      false, // _shouldStakeEsGmx
      true, // _shouldStakeMultiplierPoints
      false, // _shouldClaimWeth
      false // _shouldConvertWethToEth
    )

    expect(await feeGmxTracker.stakedAmounts(user1.address)).eq(expandDecimals(378, 18))
    expect(await govToken.balanceOf(user1.address)).eq(expandDecimals(126, 18))

    await rewardRouter.setVotingPowerType(2)

    await rewardRouter.connect(user1).handleRewards(
      false, // _shouldClaimGmx
      false, // _shouldStakeGmx
      false, // _shouldClaimEsGmx
      false, // _shouldStakeEsGmx
      true, // _shouldStakeMultiplierPoints
      false, // _shouldClaimWeth
      false // _shouldConvertWethToEth
    )

    expect(await feeGmxTracker.stakedAmounts(user1.address)).eq(expandDecimals(378, 18))
    expect(await govToken.balanceOf(user1.address)).eq(expandDecimals(378, 18))
  })

  it("caps stakeable bnGMX", async () => {
    await gmx.setMinter(wallet.address, true)
    await gmx.mint(user1.address, expandDecimals(100, 18))
    await esGmx.mint(user1.address, expandDecimals(25, 18))
    await bnGmx.mint(user1.address, expandDecimals(1000, 18))

    expect(await gmx.balanceOf(user1.address)).eq(expandDecimals(100, 18))
    await gmx.connect(user1).approve(stakedGmxTracker.address, expandDecimals(100, 18))
    await rewardRouter.connect(user1).stakeGmx(expandDecimals(100, 18))
    expect(await gmx.balanceOf(user1.address)).eq(0)

    expect(await esGmx.balanceOf(user1.address)).eq(expandDecimals(25, 18))
    await rewardRouter.connect(user1).stakeEsGmx(expandDecimals(25, 18))
    expect(await esGmx.balanceOf(user1.address)).eq(0)

    expect(await feeGmxTracker.stakedAmounts(user1.address)).eq(expandDecimals(125, 18))

    expect(await bnGmx.balanceOf(user1.address)).eq(expandDecimals(1000, 18))
    await rewardRouter.connect(user1).handleRewards(
      false, // _shouldClaimGmx
      false, // _shouldStakeGmx
      false, // _shouldClaimEsGmx
      false, // _shouldStakeEsGmx
      true, // _shouldStakeMultiplierPoints
      false, // _shouldClaimWeth
      false // _shouldConvertWethToEth
    )
    expect(await bnGmx.balanceOf(user1.address)).gt(expandDecimals(749, 18))
    expect(await bnGmx.balanceOf(user1.address)).lt(expandDecimals(751, 18))

    expect(await feeGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(125 + 249, 18))
    expect(await feeGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(125 + 251, 18))
  })

  it("caps stakeable bnGMX while vesting is active", async () => {
    await gmx.setMinter(wallet.address, true)
    await gmx.mint(user1.address, expandDecimals(100, 18))
    await esGmx.mint(user1.address, expandDecimals(25, 18))
    await bnGmx.mint(user1.address, expandDecimals(1000, 18))

    expect(await gmx.balanceOf(user1.address)).eq(expandDecimals(100, 18))
    await gmx.connect(user1).approve(stakedGmxTracker.address, expandDecimals(100, 18))
    await rewardRouter.connect(user1).stakeGmx(expandDecimals(100, 18))
    expect(await gmx.balanceOf(user1.address)).eq(0)

    expect(await esGmx.balanceOf(user1.address)).eq(expandDecimals(25, 18))
    await rewardRouter.connect(user1).stakeEsGmx(expandDecimals(25, 18))
    expect(await esGmx.balanceOf(user1.address)).eq(0)

    expect(await feeGmxTracker.stakedAmounts(user1.address)).eq(expandDecimals(125, 18))

    expect(await bnGmx.balanceOf(user1.address)).eq(expandDecimals(1000, 18))
    await rewardRouter.setMaxBoostBasisPoints(100_000)

    await rewardRouter.connect(user1).handleRewards(
      false, // _shouldClaimGmx
      false, // _shouldStakeGmx
      false, // _shouldClaimEsGmx
      false, // _shouldStakeEsGmx
      true, // _shouldStakeMultiplierPoints
      false, // _shouldClaimWeth
      false // _shouldConvertWethToEth
    )

    expect(await bnGmx.balanceOf(user1.address)).eq(0)
    expect(await extendedGmxTracker.stakedAmounts(user1.address)).closeTo(expandDecimals(1125, 18), expandDecimals(1, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).closeTo(expandDecimals(1000, 18), expandDecimals(1, 18))

    await gmxVester.setTransferredAverageStakedAmounts(user1.address, expandDecimals(1120, 18))
    await gmxVester.setTransferredCumulativeRewards(user1.address, expandDecimals(50, 18))

    await esGmx.mint(user1.address, expandDecimals(50, 18))

    expect(await gmxVester.balanceOf(user1.address)).eq(0)
    expect(await feeGmxTracker.balanceOf(user1.address)).closeTo(expandDecimals(1125, 18), expandDecimals(1, 18))

    await gmxVester.connect(user1).deposit(expandDecimals(50, 18))
    expect(await gmxVester.balanceOf(user1.address)).eq(expandDecimals(50, 18))
    expect(await gmxVester.pairAmounts(user1.address)).closeTo(expandDecimals(1120, 18), expandDecimals(1, 18))
    expect(await feeGmxTracker.balanceOf(user1.address)).closeTo(expandDecimals(5, 18), expandDecimals(1, 18))

    await rewardRouter.setMaxBoostBasisPoints(20_000)
    await expect(rewardRouter.batchCompoundForAccounts([user1.address])).to.be.revertedWith("RewardTracker: burn amount exceeds balance")

    const vesterCap = await deployContract("VesterCap", [
      gmxVester.address,
      stakedGmxTracker.address,
      bonusGmxTracker.address,
      extendedGmxTracker.address,
      feeGmxTracker.address,
      bnGmx.address,
      esGmx.address,
      20_000,
      25
    ])

    await timelock.signalSetHandler(extendedGmxTracker.address, vesterCap.address, true);
    await timelock.signalSetHandler(feeGmxTracker.address, vesterCap.address, true);
    await timelock.signalSetHandler(gmxVester.address, vesterCap.address, true);
    await timelock.signalSetMinter(esGmx.address, vesterCap.address, true);

    await increaseTime(provider, 10)
    await mineBlock(provider)

    await timelock.setHandler(extendedGmxTracker.address, vesterCap.address, true);
    await timelock.setHandler(feeGmxTracker.address, vesterCap.address, true);
    await timelock.setHandler(gmxVester.address, vesterCap.address, true);
    await timelock.setMinter(esGmx.address, vesterCap.address, true);

    await expect(vesterCap.connect(user1).updateBnGmxForAccounts([user1.address])).to.be.revertedWith("Governable: forbidden")

    expect(await bnGmx.balanceOf(user1.address)).eq(0)
    expect(await esGmx.balanceOf(user1.address)).eq(0)
    expect(await gmxVester.bonusRewards(user1.address)).eq(0)

    await vesterCap.updateBnGmxForAccounts([user1.address])

    expect(await bnGmx.balanceOf(user1.address)).closeTo(expandDecimals(750, 18), expandDecimals(1, 18))
    expect(await esGmx.balanceOf(user1.address)).closeTo(expandDecimals(40, 18), expandDecimals(1, 18))
    expect(await gmxVester.bonusRewards(user1.address)).closeTo(expandDecimals(40, 18), expandDecimals(1, 18))

    expect(await gmxVester.balanceOf(user1.address)).eq(expandDecimals(50, 18))
    expect(await gmxVester.pairAmounts(user1.address)).closeTo(expandDecimals(1120, 18), expandDecimals(1, 18))
    expect(await feeGmxTracker.balanceOf(user1.address)).closeTo(expandDecimals(1, 18), expandDecimals(1, 18))
    expect(await feeGmxTracker.stakedAmounts(user1.address)).closeTo(expandDecimals(376, 18), expandDecimals(1, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).closeTo(expandDecimals(251, 18), expandDecimals(1, 18))

    // due to the transfer out of feeGmxTracker tokens from the vester
    // the vester will not have sufficient feeGmxTracker balance to
    // complete the withdrawal for user1
    // to allow the withdrawal, deposit feeGmxTracker tokens to the
    // vester using user2
    await gmx.mint(user2.address, expandDecimals(1000, 18))
    await gmx.connect(user2).approve(stakedGmxTracker.address, expandDecimals(1000, 18))
    await rewardRouter.connect(user2).stakeGmx(expandDecimals(1000, 18))

    await esGmx.mint(user2.address, expandDecimals(1, 18))

    await gmxVester.setTransferredAverageStakedAmounts(user2.address, expandDecimals(1000, 18))
    await gmxVester.setTransferredCumulativeRewards(user2.address, expandDecimals(1, 18))
    await gmxVester.connect(user2).deposit(expandDecimals(1, 18))

    await gmx.mint(gmxVester.address, expandDecimals(25, 18))

    // check that calling updateBnGmxForAccounts for the same account does not re-mint esGMX
    await vesterCap.updateBnGmxForAccounts([user1.address])
    expect(await esGmx.balanceOf(user1.address)).closeTo(expandDecimals(40, 18), expandDecimals(1, 18))

    await gmxVester.connect(user1).withdraw()

    expect(await gmxVester.balanceOf(user1.address)).eq(0)
    expect(await gmxVester.pairAmounts(user1.address)).eq(0)
    expect(await feeGmxTracker.balanceOf(user1.address)).closeTo(expandDecimals(1120, 18), expandDecimals(1, 18))
    expect(await feeGmxTracker.stakedAmounts(user1.address)).eq(expandDecimals(375, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).eq(expandDecimals(250, 18))

    await expect(vesterCap.connect(user0).syncFeeGmxTrackerBalance(user1.address)).to.be.revertedWith("Governable: forbidden")

    await vesterCap.syncFeeGmxTrackerBalance(user1.address)

    expect(await feeGmxTracker.balanceOf(user1.address)).eq(expandDecimals(375, 18))
    expect(await feeGmxTracker.stakedAmounts(user1.address)).eq(expandDecimals(375, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).eq(expandDecimals(250, 18))
  })

  it("allows migration", async () => {
    const rewardRouterV2 = await deployContract("RewardRouterV2", []);
    await rewardRouterV2.initialize([
      eth.address,
      gmx.address,
      esGmx.address,
      bnGmx.address,
      glp.address,
      stakedGmxTracker.address,
      bonusGmxTracker.address,
      extendedGmxTracker.address,
      feeGmxTracker.address,
      feeGlpTracker.address,
      stakedGlpTracker.address,
      glpManager.address,
      gmxVester.address,
      glpVester.address,
      mockExternalHandler.address,
      govToken.address
    ])

    const timelockCaller = await deployContract("BeefyTimelockCaller", [])
    const migrator = await deployContract("BeefyMigrator", [
      wallet.address,
      stakedGmxTracker.address,
      bonusGmxTracker.address,
      feeGmxTracker.address,
      stakedGlpTracker.address,
      feeGlpTracker.address,
      gmxVester.address,
      glpVester.address,
      esGmx.address,
      bnGmx.address,
      rewardRouterV2.address,
      timelockCaller.address
    ])
    await timelockCaller.initialize(1, migrator.address)

    await expect(migrator.migrate()).to.be.revertedWith("forbidden")

    await timelock.signalSetGovRequester(migrator.address, true)

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    await timelock.setGovRequester(migrator.address, true)

    expect(await stakedGmxTracker.gov()).eq(timelock.address)
    expect(await bonusGmxTracker.gov()).eq(timelock.address)
    expect(await feeGmxTracker.gov()).eq(timelock.address)
    expect(await stakedGlpTracker.gov()).eq(timelock.address)
    expect(await feeGlpTracker.gov()).eq(timelock.address)
    expect(await gmxVester.gov()).eq(timelock.address)
    expect(await glpVester.gov()).eq(timelock.address)
    expect(await esGmx.gov()).eq(timelock.address)
    expect(await bnGmx.gov()).eq(timelock.address)

    await migrator.migrate()

    expect(await stakedGmxTracker.gov()).eq(timelock.address)
    expect(await bonusGmxTracker.gov()).eq(timelock.address)
    expect(await feeGmxTracker.gov()).eq(timelock.address)
    expect(await stakedGlpTracker.gov()).eq(timelock.address)
    expect(await feeGlpTracker.gov()).eq(timelock.address)
    expect(await gmxVester.gov()).eq(timelock.address)
    expect(await glpVester.gov()).eq(timelock.address)
    expect(await esGmx.gov()).eq(timelock.address)
    expect(await bnGmx.gov()).eq(timelock.address)

    const mockGovRequester = await deployContract("MockGovRequester", [])
    await timelock.signalSetGovRequester(mockGovRequester.address, true)

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    await timelock.setGovRequester(mockGovRequester.address, true)

    await expect(mockGovRequester.migrate(timelock.address, [stakedGmxTracker.address]))
      .to.be.revertedWith("gov != this")
  })

  it("BuybackMigrator.sol, batchRestakeForAccounts", async () => {
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

    // deploy for testing MockOldRewardRouterV2
    const mockOldRewardRouterV2 = await deployContract("MockOldRewardRouterV2", []);
    await mockOldRewardRouterV2.initialize(
      bnb.address,
      gmx.address,
      esGmx.address,
      bnGmx.address,
      glp.address,
      stakedGmxTracker.address,
      bonusGmxTracker.address,
      feeGmxTracker.address,
      feeGlpTracker.address,
      stakedGlpTracker.address,
      ZERO_ADDRESS,
      gmxVester.address,
      glpVester.address,
      govToken.address
    )

    await mockOldRewardRouterV2.setMaxBoostBasisPoints(20_000)

    await govToken.setMinter(rewardRouter.address, true)
    await govToken.setMinter(mockOldRewardRouterV2.address, true)

    await rewardRouter.setVotingPowerType(1)
    await mockOldRewardRouterV2.setVotingPowerType(1)

    await timelock.signalSetGov(stakedGmxTracker.address, wallet.address)
    await timelock.signalSetGov(bonusGmxTracker.address, wallet.address)
    await timelock.signalSetGov(extendedGmxTracker.address, wallet.address)
    await timelock.signalSetGov(feeGmxTracker.address, wallet.address)
    await timelock.signalSetGov(feeGlpTracker.address, wallet.address)
    await timelock.signalSetGov(stakedGlpTracker.address, wallet.address)
    await timelock.signalSetGov(stakedGmxDistributor.address, wallet.address)
    await timelock.signalSetGov(stakedGlpDistributor.address, wallet.address)
    await timelock.signalSetGov(esGmx.address, wallet.address)
    await timelock.signalSetGov(bnGmx.address, wallet.address)
    await timelock.signalSetGov(gmxVester.address, wallet.address)
    await timelock.signalSetGov(glpVester.address, wallet.address)

    await increaseTime(provider, 20)
    await mineBlock(provider)

    await timelock.setGov(stakedGmxTracker.address)
    await timelock.setGov(bonusGmxTracker.address)
    await timelock.setGov(extendedGmxTracker.address)
    await timelock.setGov(feeGmxTracker.address)
    await timelock.setGov(feeGlpTracker.address)
    await timelock.setGov(stakedGlpTracker.address)
    await timelock.setGov(stakedGmxDistributor.address)
    await timelock.setGov(stakedGlpDistributor.address)
    await timelock.setGov(esGmx.address)
    await timelock.setGov(bnGmx.address)
    await timelock.setGov(gmxVester.address)
    await timelock.setGov(glpVester.address)

    await feeGmxTracker.setDepositToken(bonusGmxTracker.address, true)
    await feeGmxTracker.setDepositToken(bnGmx.address, true)
    await feeGmxTracker.setDepositToken(extendedGmxTracker.address, false)

    await esGmx.setHandler(mockOldRewardRouterV2.address, true)
    await stakedGmxTracker.setHandler(mockOldRewardRouterV2.address, true)
    await bonusGmxTracker.setHandler(mockOldRewardRouterV2.address, true)
    await feeGmxTracker.setHandler(mockOldRewardRouterV2.address, true)
    await feeGlpTracker.setHandler(mockOldRewardRouterV2.address, true)
    await stakedGlpTracker.setHandler(mockOldRewardRouterV2.address, true)
    await gmxVester.setHandler(mockOldRewardRouterV2.address, true)
    await glpVester.setHandler(mockOldRewardRouterV2.address, true)

    await bonusGmxTracker.setHandler(feeGmxTracker.address, true)
    await bnGmx.setHandler(feeGmxTracker.address, true)
    await extendedGmxTracker.setHandler(feeGmxTracker.address, false)
    await bonusGmxTracker.setHandler(extendedGmxTracker.address, false)
    await bnGmx.setHandler(extendedGmxTracker.address, false)

    await bnGmx.setMinter(mockOldRewardRouterV2.address, true)

    await gmx.setMinter(wallet.address, true)
    await gmx.mint(gmxVester.address, expandDecimals(10000, 18))
    await gmx.mint(glpVester.address, expandDecimals(10000, 18))

    await eth.mint(feeGlpDistributor.address, expandDecimals(50, 18))
    await feeGlpDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await eth.mint(feeGmxDistributor.address, expandDecimals(50, 18))
    await feeGmxDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await gmx.mint(user1.address, expandDecimals(200, 18))
    expect(await gmx.balanceOf(user1.address)).eq(expandDecimals(200, 18))
    await gmx.connect(user1).approve(stakedGmxTracker.address, expandDecimals(200, 18))
    await mockOldRewardRouterV2.connect(user1).stakeGmx(expandDecimals(200, 18))
    expect(await gmx.balanceOf(user1.address)).eq(0)

    await gmx.mint(user2.address, expandDecimals(200, 18))
    expect(await gmx.balanceOf(user2.address)).eq(expandDecimals(200, 18))
    await gmx.connect(user2).approve(stakedGmxTracker.address, expandDecimals(200, 18))
    await mockOldRewardRouterV2.connect(user2).stakeGmx(expandDecimals(200, 18))
    expect(await gmx.balanceOf(user2.address)).eq(0)

    await gmx.mint(user3.address, expandDecimals(200, 18))
    expect(await gmx.balanceOf(user3.address)).eq(expandDecimals(200, 18))
    await gmx.connect(user3).approve(stakedGmxTracker.address, expandDecimals(200, 18))
    await mockOldRewardRouterV2.connect(user3).stakeGmx(expandDecimals(200, 18))
    expect(await gmx.balanceOf(user3.address)).eq(0)

    await stakedGmxTracker.setGov(timelock.address)
    await bonusGmxTracker.setGov(timelock.address)
    await extendedGmxTracker.setGov(timelock.address)
    await feeGmxTracker.setGov(timelock.address)
    await feeGlpTracker.setGov(timelock.address)
    await stakedGlpTracker.setGov(timelock.address)
    await stakedGmxDistributor.setGov(timelock.address)
    await stakedGlpDistributor.setGov(timelock.address)
    await esGmx.setGov(timelock.address)
    await bnGmx.setGov(timelock.address)
    await gmxVester.setGov(timelock.address)
    await glpVester.setGov(timelock.address)

    await expect(feeGmxTracker.setDepositToken(extendedGmxTracker.address, false))
      .to.be.revertedWith("Governable: forbidden")

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await stakedGmxTracker.stakedAmounts(user1.address)).eq(expandDecimals(200, 18))
    expect(await bonusGmxTracker.stakedAmounts(user1.address)).eq(expandDecimals(200, 18))
    expect(await extendedGmxTracker.stakedAmounts(user1.address)).eq(0)
    expect(await feeGmxTracker.stakedAmounts(user1.address)).eq(expandDecimals(200, 18))
    expect(await govToken.balanceOf(user1.address)).eq(expandDecimals(200, 18))

    expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).eq(expandDecimals(200, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).eq(0)
    expect(await bonusGmxTracker.depositBalances(user1.address, stakedGmxTracker.address)).eq(expandDecimals(200, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).eq(expandDecimals(200, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, bnGmx.address)).eq(0)

    expect(await stakedGmxTracker.claimable(user1.address)).gt(expandDecimals(595, 18)) // 50000 / 28 / 3 => ~595
    expect(await stakedGmxTracker.claimable(user1.address)).lt(expandDecimals(596, 18))
    expect(await bonusGmxTracker.claimable(user1.address)).gt("540000000000000000") // 0.54, 200 / 365 => ~0.55
    expect(await bonusGmxTracker.claimable(user1.address)).lt("560000000000000000") // 0.56
    expect(await feeGmxTracker.claimable(user1.address)).gt("1180000000000000000") // 1.18, 100 / 28 / 3 => ~1.19
    expect(await feeGmxTracker.claimable(user1.address)).lt("1200000000000000000") // 1.20

    expect(await stakedGmxTracker.stakedAmounts(user2.address)).eq(expandDecimals(200, 18))
    expect(await bonusGmxTracker.stakedAmounts(user2.address)).eq(expandDecimals(200, 18))
    expect(await extendedGmxTracker.stakedAmounts(user2.address)).eq(0)
    expect(await feeGmxTracker.stakedAmounts(user2.address)).eq(expandDecimals(200, 18))

    expect(await stakedGmxTracker.depositBalances(user2.address, gmx.address)).eq(expandDecimals(200, 18))
    expect(await stakedGmxTracker.depositBalances(user2.address, esGmx.address)).eq(0)
    expect(await bonusGmxTracker.depositBalances(user2.address, stakedGmxTracker.address)).eq(expandDecimals(200, 18))
    expect(await feeGmxTracker.depositBalances(user2.address, bonusGmxTracker.address)).eq(expandDecimals(200, 18))
    expect(await feeGmxTracker.depositBalances(user2.address, bnGmx.address)).eq(0)

    expect(await stakedGmxTracker.claimable(user2.address)).gt(expandDecimals(595, 18)) // 50000 / 28 / 3 => ~595
    expect(await stakedGmxTracker.claimable(user2.address)).lt(expandDecimals(596, 18))
    expect(await bonusGmxTracker.claimable(user2.address)).gt("540000000000000000") // 0.54, 200 / 365 => ~0.55
    expect(await bonusGmxTracker.claimable(user2.address)).lt("560000000000000000") // 0.56
    expect(await feeGmxTracker.claimable(user2.address)).gt("1180000000000000000") // 1.18, 100 / 28 / 3 => ~1.19
    expect(await feeGmxTracker.claimable(user2.address)).lt("1200000000000000000") // 1.20

    expect(await stakedGmxTracker.stakedAmounts(user3.address)).eq(expandDecimals(200, 18))
    expect(await bonusGmxTracker.stakedAmounts(user3.address)).eq(expandDecimals(200, 18))
    expect(await extendedGmxTracker.stakedAmounts(user3.address)).eq(0)
    expect(await feeGmxTracker.stakedAmounts(user3.address)).eq(expandDecimals(200, 18))

    expect(await stakedGmxTracker.depositBalances(user3.address, gmx.address)).eq(expandDecimals(200, 18))
    expect(await stakedGmxTracker.depositBalances(user3.address, esGmx.address)).eq(0)
    expect(await bonusGmxTracker.depositBalances(user3.address, stakedGmxTracker.address)).eq(expandDecimals(200, 18))
    expect(await feeGmxTracker.depositBalances(user3.address, bonusGmxTracker.address)).eq(expandDecimals(200, 18))
    expect(await feeGmxTracker.depositBalances(user3.address, bnGmx.address)).eq(0)

    expect(await stakedGmxTracker.claimable(user3.address)).gt(expandDecimals(595, 18)) // 50000 / 28 / 3 => ~595
    expect(await stakedGmxTracker.claimable(user3.address)).lt(expandDecimals(596, 18))
    expect(await bonusGmxTracker.claimable(user3.address)).gt("540000000000000000") // 0.54, 200 / 365 => ~0.55
    expect(await bonusGmxTracker.claimable(user3.address)).lt("560000000000000000") // 0.56
    expect(await feeGmxTracker.claimable(user3.address)).gt("1180000000000000000") // 1.18, 100 / 28 / 3 => ~1.19
    expect(await feeGmxTracker.claimable(user3.address)).lt("1200000000000000000") // 1.20

    await mockOldRewardRouterV2.connect(user1).compound()

    expect(await govToken.balanceOf(user1.address)).gt(expandDecimals(795, 18))
    expect(await govToken.balanceOf(user1.address)).lt(expandDecimals(796, 18))
    expect(await stakedGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(795, 18))
    expect(await stakedGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(796, 18))
    expect(await bonusGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(795, 18))
    expect(await bonusGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(796, 18))
    expect(await extendedGmxTracker.stakedAmounts(user1.address)).eq(0)
    expect(await feeGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(795, 18))
    expect(await feeGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(797, 18))

    expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).eq(expandDecimals(200, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).gt(expandDecimals(595, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).lt(expandDecimals(596, 18))
    expect(await bonusGmxTracker.depositBalances(user1.address, stakedGmxTracker.address)).gt(expandDecimals(795, 18))
    expect(await bonusGmxTracker.depositBalances(user1.address, stakedGmxTracker.address)).lt(expandDecimals(796, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).eq(0)
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).eq(0)
    expect(await feeGmxTracker.depositBalances(user1.address, extendedGmxTracker.address)).eq(0)
    expect(await feeGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).gt(expandDecimals(795, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).lt(expandDecimals(796, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, bnGmx.address)).gt("540000000000000000")
    expect(await feeGmxTracker.depositBalances(user1.address, bnGmx.address)).lt("560000000000000000")

    // deply new RewardRouterV2 for migration testing
    const newRewardRouterV2 = await deployContract("RewardRouterV2", []);
    await newRewardRouterV2.initialize([
      bnb.address,
      gmx.address,
      esGmx.address,
      bnGmx.address,
      glp.address,
      stakedGmxTracker.address,
      bonusGmxTracker.address,
      extendedGmxTracker.address,
      feeGmxTracker.address,
      feeGlpTracker.address,
      stakedGlpTracker.address,
      ZERO_ADDRESS,
      gmxVester.address,
      glpVester.address,
      mockExternalHandler.address,
      govToken.address
    ])

    await newRewardRouterV2.setMaxBoostBasisPoints(20_000)

    await newRewardRouterV2.setInRestakingMode(true);

    expect(await newRewardRouterV2.inRestakingMode()).eq(true)

    // deploy BuybackMigrator contract to test migration
    const buybackMigrator = await deployContract("BuybackMigrator", [
      wallet.address,
      stakedGmxTracker.address,
      bonusGmxTracker.address,
      extendedGmxTracker.address,
      feeGmxTracker.address,
      feeGlpTracker.address,
      stakedGlpTracker.address,
      gmxVester.address,
      glpVester.address,
      esGmx.address,
      bnGmx.address,
      mockOldRewardRouterV2.address,
      newRewardRouterV2.address
    ]);

    await timelock.signalSetGovRequester(buybackMigrator.address, true)

    await increaseTime(provider, 20)
    await mineBlock(provider)

    await timelock.setGovRequester(buybackMigrator.address, true)

    expect(await timelock.govRequesters(buybackMigrator.address)).eq(true)

    expect(await stakedGmxTracker.isHandler(newRewardRouterV2.address)).eq(false)
    expect(await bonusGmxTracker.isHandler(newRewardRouterV2.address)).eq(false)
    expect(await extendedGmxTracker.isHandler(newRewardRouterV2.address)).eq(false)
    expect(await feeGmxTracker.isHandler(newRewardRouterV2.address)).eq(false)
    expect(await feeGlpTracker.isHandler(newRewardRouterV2.address)).eq(false)
    expect(await stakedGlpTracker.isHandler(newRewardRouterV2.address)).eq(false)
    expect(await gmxVester.isHandler(newRewardRouterV2.address)).eq(false)
    expect(await glpVester.isHandler(newRewardRouterV2.address)).eq(false)
    expect(await esGmx.isHandler(newRewardRouterV2.address)).eq(false)
    expect(await bnGmx.isMinter(newRewardRouterV2.address)).eq(false)

    expect(await bonusGmxTracker.isHandler(extendedGmxTracker.address)).eq(false)
    expect(await bnGmx.isHandler(extendedGmxTracker.address)).eq(false)
    expect(await extendedGmxTracker.isHandler(feeGmxTracker.address)).eq(false)

    expect(await feeGmxTracker.isDepositToken(extendedGmxTracker.address)).eq(false)

    await buybackMigrator.enableNewRewardRouter()

    expect(await stakedGmxTracker.isHandler(newRewardRouterV2.address)).eq(true)
    expect(await bonusGmxTracker.isHandler(newRewardRouterV2.address)).eq(true)
    expect(await extendedGmxTracker.isHandler(newRewardRouterV2.address)).eq(true)
    expect(await feeGmxTracker.isHandler(newRewardRouterV2.address)).eq(true)
    expect(await feeGlpTracker.isHandler(newRewardRouterV2.address)).eq(true)
    expect(await stakedGlpTracker.isHandler(newRewardRouterV2.address)).eq(true)
    expect(await gmxVester.isHandler(newRewardRouterV2.address)).eq(true)
    expect(await glpVester.isHandler(newRewardRouterV2.address)).eq(true)
    expect(await esGmx.isHandler(newRewardRouterV2.address)).eq(true)
    expect(await bnGmx.isMinter(newRewardRouterV2.address)).eq(true)

    expect(await bonusGmxTracker.isHandler(extendedGmxTracker.address)).eq(true)
    expect(await bnGmx.isHandler(extendedGmxTracker.address)).eq(true)
    expect(await extendedGmxTracker.isHandler(feeGmxTracker.address)).eq(true)

    expect(await feeGmxTracker.isDepositToken(extendedGmxTracker.address)).eq(true)
    expect(await extendedGmxTracker.isDepositToken(bonusGmxTracker.address)).eq(true)
    expect(await extendedGmxTracker.isDepositToken(bnGmx.address)).eq(true)

    await newRewardRouterV2.connect(user1).unstakeGmx(expandDecimals(1, 18))

    expect(await extendedGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(794, 18))
    expect(await extendedGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(795, 18))
    expect(await feeGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(794, 18))
    expect(await feeGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(795, 18))

    expect(await extendedGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).gt(expandDecimals(794, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).lt(expandDecimals(795, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).gt("540000000000000000")
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).lt("560000000000000000")
    expect(await feeGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).eq(0)
    expect(await feeGmxTracker.depositBalances(user1.address, bnGmx.address)).eq(0)
    expect(await feeGmxTracker.depositBalances(user1.address, extendedGmxTracker.address)).gt(expandDecimals(794, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, extendedGmxTracker.address)).lt(expandDecimals(796, 18))

    await gmx.mint(user1.address, expandDecimals(200, 18))
    expect(await gmx.balanceOf(user1.address)).eq(expandDecimals(201, 18))
    await gmx.connect(user1).approve(stakedGmxTracker.address, expandDecimals(201, 18))
    await mockOldRewardRouterV2.connect(user1).stakeGmx(expandDecimals(201, 18))
    expect(await gmx.balanceOf(user1.address)).eq(0)

    expect(await stakedGmxTracker.isHandler(mockOldRewardRouterV2.address)).eq(true)
    expect(await bonusGmxTracker.isHandler(mockOldRewardRouterV2.address)).eq(true)
    expect(await extendedGmxTracker.isHandler(mockOldRewardRouterV2.address)).eq(false)
    expect(await feeGmxTracker.isHandler(mockOldRewardRouterV2.address)).eq(true)
    expect(await feeGlpTracker.isHandler(mockOldRewardRouterV2.address)).eq(true)
    expect(await stakedGlpTracker.isHandler(mockOldRewardRouterV2.address)).eq(true)
    expect(await gmxVester.isHandler(mockOldRewardRouterV2.address)).eq(true)
    expect(await glpVester.isHandler(mockOldRewardRouterV2.address)).eq(true)
    expect(await esGmx.isHandler(mockOldRewardRouterV2.address)).eq(true)

    expect(await bnGmx.isMinter(mockOldRewardRouterV2.address)).eq(true)

    expect(await bonusGmxTracker.isHandler(feeGmxTracker.address)).eq(true)
    expect(await bnGmx.isHandler(feeGmxTracker.address)).eq(true)

    expect(await feeGmxTracker.isDepositToken(bonusGmxTracker.address)).eq(true)
    expect(await feeGmxTracker.isDepositToken(bnGmx.address)).eq(true)

    await buybackMigrator.disableOldRewardRouter()

    expect(await stakedGmxTracker.isHandler(mockOldRewardRouterV2.address)).eq(false)
    expect(await bonusGmxTracker.isHandler(mockOldRewardRouterV2.address)).eq(false)
    expect(await extendedGmxTracker.isHandler(mockOldRewardRouterV2.address)).eq(false)
    expect(await feeGmxTracker.isHandler(mockOldRewardRouterV2.address)).eq(false)
    expect(await feeGlpTracker.isHandler(mockOldRewardRouterV2.address)).eq(false)
    expect(await stakedGlpTracker.isHandler(mockOldRewardRouterV2.address)).eq(false)
    expect(await gmxVester.isHandler(mockOldRewardRouterV2.address)).eq(false)
    expect(await glpVester.isHandler(mockOldRewardRouterV2.address)).eq(false)
    expect(await esGmx.isHandler(mockOldRewardRouterV2.address)).eq(false)

    expect(await bnGmx.isMinter(mockOldRewardRouterV2.address)).eq(false)

    expect(await stakedGmxTracker.isHandler(newRewardRouterV2.address)).eq(true)
    expect(await bonusGmxTracker.isHandler(newRewardRouterV2.address)).eq(true)
    expect(await extendedGmxTracker.isHandler(newRewardRouterV2.address)).eq(true)
    expect(await feeGmxTracker.isHandler(newRewardRouterV2.address)).eq(true)
    expect(await feeGlpTracker.isHandler(newRewardRouterV2.address)).eq(true)
    expect(await stakedGlpTracker.isHandler(newRewardRouterV2.address)).eq(true)
    expect(await gmxVester.isHandler(newRewardRouterV2.address)).eq(true)
    expect(await glpVester.isHandler(newRewardRouterV2.address)).eq(true)
    expect(await esGmx.isHandler(newRewardRouterV2.address)).eq(true)

    expect(await bnGmx.isMinter(newRewardRouterV2.address)).eq(true)

    expect(await bonusGmxTracker.isHandler(feeGmxTracker.address)).eq(true)
    expect(await bonusGmxTracker.isHandler(extendedGmxTracker.address)).eq(true)
    expect(await extendedGmxTracker.isHandler(feeGmxTracker.address)).eq(true)
    expect(await bnGmx.isHandler(feeGmxTracker.address)).eq(true)
    expect(await bnGmx.isHandler(extendedGmxTracker.address)).eq(true)

    expect(await extendedGmxTracker.isDepositToken(bonusGmxTracker.address)).eq(true)
    expect(await extendedGmxTracker.isDepositToken(bnGmx.address)).eq(true)
    expect(await feeGmxTracker.isDepositToken(extendedGmxTracker.address)).eq(true)
    expect(await feeGmxTracker.isDepositToken(bonusGmxTracker.address)).eq(true)
    expect(await feeGmxTracker.isDepositToken(bnGmx.address)).eq(true)

    await gmx.mint(user1.address, expandDecimals(200, 18))
    expect(await gmx.balanceOf(user1.address)).eq(expandDecimals(200, 18))
    await gmx.connect(user1).approve(stakedGmxTracker.address, expandDecimals(200, 18))

    await expect(mockOldRewardRouterV2.connect(user1).stakeGmx(expandDecimals(200, 18)))
      .to.be.revertedWith("RewardTracker: forbidden")

    await expect(mockOldRewardRouterV2.connect(user1).unstakeGmx(expandDecimals(200, 18)))
      .to.be.revertedWith("RewardTracker: forbidden")

    await expect(mockOldRewardRouterV2.connect(user1).claim())
      .to.be.revertedWith("RewardTracker: forbidden")

    await expect(mockOldRewardRouterV2.connect(user1).compound())
      .to.be.revertedWith("RewardTracker: forbidden")

    await expect(mockOldRewardRouterV2.connect(user1).handleRewards(
        true, // _shouldClaimGmx
        true, // _shouldStakeGmx
        true, // _shouldClaimEsGmx
        true, // _shouldStakeEsGmx
        true, // _shouldStakeMultiplierPoints
        true, // _shouldClaimWeth
        true // _shouldConvertWethToEth
    )).to.be.revertedWith("Vester: forbidden")

    expect(await extendedGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(794, 18))
    expect(await extendedGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(795, 18))
    expect(await feeGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(995, 18))
    expect(await feeGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(997, 18))

    expect(await extendedGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).gt(expandDecimals(794, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).lt(expandDecimals(795, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).gt("540000000000000000")
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).lt("560000000000000000")
    expect(await feeGmxTracker.depositBalances(user1.address, bnGmx.address)).eq(0)
    expect(await feeGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).eq(expandDecimals(201, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, extendedGmxTracker.address)).gt(expandDecimals(794, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, extendedGmxTracker.address)).lt(expandDecimals(796, 18))

    await gmx.mint(user2.address, expandDecimals(200, 18))
    expect(await gmx.balanceOf(user2.address)).eq(expandDecimals(200, 18))
    await gmx.connect(user2).approve(stakedGmxTracker.address, expandDecimals(200, 18))
    await newRewardRouterV2.connect(user2).stakeGmx(expandDecimals(200, 18))
    expect(await gmx.balanceOf(user2.address)).eq(0)

    expect(await extendedGmxTracker.stakedAmounts(user2.address)).eq(expandDecimals(200, 18))
    expect(await feeGmxTracker.stakedAmounts(user2.address)).eq(expandDecimals(400, 18))

    expect(await extendedGmxTracker.depositBalances(user2.address, bonusGmxTracker.address)).eq(expandDecimals(200, 18))
    expect(await extendedGmxTracker.depositBalances(user2.address, bnGmx.address)).eq(0)
    expect(await feeGmxTracker.depositBalances(user2.address, extendedGmxTracker.address)).eq(expandDecimals(200, 18))
    expect(await feeGmxTracker.depositBalances(user2.address, bonusGmxTracker.address)).eq(expandDecimals(200, 18))
    expect(await feeGmxTracker.depositBalances(user2.address, bnGmx.address)).eq(0)

    await newRewardRouterV2.connect(user3).claim()

    expect(await gmx.balanceOf(user3.address)).eq(0)

    const user3EthBalance = await eth.balanceOf(user3.address)

    expect(user3EthBalance).gt("1190000000000000000")
    expect(user3EthBalance).lt("1200000000000000000")

    const user3EsGmxBalance = await esGmx.balanceOf(user3.address)

    expect(user3EsGmxBalance).gt(expandDecimals(595, 18))
    expect(user3EsGmxBalance).lt(expandDecimals(596, 18))

    await gmxVester.connect(user3).deposit(user3EsGmxBalance)

    expect(await gmxVester.balanceOf(user3.address)).gt(expandDecimals(595, 18))
    expect(await gmxVester.balanceOf(user3.address)).lt(expandDecimals(596, 18))

    expect(await gmxVester.pairAmounts(user3.address)).eq(expandDecimals(200, 18))

    expect(await feeGmxTracker.stakedAmounts(user3.address)).eq(expandDecimals(200, 18))
    expect(await feeGmxTracker.depositBalances(user3.address, bonusGmxTracker.address)).eq(expandDecimals(200, 18))
    expect(await feeGmxTracker.balanceOf(user3.address)).eq(0)

    await newRewardRouterV2.batchRestakeForAccounts([user1.address, user2.address, user3.address])

    expect(await extendedGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(995, 18))
    expect(await extendedGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(997, 18))
    expect(await feeGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(995, 18))
    expect(await feeGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(997, 18))

    expect(await extendedGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).gt(expandDecimals(995, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).lt(expandDecimals(996, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).gt("540000000000000000")
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).lt("560000000000000000")
    expect(await feeGmxTracker.depositBalances(user1.address, bnGmx.address)).eq(0)
    expect(await feeGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).eq(0)
    expect(await feeGmxTracker.depositBalances(user1.address, extendedGmxTracker.address)).gt(expandDecimals(995, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, extendedGmxTracker.address)).lt(expandDecimals(997, 18))

    expect(await gmx.balanceOf(user2.address)).eq(0)

    expect(await extendedGmxTracker.stakedAmounts(user2.address)).eq(expandDecimals(400, 18))
    expect(await feeGmxTracker.stakedAmounts(user2.address)).eq(expandDecimals(400, 18))

    expect(await extendedGmxTracker.depositBalances(user2.address, bonusGmxTracker.address)).eq(expandDecimals(400, 18))
    expect(await extendedGmxTracker.depositBalances(user2.address, bnGmx.address)).eq(0)
    expect(await feeGmxTracker.depositBalances(user2.address, extendedGmxTracker.address)).eq(expandDecimals(400, 18))
    expect(await feeGmxTracker.depositBalances(user2.address, bonusGmxTracker.address)).eq(0)
    expect(await feeGmxTracker.depositBalances(user2.address, bnGmx.address)).eq(0)

    expect(await gmxVester.balanceOf(user3.address)).gt(expandDecimals(595, 18))
    expect(await gmxVester.balanceOf(user3.address)).lt(expandDecimals(596, 18))
    expect(await gmxVester.pairAmounts(user3.address)).eq(expandDecimals(200, 18))
    expect(await feeGmxTracker.stakedAmounts(user3.address)).eq(expandDecimals(200, 18))
    expect(await extendedGmxTracker.depositBalances(user3.address, bonusGmxTracker.address)).eq(expandDecimals(200, 18))
    expect(await feeGmxTracker.balanceOf(user3.address)).eq(0)

    await buybackMigrator.setHandlerAndDepositToken()

    await newRewardRouterV2.setInRestakingMode(false);

    expect(await newRewardRouterV2.inRestakingMode()).eq(false)

    await timelock.signalSetGovRequester(buybackMigrator.address, false)

    await increaseTime(provider, 20)
    await mineBlock(provider)

    await timelock.setGovRequester(buybackMigrator.address, false)

    expect(await timelock.govRequesters(buybackMigrator.address)).eq(false)

    expect(await bonusGmxTracker.isHandler(feeGmxTracker.address)).eq(false)
    expect(await bnGmx.isHandler(feeGmxTracker.address)).eq(false)

    expect(await feeGmxTracker.isDepositToken(bonusGmxTracker.address)).eq(false)
    expect(await feeGmxTracker.isDepositToken(bnGmx.address)).eq(false)
  })

  it("handleRewardsV2", async () => {
    await eth.mint(feeGlpDistributor.address, expandDecimals(100, 18))
    await feeGlpDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await gmx.setMinter(wallet.address, true)
    await gmx.mint(extendedGmxDistributor.address, expandDecimals(200, 18))
    await extendedGmxDistributor.setTokensPerInterval("82671940000000") // 0.00008267194 GMX per second
    expect(await gmx.balanceOf(extendedGmxDistributor.address)).eq(expandDecimals(200, 18))

    await gmx.mint(user1.address, expandDecimals(1000, 18))
    expect(await gmx.balanceOf(user1.address)).eq(expandDecimals(1000, 18))
    await gmx.connect(user1).approve(stakedGmxTracker.address, maxUint256)
    await rewardRouter.connect(user1).stakeGmx(expandDecimals(1000, 18))
    expect(await gmx.balanceOf(user1.address)).eq(0)

    await bnb.mint(user1.address, expandDecimals(1, 18))
    await bnb.connect(user1).approve(glpManager.address, expandDecimals(1, 18))
    await rewardRouter.connect(user1).mintAndStakeGlp(
      bnb.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )

    expect(await stakedGmxTracker.stakedAmounts(user0.address)).eq(0)
    expect(await stakedGmxTracker.depositBalances(user0.address, gmx.address)).eq(0)
    expect(await stakedGmxTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).eq(expandDecimals(1000, 18))

    expect(await bonusGmxTracker.stakedAmounts(user0.address)).eq(0)
    expect(await bonusGmxTracker.depositBalances(user0.address, stakedGmxTracker.address)).eq(0)
    expect(await bonusGmxTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await bonusGmxTracker.depositBalances(user1.address, stakedGmxTracker.address)).eq(expandDecimals(1000, 18))

    expect(await extendedGmxTracker.stakedAmounts(user0.address)).eq(0)
    expect(await extendedGmxTracker.depositBalances(user0.address, bonusGmxTracker.address)).eq(0)
    expect(await extendedGmxTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).eq(expandDecimals(1000, 18))

    expect(await feeGmxTracker.stakedAmounts(user0.address)).eq(0)
    expect(await feeGmxTracker.depositBalances(user0.address, extendedGmxTracker.address)).eq(0)
    expect(await feeGmxTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, extendedGmxTracker.address)).eq(expandDecimals(1000, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await stakedGmxTracker.claimable(user0.address)).eq(0)
    expect(await stakedGmxTracker.claimable(user1.address)).gt(expandDecimals(1785, 18)) // 50000 / 28 => ~1785
    expect(await stakedGmxTracker.claimable(user1.address)).lt(expandDecimals(1786, 18))

    expect(await stakedGmxTracker.claimable(user0.address)).eq(0)
    expect(await stakedGlpTracker.claimable(user1.address)).gt(expandDecimals(1785, 18)) // 50000 / 28 => ~1785
    expect(await stakedGlpTracker.claimable(user1.address)).lt(expandDecimals(1786, 18))

    expect(await bonusGmxTracker.claimable(user0.address)).eq(0)
    expect(await bonusGmxTracker.claimable(user1.address)).gt("2730000000000000000") // 2.73, 1000 / 365 => ~2.74
    expect(await bonusGmxTracker.claimable(user1.address)).lt("2750000000000000000") // 2.75

    expect(await extendedGmxTracker.claimable(user0.address)).eq(0)
    expect(await extendedGmxTracker.claimable(user1.address)).gt("7130000000000000000") // 7.13, 200 / 28 => ~7.14
    expect(await extendedGmxTracker.claimable(user1.address)).lt("7150000000000000000") // 7.15

    expect(await feeGlpTracker.claimable(user0.address)).eq(0)
    expect(await feeGlpTracker.claimable(user1.address)).gt("3560000000000000000") // 3.56, 100 / 28 => ~3.57
    expect(await feeGlpTracker.claimable(user1.address)).lt("3580000000000000000") // 3.58

    await expect(rewardRouter.connect(user1).handleRewardsV2(
      user2.address, // _gmxReceiver
      true, // _shouldClaimGmx
      true, // _shouldStakeGmx
      true, // _shouldClaimEsGmx
      true, // _shouldStakeEsGmx
      true, // _shouldStakeMultiplierPoints
      true, // _shouldClaimWeth
      false // _shouldConvertWethToEth
    )).to.be.revertedWith("cannot stake GMX if _gmxReceiver != account")

    await rewardRouter.connect(user1).handleRewardsV2(
      user1.address, // _gmxReceiver
      true, // _shouldClaimGmx
      true, // _shouldStakeGmx
      true, // _shouldClaimEsGmx
      true, // _shouldStakeEsGmx
      true, // _shouldStakeMultiplierPoints
      true, // _shouldClaimWeth
      false // _shouldConvertWethToEth
    )

    expect(await stakedGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(4577, 18)) // 1007 + 1785 + 1785
    expect(await stakedGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(4579, 18)) // 1007 + 1786 + 1786
    expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).gt("1007130000000000000000") // 1007.13
    expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).lt("1007150000000000000000") // 1007.15
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).gt(expandDecimals(3570, 18)) // 50000 / 28 * 2 => ~3571
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).lt(expandDecimals(3572, 18))

    expect(await bonusGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(4577, 18))
    expect(await bonusGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(4579, 18))

    expect(await extendedGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(4580, 18))
    expect(await extendedGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(4582, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).gt(expandDecimals(4577, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).lt(expandDecimals(4579, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).gt("2730000000000000000") // 2.73, 1000 / 365 => ~2.74
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).lt("2750000000000000000") // 2.75

    expect(await feeGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(4580, 18))
    expect(await feeGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(4582, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, extendedGmxTracker.address)).gt(expandDecimals(4580, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, extendedGmxTracker.address)).lt(expandDecimals(4582, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await stakedGmxTracker.claimable(user0.address)).eq(0)
    expect(await stakedGmxTracker.claimable(user1.address)).gt(expandDecimals(1785, 18)) // 50000 / 28 => ~1785
    expect(await stakedGmxTracker.claimable(user1.address)).lt(expandDecimals(1786, 18))

    expect(await stakedGmxTracker.claimable(user0.address)).eq(0)
    expect(await stakedGlpTracker.claimable(user1.address)).gt(expandDecimals(1785, 18)) // 50000 / 28 => ~1785
    expect(await stakedGlpTracker.claimable(user1.address)).lt(expandDecimals(1786, 18))

    expect(await bonusGmxTracker.claimable(user0.address)).eq(0)
    expect(await bonusGmxTracker.claimable(user1.address)).gt("12530000000000000000") // 12.53, 4578 / 365 => ~12.54
    expect(await bonusGmxTracker.claimable(user1.address)).lt("12550000000000000000") // 12.55

    expect(await extendedGmxTracker.claimable(user0.address)).eq(0)
    expect(await extendedGmxTracker.claimable(user1.address)).gt("7130000000000000000") // 7.13, 200 / 28 => ~7.14
    expect(await extendedGmxTracker.claimable(user1.address)).lt("7150000000000000000") // 7.15

    expect(await feeGlpTracker.claimable(user0.address)).eq(0)
    expect(await feeGlpTracker.claimable(user1.address)).gt("3560000000000000000") // 3.56, 100 / 28 => ~3.57
    expect(await feeGlpTracker.claimable(user1.address)).lt("3580000000000000000") // 3.58

    await rewardRouter.connect(user1).handleRewardsV2(
      user2.address, // _gmxReceiver
      true, // _shouldClaimGmx
      false, // _shouldStakeGmx
      true, // _shouldClaimEsGmx
      true, // _shouldStakeEsGmx
      true, // _shouldStakeMultiplierPoints
      true, // _shouldClaimWeth
      false // _shouldConvertWethToEth
    )

    expect(await stakedGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(8149, 18)) // 1007 + 3571 + 3571
    expect(await stakedGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(8151, 18)) // 1007 + 3572 + 3572
    expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).gt("1007130000000000000000") // 1007.13
    expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).lt("1007150000000000000000") // 1007.15
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).gt(expandDecimals(7142, 18)) // 50000 / 28 * 4 => ~7143
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).lt(expandDecimals(7144, 18))

    expect(await bonusGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(8149, 18))
    expect(await bonusGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(8151, 18))

    expect(await extendedGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(8164, 18))
    expect(await extendedGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(8166, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).gt(expandDecimals(8149, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).lt(expandDecimals(8151, 18))
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).gt("15270000000000000000") // 15.27, (1000 / 365) + (4578 / 365) => ~15.28
    expect(await extendedGmxTracker.depositBalances(user1.address, bnGmx.address)).lt("15290000000000000000") // 15.20

    expect(await feeGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(8164, 18))
    expect(await feeGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(8166, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, extendedGmxTracker.address)).gt(expandDecimals(8164, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, extendedGmxTracker.address)).lt(expandDecimals(8166, 18))

    expect(await gmx.balanceOf(user1.address)).eq(0)
    expect(await gmx.balanceOf(user2.address)).gt("7130000000000000000") // 7.13, 200 / 28 => ~7.14
    expect(await gmx.balanceOf(user2.address)).lt("7150000000000000000") // 7.15
  })
})
