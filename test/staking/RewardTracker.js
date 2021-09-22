const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed } = require("../shared/utilities")
const { toChainlinkPrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")

use(solidity)

describe("RewardTracker", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let rewardTracker
  let gmx
  let esGmx
  let rewardDistributor

  beforeEach(async () => {
    rewardTracker = await deployContract("RewardTracker", ["RT_NAME", "RT_SYMBOL"])
    gmx = await deployContract("GMX", []);
    esGmx = await deployContract("EsGMX", []);
    rewardDistributor = await deployContract("RewardDistributor", [esGmx.address, rewardTracker.address])
    await rewardDistributor.updateLastDistributionTime()

    await rewardTracker.initialize([gmx.address, esGmx.address], rewardDistributor.address)
  })

  it("inits", async () => {
    expect(await rewardTracker.isInitialized()).eq(true)
    expect(await rewardTracker.isDepositToken(wallet.address)).eq(false)
    expect(await rewardTracker.isDepositToken(gmx.address)).eq(true)
    expect(await rewardTracker.isDepositToken(esGmx.address)).eq(true)
    expect(await rewardTracker.distributor()).eq(rewardDistributor.address)
    expect(await rewardTracker.distributor()).eq(rewardDistributor.address)
    expect(await rewardTracker.rewardToken()).eq(esGmx.address)

    await expect(rewardTracker.initialize([gmx.address, esGmx.address], rewardDistributor.address))
      .to.be.revertedWith("RewardTracker: already initialized")
  })

  it("setDepositToken", async () => {
    await expect(rewardTracker.connect(user0).setDepositToken(user1.address, true))
      .to.be.revertedWith("Governable: forbidden")

    await rewardTracker.setGov(user0.address)

    expect(await rewardTracker.isDepositToken(user1.address)).eq(false)
    await rewardTracker.connect(user0).setDepositToken(user1.address, true)
    expect(await rewardTracker.isDepositToken(user1.address)).eq(true)
    await rewardTracker.connect(user0).setDepositToken(user1.address, false)
    expect(await rewardTracker.isDepositToken(user1.address)).eq(false)
  })

  it("setInPrivateTransferMode", async () => {
    await expect(rewardTracker.connect(user0).setInPrivateTransferMode(true))
      .to.be.revertedWith("Governable: forbidden")

    await rewardTracker.setGov(user0.address)

    expect(await rewardTracker.inPrivateTransferMode()).eq(false)
    await rewardTracker.connect(user0).setInPrivateTransferMode(true)
    expect(await rewardTracker.inPrivateTransferMode()).eq(true)
  })

  it("setInPrivateStakingMode", async () => {
    await expect(rewardTracker.connect(user0).setInPrivateStakingMode(true))
      .to.be.revertedWith("Governable: forbidden")

    await rewardTracker.setGov(user0.address)

    expect(await rewardTracker.inPrivateStakingMode()).eq(false)
    await rewardTracker.connect(user0).setInPrivateStakingMode(true)
    expect(await rewardTracker.inPrivateStakingMode()).eq(true)
  })

  it("setHandler", async () => {
    await expect(rewardTracker.connect(user0).setHandler(user1.address, true))
      .to.be.revertedWith("Governable: forbidden")

    await rewardTracker.setGov(user0.address)

    expect(await rewardTracker.isHandler(user1.address)).eq(false)
    await rewardTracker.connect(user0).setHandler(user1.address, true)
    expect(await rewardTracker.isHandler(user1.address)).eq(true)
  })

  it("withdrawToken", async () => {
    await gmx.setMinter(wallet.address, true)
    await gmx.mint(rewardTracker.address, 2000)
    await expect(rewardTracker.connect(user0).withdrawToken(gmx.address, user1.address, 2000))
      .to.be.revertedWith("Governable: forbidden")

    await rewardTracker.setGov(user0.address)

    expect(await gmx.balanceOf(user1.address)).eq(0)
    await rewardTracker.connect(user0).withdrawToken(gmx.address, user1.address, 2000)
    expect(await gmx.balanceOf(user1.address)).eq(2000)
  })

  it("stake, unstake, claim", async () => {
    await esGmx.setMinter(wallet.address, true)
    await esGmx.mint(rewardDistributor.address, expandDecimals(50000, 18))
    await rewardDistributor.setTokensPerInterval("20667989410000000") // 0.02066798941 esGmx per second
    await gmx.setMinter(wallet.address, true)
    await gmx.mint(user0.address, expandDecimals(1000, 18))

    await rewardTracker.setInPrivateStakingMode(true)
    await expect(rewardTracker.connect(user0).stake(gmx.address, expandDecimals(1000, 18)))
      .to.be.revertedWith("RewardTracker: action not enabled")

    await rewardTracker.setInPrivateStakingMode(false)

    await expect(rewardTracker.connect(user0).stake(user1.address, 0))
      .to.be.revertedWith("RewardTracker: invalid _amount")

    await expect(rewardTracker.connect(user0).stake(user1.address, expandDecimals(1000, 18)))
      .to.be.revertedWith("RewardTracker: invalid _depositToken")

    await expect(rewardTracker.connect(user0).stake(gmx.address, expandDecimals(1000, 18)))
      .to.be.revertedWith("BaseToken: transfer amount exceeds allowance")

    await gmx.connect(user0).approve(rewardTracker.address, expandDecimals(1000, 18))
    await rewardTracker.connect(user0).stake(gmx.address, expandDecimals(1000, 18))
    expect(await rewardTracker.stakedAmounts(user0.address)).eq(expandDecimals(1000, 18))
    expect(await rewardTracker.depositBalances(user0.address, gmx.address)).eq(expandDecimals(1000, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await rewardTracker.claimable(user0.address)).gt(expandDecimals(1785, 18)) // 50000 / 28 => ~1785
    expect(await rewardTracker.claimable(user0.address)).lt(expandDecimals(1786, 18))

    await esGmx.mint(user1.address, expandDecimals(500, 18))
    await esGmx.connect(user1).approve(rewardTracker.address, expandDecimals(500, 18))
    await rewardTracker.connect(user1).stake(esGmx.address, expandDecimals(500, 18))
    expect(await rewardTracker.stakedAmounts(user1.address)).eq(expandDecimals(500, 18))
    expect(await rewardTracker.stakedAmounts(user0.address)).eq(expandDecimals(1000, 18))
    expect(await rewardTracker.depositBalances(user0.address, gmx.address)).eq(expandDecimals(1000, 18))
    expect(await rewardTracker.depositBalances(user0.address, esGmx.address)).eq(0)
    expect(await rewardTracker.depositBalances(user1.address, gmx.address)).eq(0)
    expect(await rewardTracker.depositBalances(user1.address, esGmx.address)).eq(expandDecimals(500, 18))
    expect(await rewardTracker.totalDepositSupply(gmx.address)).eq(expandDecimals(1000, 18))
    expect(await rewardTracker.totalDepositSupply(esGmx.address)).eq(expandDecimals(500, 18))

    expect(await rewardTracker.averageStakedAmounts(user0.address)).eq(0)
    expect(await rewardTracker.cumulativeRewards(user0.address)).eq(0)
    expect(await rewardTracker.averageStakedAmounts(user1.address)).eq(0)
    expect(await rewardTracker.cumulativeRewards(user1.address)).eq(0)

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await rewardTracker.claimable(user0.address)).gt(expandDecimals(1785 + 1190, 18))
    expect(await rewardTracker.claimable(user0.address)).lt(expandDecimals(1786 + 1191, 18))

    expect(await rewardTracker.claimable(user1.address)).gt(expandDecimals(595, 18))
    expect(await rewardTracker.claimable(user1.address)).lt(expandDecimals(596, 18))

    await expect(rewardTracker.connect(user0).unstake(esGmx.address, expandDecimals(1001, 18)))
      .to.be.revertedWith("RewardTracker: _amount exceeds stakedAmount");

    await expect(rewardTracker.connect(user0).unstake(esGmx.address, expandDecimals(1000, 18)))
      .to.be.revertedWith("RewardTracker: _amount exceeds depositBalance");

    await expect(rewardTracker.connect(user0).unstake(gmx.address, expandDecimals(1001, 18)))
      .to.be.revertedWith("RewardTracker: _amount exceeds stakedAmount");

    expect(await gmx.balanceOf(user0.address)).eq(0)
    await rewardTracker.connect(user0).unstake(gmx.address, expandDecimals(1000, 18))
    expect(await gmx.balanceOf(user0.address)).eq(expandDecimals(1000, 18))
    expect(await rewardTracker.totalDepositSupply(gmx.address)).eq(0)
    expect(await rewardTracker.totalDepositSupply(esGmx.address)).eq(expandDecimals(500, 18))

    expect(await rewardTracker.averageStakedAmounts(user0.address)).eq(expandDecimals(1000, 18))
    expect(await rewardTracker.cumulativeRewards(user0.address)).gt(expandDecimals(1785+ 1190, 18))
    expect(await rewardTracker.cumulativeRewards(user0.address)).lt(expandDecimals(1786+ 1191, 18))
    expect(await rewardTracker.averageStakedAmounts(user1.address)).eq(0)
    expect(await rewardTracker.cumulativeRewards(user1.address)).eq(0)

    await expect(rewardTracker.connect(user0).unstake(gmx.address, 1))
      .to.be.revertedWith("RewardTracker: _amount exceeds stakedAmount");

    expect(await esGmx.balanceOf(user0.address)).eq(0)
    await rewardTracker.connect(user0).claim(user2.address)
    expect(await esGmx.balanceOf(user2.address)).gt(expandDecimals(1785 + 1190, 18))
    expect(await esGmx.balanceOf(user2.address)).lt(expandDecimals(1786 + 1191, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await rewardTracker.claimable(user0.address)).eq(0)

    expect(await rewardTracker.claimable(user1.address)).gt(expandDecimals(595 + 1785, 18))
    expect(await rewardTracker.claimable(user1.address)).lt(expandDecimals(596 + 1786, 18))

    await gmx.mint(user1.address, expandDecimals(300, 18))
    await gmx.connect(user1).approve(rewardTracker.address, expandDecimals(300, 18))
    await rewardTracker.connect(user1).stake(gmx.address, expandDecimals(300, 18))
    expect(await rewardTracker.totalDepositSupply(gmx.address)).eq(expandDecimals(300, 18))
    expect(await rewardTracker.totalDepositSupply(esGmx.address)).eq(expandDecimals(500, 18))

    expect(await rewardTracker.averageStakedAmounts(user0.address)).eq(expandDecimals(1000, 18))
    expect(await rewardTracker.cumulativeRewards(user0.address)).gt(expandDecimals(1785+ 1190, 18))
    expect(await rewardTracker.cumulativeRewards(user0.address)).lt(expandDecimals(1786+ 1191, 18))
    expect(await rewardTracker.averageStakedAmounts(user1.address)).eq(expandDecimals(500, 18))
    expect(await rewardTracker.cumulativeRewards(user1.address)).gt(expandDecimals(595 + 1785, 18))
    expect(await rewardTracker.cumulativeRewards(user1.address)).lt(expandDecimals(596 + 1786, 18))

    await expect(rewardTracker.connect(user1).unstake(gmx.address, expandDecimals(301, 18)))
      .to.be.revertedWith("RewardTracker: _amount exceeds depositBalance");

    await expect(rewardTracker.connect(user1).unstake(esGmx.address, expandDecimals(501, 18)))
      .to.be.revertedWith("RewardTracker: _amount exceeds depositBalance");

    await increaseTime(provider, 2 * 24 * 60 * 60)
    await mineBlock(provider)

    await rewardTracker.connect(user0).claim(user2.address)
    await rewardTracker.connect(user1).claim(user3.address)

    expect(await rewardTracker.averageStakedAmounts(user0.address)).eq(expandDecimals(1000, 18))
    expect(await rewardTracker.cumulativeRewards(user0.address)).gt(expandDecimals(1785 + 1190, 18))
    expect(await rewardTracker.cumulativeRewards(user0.address)).lt(expandDecimals(1786 + 1191, 18))
    expect(await rewardTracker.averageStakedAmounts(user1.address)).gt(expandDecimals(679, 18))
    expect(await rewardTracker.averageStakedAmounts(user1.address)).lt(expandDecimals(681, 18))
    expect(await rewardTracker.cumulativeRewards(user1.address)).gt(expandDecimals(595 + 1785 + 1785 * 2, 18))
    expect(await rewardTracker.cumulativeRewards(user1.address)).lt(expandDecimals(596 + 1786 + 1786 * 2, 18))

    await increaseTime(provider, 2 * 24 * 60 * 60)
    await mineBlock(provider)

    await rewardTracker.connect(user0).claim(user2.address)
    await rewardTracker.connect(user1).claim(user3.address)

    expect(await rewardTracker.averageStakedAmounts(user0.address)).eq(expandDecimals(1000, 18))
    expect(await rewardTracker.cumulativeRewards(user0.address)).gt(expandDecimals(1785 + 1190, 18))
    expect(await rewardTracker.cumulativeRewards(user0.address)).lt(expandDecimals(1786 + 1191, 18))
    expect(await rewardTracker.averageStakedAmounts(user1.address)).gt(expandDecimals(724, 18))
    expect(await rewardTracker.averageStakedAmounts(user1.address)).lt(expandDecimals(726, 18))
    expect(await rewardTracker.cumulativeRewards(user1.address)).gt(expandDecimals(595 + 1785 + 1785 * 4, 18))
    expect(await rewardTracker.cumulativeRewards(user1.address)).lt(expandDecimals(596 + 1786 + 1786 * 4, 18))

    expect(await esGmx.balanceOf(user2.address)).eq(await rewardTracker.cumulativeRewards(user0.address))
    expect(await esGmx.balanceOf(user3.address)).eq(await rewardTracker.cumulativeRewards(user1.address))

    expect(await gmx.balanceOf(user1.address)).eq(0)
    expect(await esGmx.balanceOf(user1.address)).eq(0)
    await rewardTracker.connect(user1).unstake(gmx.address, expandDecimals(300, 18))
    expect(await gmx.balanceOf(user1.address)).eq(expandDecimals(300, 18))
    expect(await esGmx.balanceOf(user1.address)).eq(0)
    await rewardTracker.connect(user1).unstake(esGmx.address, expandDecimals(500, 18))
    expect(await gmx.balanceOf(user1.address)).eq(expandDecimals(300, 18))
    expect(await esGmx.balanceOf(user1.address)).eq(expandDecimals(500, 18))
    expect(await rewardTracker.totalDepositSupply(gmx.address)).eq(0)
    expect(await rewardTracker.totalDepositSupply(esGmx.address)).eq(0)

    await rewardTracker.connect(user0).claim(user2.address)
    await rewardTracker.connect(user1).claim(user3.address)

    const distributed = expandDecimals(50000, 18).sub(await esGmx.balanceOf(rewardDistributor.address))
    const cumulativeReward0 = await rewardTracker.cumulativeRewards(user0.address)
    const cumulativeReward1 = await rewardTracker.cumulativeRewards(user1.address)
    const totalCumulativeReward = cumulativeReward0.add(cumulativeReward1)

    expect(distributed).gt(totalCumulativeReward.sub(expandDecimals(1, 18)))
    expect(distributed).lt(totalCumulativeReward.add(expandDecimals(1, 18)))
  })

  it("stakeForAccount, unstakeForAccount, claimForAccount", async () => {
    await esGmx.setMinter(wallet.address, true)
    await esGmx.mint(rewardDistributor.address, expandDecimals(50000, 18))
    await rewardDistributor.setTokensPerInterval("20667989410000000") // 0.02066798941 esGmx per second
    await gmx.setMinter(wallet.address, true)
    await gmx.mint(wallet.address, expandDecimals(1000, 18))

    await rewardTracker.setInPrivateStakingMode(true)
    await expect(rewardTracker.connect(user0).stake(gmx.address, expandDecimals(1000, 18)))
      .to.be.revertedWith("RewardTracker: action not enabled")

    await expect(rewardTracker.connect(user2).stakeForAccount(wallet.address, user0.address, gmx.address, expandDecimals(1000, 18)))
      .to.be.revertedWith("RewardTracker: forbidden")

    await rewardTracker.setHandler(user2.address, true)
    await expect(rewardTracker.connect(user2).stakeForAccount(wallet.address, user0.address, gmx.address, expandDecimals(1000, 18)))
      .to.be.revertedWith("BaseToken: transfer amount exceeds allowance")

    await gmx.connect(wallet).approve(rewardTracker.address, expandDecimals(1000, 18))

    await rewardTracker.connect(user2).stakeForAccount(wallet.address, user0.address, gmx.address, expandDecimals(1000, 18))
    expect(await rewardTracker.stakedAmounts(user0.address)).eq(expandDecimals(1000, 18))
    expect(await rewardTracker.depositBalances(user0.address, gmx.address)).eq(expandDecimals(1000, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await rewardTracker.claimable(user0.address)).gt(expandDecimals(1785, 18)) // 50000 / 28 => ~1785
    expect(await rewardTracker.claimable(user0.address)).lt(expandDecimals(1786, 18))

    await rewardTracker.setHandler(user2.address, false)
    await expect(rewardTracker.connect(user2).unstakeForAccount(user0.address, esGmx.address, expandDecimals(1000, 18), user1.address))
      .to.be.revertedWith("RewardTracker: forbidden")

    await rewardTracker.setHandler(user2.address, true)

    await expect(rewardTracker.connect(user2).unstakeForAccount(user0.address, esGmx.address, expandDecimals(1000, 18), user1.address))
      .to.be.revertedWith("RewardTracker: _amount exceeds depositBalance")

    await expect(rewardTracker.connect(user2).unstakeForAccount(user0.address, gmx.address, expandDecimals(1001, 18), user1.address))
      .to.be.revertedWith("RewardTracker: _amount exceeds stakedAmount")

    expect(await gmx.balanceOf(user0.address)).eq(0)
    expect(await rewardTracker.stakedAmounts(user0.address)).eq(expandDecimals(1000, 18))
    expect(await rewardTracker.depositBalances(user0.address, gmx.address)).eq(expandDecimals(1000, 18))

    expect(await rewardTracker.balanceOf(user0.address)).eq(expandDecimals(1000, 18))
    await rewardTracker.connect(user0).transfer(user1.address, expandDecimals(50, 18))
    expect(await rewardTracker.balanceOf(user0.address)).eq(expandDecimals(950, 18))
    expect(await rewardTracker.balanceOf(user1.address)).eq(expandDecimals(50, 18))

    await rewardTracker.setInPrivateTransferMode(true)
    await expect(rewardTracker.connect(user0).transfer(user1.address, expandDecimals(50, 18)))
      .to.be.revertedWith("RewardTracker: forbidden")

    await rewardTracker.setHandler(user2.address, false)
    await expect(rewardTracker.connect(user2).transferFrom(user1.address, user0.address, expandDecimals(50, 18)))
      .to.be.revertedWith("RewardTracker: transfer amount exceeds allowance")

    await rewardTracker.setHandler(user2.address, true)
    await rewardTracker.connect(user2).transferFrom(user1.address, user0.address, expandDecimals(50, 18))
    expect(await rewardTracker.balanceOf(user0.address)).eq(expandDecimals(1000, 18))
    expect(await rewardTracker.balanceOf(user1.address)).eq(0)

    await rewardTracker.connect(user2).unstakeForAccount(user0.address, gmx.address, expandDecimals(100, 18), user1.address)

    expect(await gmx.balanceOf(user1.address)).eq(expandDecimals(100, 18))
    expect(await rewardTracker.stakedAmounts(user0.address)).eq(expandDecimals(900, 18))
    expect(await rewardTracker.depositBalances(user0.address, gmx.address)).eq(expandDecimals(900, 18))

    await expect(rewardTracker.connect(user3).claimForAccount(user0.address, user3.address))
      .to.be.revertedWith("RewardTracker: forbidden")

    expect(await rewardTracker.claimable(user0.address)).gt(expandDecimals(1785, 18))
    expect(await rewardTracker.claimable(user0.address)).lt(expandDecimals(1787, 18))
    expect(await esGmx.balanceOf(user0.address)).eq(0)
    expect(await esGmx.balanceOf(user3.address)).eq(0)

    await rewardTracker.connect(user2).claimForAccount(user0.address, user3.address)

    expect(await rewardTracker.claimable(user0.address)).eq(0)
    expect(await esGmx.balanceOf(user3.address)).gt(expandDecimals(1785, 18))
    expect(await esGmx.balanceOf(user3.address)).lt(expandDecimals(1787, 18))
  })
})
