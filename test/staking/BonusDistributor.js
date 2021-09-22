const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed, print } = require("../shared/utilities")
const { toChainlinkPrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")

use(solidity)

describe("BonusDistributor", function () {
  const provider = waffle.provider
  const [wallet, rewardRouter, user0, user1, user2, user3] = provider.getWallets()
  let gmx
  let esGmx
  let bnGmx
  let stakedGmxTracker
  let stakedGmxDistributor
  let bonusGmxTracker
  let bonusGmxDistributor

  beforeEach(async () => {
    gmx = await deployContract("GMX", []);
    esGmx = await deployContract("EsGMX", []);
    bnGmx = await deployContract("MintableBaseToken", ["Bonus GMX", "bnGMX", 0]);

    stakedGmxTracker = await deployContract("RewardTracker", ["Staked GMX", "stGMX"])
    stakedGmxDistributor = await deployContract("RewardDistributor", [esGmx.address, stakedGmxTracker.address])
    await stakedGmxDistributor.updateLastDistributionTime()

    bonusGmxTracker = await deployContract("RewardTracker", ["Staked + Bonus GMX", "sbGMX"])
    bonusGmxDistributor = await deployContract("BonusDistributor", [bnGmx.address, bonusGmxTracker.address])
    await bonusGmxDistributor.updateLastDistributionTime()

    await stakedGmxTracker.initialize([gmx.address, esGmx.address], stakedGmxDistributor.address)
    await bonusGmxTracker.initialize([stakedGmxTracker.address], bonusGmxDistributor.address)

    await stakedGmxTracker.setInPrivateTransferMode(true)
    await stakedGmxTracker.setInPrivateStakingMode(true)
    await bonusGmxTracker.setInPrivateTransferMode(true)
    await bonusGmxTracker.setInPrivateStakingMode(true)

    await stakedGmxTracker.setHandler(rewardRouter.address, true)
    await stakedGmxTracker.setHandler(bonusGmxTracker.address, true)
    await bonusGmxTracker.setHandler(rewardRouter.address, true)
    await bonusGmxDistributor.setBonusMultiplier(10000)
  })

  it("distributes bonus", async () => {
    await esGmx.setMinter(wallet.address, true)
    await esGmx.mint(stakedGmxDistributor.address, expandDecimals(50000, 18))
    await bnGmx.setMinter(wallet.address, true)
    await bnGmx.mint(bonusGmxDistributor.address, expandDecimals(1500, 18))
    await stakedGmxDistributor.setTokensPerInterval("20667989410000000") // 0.02066798941 esGmx per second
    await gmx.setMinter(wallet.address, true)
    await gmx.mint(user0.address, expandDecimals(1000, 18))

    await gmx.connect(user0).approve(stakedGmxTracker.address, expandDecimals(1001, 18))
    await expect(stakedGmxTracker.connect(rewardRouter).stakeForAccount(user0.address, user0.address, gmx.address, expandDecimals(1001, 18)))
      .to.be.revertedWith("BaseToken: transfer amount exceeds balance")
    await stakedGmxTracker.connect(rewardRouter).stakeForAccount(user0.address, user0.address, gmx.address, expandDecimals(1000, 18))
    await expect(bonusGmxTracker.connect(rewardRouter).stakeForAccount(user0.address, user0.address, stakedGmxTracker.address, expandDecimals(1001, 18)))
      .to.be.revertedWith("RewardTracker: transfer amount exceeds balance")
    await bonusGmxTracker.connect(rewardRouter).stakeForAccount(user0.address, user0.address, stakedGmxTracker.address, expandDecimals(1000, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await stakedGmxTracker.claimable(user0.address)).gt(expandDecimals(1785, 18)) // 50000 / 28 => ~1785
    expect(await stakedGmxTracker.claimable(user0.address)).lt(expandDecimals(1786, 18))
    expect(await bonusGmxTracker.claimable(user0.address)).gt("2730000000000000000") // 2.73, 1000 / 365 => ~2.74
    expect(await bonusGmxTracker.claimable(user0.address)).lt("2750000000000000000") // 2.75

    await esGmx.mint(user1.address, expandDecimals(500, 18))
    await esGmx.connect(user1).approve(stakedGmxTracker.address, expandDecimals(500, 18))
    await stakedGmxTracker.connect(rewardRouter).stakeForAccount(user1.address, user1.address, esGmx.address, expandDecimals(500, 18))
    await bonusGmxTracker.connect(rewardRouter).stakeForAccount(user1.address, user1.address, stakedGmxTracker.address, expandDecimals(500, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await stakedGmxTracker.claimable(user0.address)).gt(expandDecimals(1785 + 1190, 18))
    expect(await stakedGmxTracker.claimable(user0.address)).lt(expandDecimals(1786 + 1191, 18))

    expect(await stakedGmxTracker.claimable(user1.address)).gt(expandDecimals(595, 18))
    expect(await stakedGmxTracker.claimable(user1.address)).lt(expandDecimals(596, 18))

    expect(await bonusGmxTracker.claimable(user0.address)).gt("5470000000000000000") // 5.47, 1000 / 365 * 2 => ~5.48
    expect(await bonusGmxTracker.claimable(user0.address)).lt("5490000000000000000") // 5.49

    expect(await bonusGmxTracker.claimable(user1.address)).gt("1360000000000000000") // 1.36, 500 / 365 => ~1.37
    expect(await bonusGmxTracker.claimable(user1.address)).lt("1380000000000000000") // 1.38
  })
})
