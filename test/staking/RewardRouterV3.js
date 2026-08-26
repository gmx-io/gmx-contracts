const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, increaseTime, mineBlock } = require("../shared/utilities")

use(solidity)

const { AddressZero } = ethers.constants
const secondsPerYear = 365 * 24 * 60 * 60
const PAIR_PRECISION = expandDecimals(1, 30)

describe("RewardRouterV3", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3, capsAdmin, guardian, distributor] = provider.getWallets()
  let gmx, esGmx, bnGmx, weth, glp
  let stakedGmxTracker, bonusGmxTracker, extendedGmxTracker, feeGmxTracker
  let feeGlpTracker, stakedGlpTracker
  let gmxVester, glpVester
  let issuer, season, orphan
  let router

  const deployTrackerPair = async (name, symbol, depositTokens, rewardToken, isBonus) => {
    const tracker = await deployContract("RewardTracker", [name, symbol])
    const distributorContract = isBonus
      ? await deployContract("BonusDistributor", [rewardToken, tracker.address])
      : await deployContract("RewardDistributor", [rewardToken, tracker.address])
    await tracker.initialize(depositTokens, distributorContract.address)
    return tracker
  }

  const initRouter = async (target) => {
    await target.initialize({
      weth: weth.address,
      gmx: gmx.address,
      esGmx: esGmx.address,
      bnGmx: bnGmx.address,
      glp: glp.address,
      stakedGmxTracker: stakedGmxTracker.address,
      bonusGmxTracker: bonusGmxTracker.address,
      extendedGmxTracker: extendedGmxTracker.address,
      feeGmxTracker: feeGmxTracker.address,
      feeGlpTracker: feeGlpTracker.address,
      stakedGlpTracker: stakedGlpTracker.address,
      glpManager: AddressZero,
      gmxVester: gmxVester.address,
      glpVester: glpVester.address,
      externalHandler: AddressZero,
      govToken: AddressZero,
      esGmxIssuer: issuer.address
    })
  }

  const wireHandlers = async (target) => {
    for (const tracker of [stakedGmxTracker, bonusGmxTracker, extendedGmxTracker, feeGmxTracker, feeGlpTracker, stakedGlpTracker]) {
      await tracker.setHandler(target.address, true)
    }
    await esGmx.setHandler(target.address, true)
    await bnGmx.setMinter(target.address, true)
  }

  const stakeGmxFor = async (account, amount) => {
    await gmx.mint(account.address, amount)
    await gmx.connect(account).approve(stakedGmxTracker.address, ethers.constants.MaxUint256)
    await router.connect(account).stakeGmx(amount)
  }

  let batchIndex = 0
  const issueTo = async (account, amount) => {
    batchIndex += 1
    await issuer.connect(distributor).distributeEpoch(1, batchIndex, [account.address], [amount])
  }

  beforeEach(async () => {
    batchIndex = 0
    gmx = await deployContract("Token", [])
    esGmx = await deployContract("EsGMX", [])
    bnGmx = await deployContract("MintableBaseToken", ["Bonus GMX", "bnGMX", 0])
    weth = await deployContract("Token", [])
    glp = await deployContract("MintableBaseToken", ["GMX LP", "GLP", 0])

    stakedGmxTracker = await deployTrackerPair("Staked GMX", "sGMX", [gmx.address, esGmx.address], esGmx.address, false)
    bonusGmxTracker = await deployTrackerPair("Staked + Bonus GMX", "sbGMX", [stakedGmxTracker.address], bnGmx.address, true)
    extendedGmxTracker = await deployTrackerPair("Staked + Bonus + Extended GMX", "sbeGMX", [bonusGmxTracker.address, bnGmx.address], gmx.address, false)
    feeGmxTracker = await deployTrackerPair("Staked + Bonus + Fee GMX", "sbfGMX", [extendedGmxTracker.address, bnGmx.address], weth.address, false)
    feeGlpTracker = await deployTrackerPair("Fee GLP", "fGLP", [glp.address], weth.address, false)
    stakedGlpTracker = await deployTrackerPair("Fee + Staked GLP", "fsGLP", [feeGlpTracker.address], esGmx.address, false)

    gmxVester = await deployContract("Vester", [
      "Vested GMX", "veGMX", secondsPerYear, esGmx.address, feeGmxTracker.address, gmx.address, stakedGmxTracker.address
    ])
    glpVester = await deployContract("Vester", [
      "Vested GLP", "veGLP", secondsPerYear, esGmx.address, stakedGlpTracker.address, gmx.address, stakedGlpTracker.address
    ])

    issuer = await deployContract("EsGmxIssuer", [esGmx.address])
    season = await deployContract("RatioVester", [
      "Vested GMX S1", "vGMX-S1", secondsPerYear, esGmx.address, feeGmxTracker.address, gmx.address,
      issuer.address, PAIR_PRECISION.mul(5), false
    ])
    orphan = await deployContract("RatioVester", [
      "Vested GMX Orphan", "vGMX-O", secondsPerYear, esGmx.address, feeGmxTracker.address, gmx.address,
      AddressZero, PAIR_PRECISION.mul(10), false
    ])

    // chain custody: each level holds handler status on the previous level's receipt
    await stakedGmxTracker.setHandler(bonusGmxTracker.address, true)
    await bonusGmxTracker.setHandler(extendedGmxTracker.address, true)
    await extendedGmxTracker.setHandler(feeGmxTracker.address, true)
    await feeGlpTracker.setHandler(stakedGlpTracker.address, true)

    router = await deployContract("RewardRouterV3", [])
    await initRouter(router)
    await router.addDesignatedVester(season.address)
    await router.addDesignatedVester(orphan.address)
    await wireHandlers(router)

    await esGmx.setMinter(wallet.address, true)
    await esGmx.setMinter(gmxVester.address, true)
    await esGmx.setMinter(season.address, true)
    await esGmx.setMinter(orphan.address, true)

    await issuer.setCapsAdmin(capsAdmin.address)
    await issuer.connect(capsAdmin).setDistributor(distributor.address, true)
    await issuer.setVester(season.address)
    await issuer.setHandler(router.address, true)
    await season.confirmIssuerBinding()

    await season.setCapsAdmin(capsAdmin.address)
    await season.setGuardian(guardian.address)
    await season.setHandler(router.address, true)
    await season.connect(capsAdmin).setProvisioningComplete()

    await orphan.setCapsAdmin(capsAdmin.address)
    await orphan.setHandler(router.address, true)
    await orphan.connect(capsAdmin).setProvisionCaps([user0.address], [expandDecimals(1000, 18)])
    await orphan.connect(capsAdmin).setProvisioningComplete()

    // pair custody pulls by the vesters
    await feeGmxTracker.setHandler(gmxVester.address, true)
    await feeGmxTracker.setHandler(season.address, true)
    await feeGmxTracker.setHandler(orphan.address, true)

    // handler for seeding legacy state in tests
    await gmxVester.setHandler(wallet.address, true)

    await esGmx.mint(issuer.address, expandDecimals(1000000, 18))
    await gmx.mint(season.address, expandDecimals(1000000, 18))
    await gmx.mint(orphan.address, expandDecimals(1000000, 18))
  })

  it("stakes through the full four-tracker chain", async () => {
    await stakeGmxFor(user0, expandDecimals(100, 18))
    expect(await stakedGmxTracker.stakedAmounts(user0.address)).eq(expandDecimals(100, 18))
    expect(await feeGmxTracker.stakedAmounts(user0.address)).eq(expandDecimals(100, 18))
    expect(await feeGmxTracker.balanceOf(user0.address)).eq(expandDecimals(100, 18))
  })

  it("proxy binds the caller and rejects non-designated vesters", async () => {
    await issueTo(user0, expandDecimals(1000, 18))
    await router.connect(user0).issuerClaim()
    expect(await esGmx.balanceOf(user0.address)).eq(expandDecimals(1000, 18))

    await stakeGmxFor(user0, expandDecimals(5000, 18))
    await esGmx.connect(user0).approve(season.address, expandDecimals(1000, 18))

    await expect(router.connect(user0).vesterDeposit(gmxVester.address, expandDecimals(1000, 18)))
      .to.be.revertedWith("invalid vester")

    await router.connect(user0).vesterDeposit(season.address, expandDecimals(1000, 18))
    expect(await season.balances(user0.address)).eq(expandDecimals(1000, 18))
    expect(await season.pairAmounts(user0.address)).eq(expandDecimals(5000, 18))
    expect(await feeGmxTracker.balanceOf(season.address)).eq(expandDecimals(5000, 18))
    expect(await feeGmxTracker.stakedAmounts(season.address)).eq(0)

    await increaseTime(provider, 100 * 24 * 60 * 60)
    await mineBlock(provider)
    await router.connect(user0).vesterClaim(season.address)
    expect(await gmx.balanceOf(user0.address)).gt(expandDecimals(273, 18))

    await router.connect(user0).vesterWithdraw(season.address)
    expect(await feeGmxTracker.balanceOf(user0.address)).eq(expandDecimals(5000, 18))
  })

  it("deleted-calls regression: a zeroed sender with bonusRewards transfers on V3 and reverts on V2", async () => {
    const routerV2 = await deployContract("RewardRouterV2", [])
    await routerV2.initialize({
      weth: weth.address,
      gmx: gmx.address,
      esGmx: esGmx.address,
      bnGmx: bnGmx.address,
      glp: glp.address,
      stakedGmxTracker: stakedGmxTracker.address,
      bonusGmxTracker: bonusGmxTracker.address,
      extendedGmxTracker: extendedGmxTracker.address,
      feeGmxTracker: feeGmxTracker.address,
      feeGlpTracker: feeGlpTracker.address,
      stakedGlpTracker: stakedGlpTracker.address,
      glpManager: AddressZero,
      gmxVester: gmxVester.address,
      glpVester: glpVester.address,
      externalHandler: AddressZero,
      govToken: AddressZero
    })
    await wireHandlers(routerV2)
    await gmxVester.setHandler(routerV2.address, true)
    await glpVester.setHandler(routerV2.address, true)

    // simulate the post-zeroing state: bonusRewards > 0 and deduction above tracker cumulativeRewards
    for (const account of [user0, user2]) {
      await gmxVester.setBonusRewards(account.address, expandDecimals(1000, 18))
      await gmxVester.setCumulativeRewardDeductions(account.address, expandDecimals(1000, 18))
    }
    await stakeGmxFor(user0, expandDecimals(100, 18))
    await gmx.mint(user2.address, expandDecimals(100, 18))
    await gmx.connect(user2).approve(stakedGmxTracker.address, ethers.constants.MaxUint256)
    await routerV2.connect(user2).stakeGmx(expandDecimals(100, 18))

    await routerV2.connect(user2).signalTransfer(user3.address)
    await expect(routerV2.connect(user3).acceptTransfer(user2.address))
      .to.be.revertedWith("SafeMath: subtraction overflow")

    await router.connect(user0).signalTransfer(user1.address)
    await router.connect(user1).acceptTransfer(user0.address)
    expect(await feeGmxTracker.stakedAmounts(user1.address)).eq(expandDecimals(100, 18))
    expect(await feeGmxTracker.stakedAmounts(user0.address)).eq(0)
  })

  it("claims pending issuance to the sender before the sweep and moves the cap", async () => {
    await issueTo(user0, expandDecimals(500, 18))
    await stakeGmxFor(user0, expandDecimals(10, 18))

    await router.connect(user0).signalTransfer(user1.address)
    await router.connect(user1).acceptTransfer(user0.address)

    expect(await esGmx.balanceOf(user1.address)).eq(expandDecimals(500, 18))
    expect(await esGmx.balanceOf(user0.address)).eq(0)
    expect(await issuer.claimable(user0.address)).eq(0)
    expect(await season.transferredCaps(user1.address)).eq(expandDecimals(500, 18))
    expect(await season.getVestingCap(user0.address)).eq(0)
    expect(await season.isFreshForTransfer(user1.address)).eq(false)
  })

  it("an unpayable pending claim blocks the transfer", async () => {
    await issueTo(user0, expandDecimals(500, 18))
    await stakeGmxFor(user0, expandDecimals(10, 18))
    await issuer.setGuardian(guardian.address)
    await issuer.connect(guardian).setClaimsPaused(true)

    await router.connect(user0).signalTransfer(user1.address)
    await expect(router.connect(user1).acceptTransfer(user0.address))
      .to.be.revertedWith("EsGmxIssuer: claims paused")
  })

  it("a sender mid-session in either new vester is blocked", async () => {
    await issueTo(user0, expandDecimals(100, 18))
    await router.connect(user0).issuerClaim()
    await stakeGmxFor(user0, expandDecimals(1000, 18))
    await esGmx.connect(user0).approve(season.address, expandDecimals(100, 18))
    await router.connect(user0).vesterDeposit(season.address, expandDecimals(100, 18))

    await expect(router.connect(user0).signalTransfer(user1.address))
      .to.be.revertedWith("sender has open session")

    await router.connect(user0).vesterWithdraw(season.address)

    const esBalance = await esGmx.balanceOf(user0.address)
    await esGmx.connect(user0).approve(orphan.address, esBalance)
    await router.connect(user0).vesterDeposit(orphan.address, esBalance)
    await expect(router.connect(user0).signalTransfer(user1.address))
      .to.be.revertedWith("sender has open session")
  })

  it("adds the legacy pairAmounts check the balance-only check misses", async () => {
    await stakeGmxFor(user0, expandDecimals(1000, 18))
    await gmxVester.setTransferredAverageStakedAmounts(user0.address, expandDecimals(1000, 18))
    await gmxVester.setTransferredCumulativeRewards(user0.address, expandDecimals(100, 18))

    await esGmx.mint(user0.address, expandDecimals(100, 18))
    await esGmx.connect(user0).approve(gmxVester.address, expandDecimals(100, 18))
    await gmxVester.connect(user0).deposit(expandDecimals(100, 18))
    expect(await gmxVester.pairAmounts(user0.address)).eq(expandDecimals(1000, 18))

    await increaseTime(provider, 366 * 24 * 60 * 60)
    await mineBlock(provider)
    await gmx.mint(gmxVester.address, expandDecimals(100, 18))
    await gmxVester.connect(user0).claim()
    expect(await gmxVester.balanceOf(user0.address)).eq(0)

    await expect(router.connect(user0).signalTransfer(user1.address))
      .to.be.revertedWith("sender has pair amounts")
  })

  it("an empty designated-vester allowlist blocks transfers", async () => {
    const bare = await deployContract("RewardRouterV3", [])
    await initRouter(bare)
    await expect(bare.connect(user0).signalTransfer(user1.address))
      .to.be.revertedWith("no designated vesters")
    await expect(bare.connect(user1).acceptTransfer(user0.address))
      .to.be.revertedWith("no designated vesters")
  })

  it("compound succeeds with pair collateral locked in a new vester", async () => {
    await issueTo(user0, expandDecimals(1000, 18))
    await router.connect(user0).issuerClaim()
    await stakeGmxFor(user0, expandDecimals(6000, 18))
    await esGmx.connect(user0).approve(season.address, expandDecimals(1000, 18))
    await router.connect(user0).vesterDeposit(season.address, expandDecimals(1000, 18))

    await router.connect(user0).compound()
    expect(await feeGmxTracker.stakedAmounts(user0.address)).eq(expandDecimals(6000, 18))
  })

  it("an issuer claims pause does not block transfers for senders with nothing pending", async () => {
    await stakeGmxFor(user0, expandDecimals(10, 18))
    await issuer.setGuardian(guardian.address)
    await issuer.connect(guardian).setClaimsPaused(true)

    await router.connect(user0).signalTransfer(user1.address)
    await router.connect(user1).acceptTransfer(user0.address)
    expect(await feeGmxTracker.stakedAmounts(user1.address)).eq(expandDecimals(10, 18))
  })

  it("handleRewards skips vesters without a handler grant or with a frozen account", async () => {
    await stakeGmxFor(user0, expandDecimals(10, 18))

    await season.setHandler(router.address, false)
    await orphan.setHandler(router.address, false)
    await router.connect(user0).handleRewards(true, false, false, false, false, false, false)

    await season.setHandler(router.address, true)
    await orphan.setHandler(router.address, true)
    await season.connect(guardian).setAccountFrozen(user0.address, true)
    await router.connect(user0).handleRewards(true, false, false, false, false, false, false)
  })

  it("acceptTransfer claims each designated vester's own issuer, not the router slot", async () => {
    await router.setEsGmxIssuer(AddressZero)
    await issueTo(user0, expandDecimals(200, 18))
    await stakeGmxFor(user0, expandDecimals(10, 18))

    await router.connect(user0).signalTransfer(user1.address)
    await router.connect(user1).acceptTransfer(user0.address)
    expect(await esGmx.balanceOf(user1.address)).eq(expandDecimals(200, 18))
    expect(await issuer.claimable(user0.address)).eq(0)
  })
})
