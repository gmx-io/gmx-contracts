const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed, print, newWallet } = require("../shared/utilities")
const { toChainlinkPrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig } = require("../core/Vault/helpers")
const { ADDRESS_ZERO } = require("@uniswap/v3-sdk")

use(solidity)

describe("RewardRouter", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()

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
  let feeGmxTracker
  let feeGmxDistributor

  let feeGlpTracker
  let feeGlpDistributor
  let stakedGlpTracker
  let stakedGlpDistributor

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

    feeGmxTracker = await deployContract("RewardTracker", ["Staked + Bonus + Fee GMX", "sbfGMX"])
    feeGmxDistributor = await deployContract("RewardDistributor", [eth.address, feeGmxTracker.address])
    await feeGmxTracker.initialize([bonusGmxTracker.address, bnGmx.address], feeGmxDistributor.address)
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

    await stakedGmxTracker.setInPrivateTransferMode(true)
    await stakedGmxTracker.setInPrivateStakingMode(true)
    await bonusGmxTracker.setInPrivateTransferMode(true)
    await bonusGmxTracker.setInPrivateStakingMode(true)
    await bonusGmxTracker.setInPrivateClaimingMode(true)
    await feeGmxTracker.setInPrivateTransferMode(true)
    await feeGmxTracker.setInPrivateStakingMode(true)

    await feeGlpTracker.setInPrivateTransferMode(true)
    await feeGlpTracker.setInPrivateStakingMode(true)
    await stakedGlpTracker.setInPrivateTransferMode(true)
    await stakedGlpTracker.setInPrivateStakingMode(true)

    rewardRouter = await deployContract("RewardRouter", [])
    await rewardRouter.initialize(
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
      glpManager.address
    )

    // allow rewardRouter to stake in stakedGmxTracker
    await stakedGmxTracker.setHandler(rewardRouter.address, true)
    // allow bonusGmxTracker to stake stakedGmxTracker
    await stakedGmxTracker.setHandler(bonusGmxTracker.address, true)
    // allow rewardRouter to stake in bonusGmxTracker
    await bonusGmxTracker.setHandler(rewardRouter.address, true)
    // allow bonusGmxTracker to stake feeGmxTracker
    await bonusGmxTracker.setHandler(feeGmxTracker.address, true)
    await bonusGmxDistributor.setBonusMultiplier(10000)
    // allow rewardRouter to stake in feeGmxTracker
    await feeGmxTracker.setHandler(rewardRouter.address, true)
    // allow feeGmxTracker to stake bnGmx
    await bnGmx.setHandler(feeGmxTracker.address, true)
    // allow rewardRouter to burn bnGmx
    await bnGmx.setMinter(rewardRouter.address, true)

    // allow rewardRouter to mint in glpManager
    await glpManager.setHandler(rewardRouter.address, true)
    // allow rewardRouter to stake in feeGlpTracker
    await feeGlpTracker.setHandler(rewardRouter.address, true)
    // allow stakedGlpTracker to stake feeGlpTracker
    await feeGlpTracker.setHandler(stakedGlpTracker.address, true)
    // allow rewardRouter to sake in stakedGlpTracker
    await stakedGlpTracker.setHandler(rewardRouter.address, true)
    // allow feeGlpTracker to stake glp
    await glp.setHandler(feeGlpTracker.address, true)

    // mint esGmx for distributors
    await esGmx.setMinter(wallet.address, true)
    await esGmx.mint(stakedGmxDistributor.address, expandDecimals(50000, 18))
    await stakedGmxDistributor.setTokensPerInterval("20667989410000000") // 0.02066798941 esGmx per second
    await esGmx.mint(stakedGlpDistributor.address, expandDecimals(50000, 18))
    await stakedGlpDistributor.setTokensPerInterval("20667989410000000") // 0.02066798941 esGmx per second

    await esGmx.setInPrivateTransferMode(true)
    await esGmx.setHandler(stakedGmxDistributor.address, true)
    await esGmx.setHandler(stakedGlpDistributor.address, true)
    await esGmx.setHandler(stakedGmxTracker.address, true)
    await esGmx.setHandler(stakedGlpTracker.address, true)
    await esGmx.setHandler(rewardRouter.address, true)

    // mint bnGmx for distributor
    await bnGmx.setMinter(wallet.address, true)
    await bnGmx.mint(bonusGmxDistributor.address, expandDecimals(1500, 18))
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
    expect(await rewardRouter.feeGmxTracker()).eq(feeGmxTracker.address)

    expect(await rewardRouter.feeGlpTracker()).eq(feeGlpTracker.address)
    expect(await rewardRouter.stakedGlpTracker()).eq(stakedGlpTracker.address)

    expect(await rewardRouter.glpManager()).eq(glpManager.address)

    await expect(rewardRouter.initialize(
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
      glpManager.address
    )).to.be.revertedWith("RewardRouter: already initialized")
  })

  it("stakeGmxForAccount, stakeGmx, stakeEsGmx, unstakeGmx, unstakeEsGmx, claimEsGmx, claimFees, compound, batchCompoundForAccounts", async () => {
    await eth.mint(feeGmxDistributor.address, expandDecimals(100, 18))
    await feeGmxDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await gmx.setMinter(wallet.address, true)
    await gmx.mint(user0.address, expandDecimals(1500, 18))
    expect(await gmx.balanceOf(user0.address)).eq(expandDecimals(1500, 18))

    await gmx.connect(user0).approve(stakedGmxTracker.address, expandDecimals(1000, 18))
    await expect(rewardRouter.connect(user0).stakeGmxForAccount(user1.address, expandDecimals(1000, 18)))
      .to.be.revertedWith("Governable: forbidden")

    await rewardRouter.setGov(user0.address)
    await rewardRouter.connect(user0).stakeGmxForAccount(user1.address, expandDecimals(800, 18))
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

    expect(await feeGmxTracker.stakedAmounts(user0.address)).eq(0)
    expect(await feeGmxTracker.depositBalances(user0.address, bonusGmxTracker.address)).eq(0)
    expect(await feeGmxTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).eq(expandDecimals(1000, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await stakedGmxTracker.claimable(user0.address)).eq(0)
    expect(await stakedGmxTracker.claimable(user1.address)).gt(expandDecimals(1785, 18)) // 50000 / 28 => ~1785
    expect(await stakedGmxTracker.claimable(user1.address)).lt(expandDecimals(1786, 18))

    expect(await bonusGmxTracker.claimable(user0.address)).eq(0)
    expect(await bonusGmxTracker.claimable(user1.address)).gt("2730000000000000000") // 2.73, 1000 / 365 => ~2.74
    expect(await bonusGmxTracker.claimable(user1.address)).lt("2750000000000000000") // 2.75

    expect(await feeGmxTracker.claimable(user0.address)).eq(0)
    expect(await feeGmxTracker.claimable(user1.address)).gt("3560000000000000000") // 3.56, 100 / 28 => ~3.57
    expect(await feeGmxTracker.claimable(user1.address)).lt("3580000000000000000") // 3.58

    await esGmx.setMinter(wallet.address, true)
    await esGmx.mint(user2.address, expandDecimals(500, 18))
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

    expect(await feeGmxTracker.stakedAmounts(user0.address)).eq(0)
    expect(await feeGmxTracker.depositBalances(user0.address, bonusGmxTracker.address)).eq(0)
    expect(await feeGmxTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).eq(expandDecimals(1000, 18))
    expect(await feeGmxTracker.stakedAmounts(user2.address)).eq(expandDecimals(500, 18))
    expect(await feeGmxTracker.depositBalances(user2.address, bonusGmxTracker.address)).eq(expandDecimals(500, 18))

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

    const tx0 = await rewardRouter.connect(user1).compound()
    await reportGasUsed(provider, tx0, "compound gas used")

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    const tx1 = await rewardRouter.connect(user0).batchCompoundForAccounts([user1.address, user2.address])
    await reportGasUsed(provider, tx1, "batchCompoundForAccounts gas used")

    expect(await stakedGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(3643, 18))
    expect(await stakedGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(3645, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).eq(expandDecimals(1000, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).gt(expandDecimals(2643, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).lt(expandDecimals(2645, 18))

    expect(await bonusGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(3643, 18))
    expect(await bonusGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(3645, 18))

    expect(await feeGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(3657, 18))
    expect(await feeGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(3659, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).gt(expandDecimals(3643, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).lt(expandDecimals(3645, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, bnGmx.address)).gt("14100000000000000000") // 14.1
    expect(await feeGmxTracker.depositBalances(user1.address, bnGmx.address)).lt("14300000000000000000") // 14.3

    expect(await gmx.balanceOf(user1.address)).eq(0)
    await rewardRouter.connect(user1).unstakeGmx(expandDecimals(300, 18))
    expect(await gmx.balanceOf(user1.address)).eq(expandDecimals(300, 18))

    expect(await stakedGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(3343, 18))
    expect(await stakedGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(3345, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).eq(expandDecimals(700, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).gt(expandDecimals(2643, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).lt(expandDecimals(2645, 18))

    expect(await bonusGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(3343, 18))
    expect(await bonusGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(3345, 18))

    expect(await feeGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(3357, 18))
    expect(await feeGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(3359, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).gt(expandDecimals(3343, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).lt(expandDecimals(3345, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, bnGmx.address)).gt("13000000000000000000") // 13
    expect(await feeGmxTracker.depositBalances(user1.address, bnGmx.address)).lt("13100000000000000000") // 13.1

    const esGmxBalance1 = await esGmx.balanceOf(user1.address)
    const esGmxUnstakeBalance1 = await stakedGmxTracker.depositBalances(user1.address, esGmx.address)
    await rewardRouter.connect(user1).unstakeEsGmx(esGmxUnstakeBalance1)
    expect(await esGmx.balanceOf(user1.address)).eq(esGmxBalance1.add(esGmxUnstakeBalance1))

    expect(await stakedGmxTracker.stakedAmounts(user1.address)).eq(expandDecimals(700, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).eq(expandDecimals(700, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).eq(0)

    expect(await bonusGmxTracker.stakedAmounts(user1.address)).eq(expandDecimals(700, 18))

    expect(await feeGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(702, 18))
    expect(await feeGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(703, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).eq(expandDecimals(700, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, bnGmx.address)).gt("2720000000000000000") // 2.72
    expect(await feeGmxTracker.depositBalances(user1.address, bnGmx.address)).lt("2740000000000000000") // 2.74

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
    await reportGasUsed(provider, tx1, "batchCompoundForAccounts gas used")

    expect(await stakedGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(4165, 18))
    expect(await stakedGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(4167, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).eq(0)
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).gt(expandDecimals(4165, 18))
    expect(await stakedGmxTracker.depositBalances(user1.address, esGmx.address)).lt(expandDecimals(4167, 18))

    expect(await bonusGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(4165, 18))
    expect(await bonusGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(4167, 18))

    expect(await feeGmxTracker.stakedAmounts(user1.address)).gt(expandDecimals(4179, 18))
    expect(await feeGmxTracker.stakedAmounts(user1.address)).lt(expandDecimals(4180, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).gt(expandDecimals(4165, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, bonusGmxTracker.address)).lt(expandDecimals(4167, 18))
    expect(await feeGmxTracker.depositBalances(user1.address, bnGmx.address)).gt("12900000000000000000") // 12.9
    expect(await feeGmxTracker.depositBalances(user1.address, bnGmx.address)).lt("13100000000000000000") // 13.1

    expect(await feeGlpTracker.stakedAmounts(user1.address)).eq("598300000000000000000") // 598.3
    expect(await stakedGlpTracker.stakedAmounts(user1.address)).eq("598300000000000000000")
    expect(await bnb.balanceOf(user1.address)).eq("993676666666666666") // ~0.99
  })

  it("mintAndStakeGlpETH, unstakeAndRedeemGlpETH", async () => {
    const receiver0 = newWallet()
    await expect(rewardRouter.connect(user0).mintAndStakeGlpETH(expandDecimals(300, 18), expandDecimals(300, 18), { value: 0 }))
      .to.be.revertedWith("RewardRouter: invalid msg.value")

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
})
