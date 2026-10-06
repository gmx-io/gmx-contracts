const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, increaseTime, mineBlock } = require("../shared/utilities")

use(solidity)

const { AddressZero } = ethers.constants
const secondsPerYear = 365 * 24 * 60 * 60

describe("VesterCapZeroer", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, capsAdmin, keeper] = provider.getWallets()
  let esGmx
  let gmx
  let tracker
  let distributor
  let vester
  let zeroer

  beforeEach(async () => {
    esGmx = await deployContract("EsGMX", [])
    gmx = await deployContract("Token", [])

    tracker = await deployContract("RewardTracker", ["Staked GMX", "sGMX"])
    distributor = await deployContract("RewardDistributor", [esGmx.address, tracker.address])
    await tracker.initialize([gmx.address, esGmx.address], distributor.address)

    vester = await deployContract("Vester", [
      "Vested GMX",
      "veGMX",
      secondsPerYear,
      esGmx.address,
      AddressZero,
      gmx.address,
      tracker.address
    ])

    zeroer = await deployContract("VesterCapZeroer", [vester.address])
    await zeroer.setCapsAdmin(capsAdmin.address)
    await zeroer.connect(capsAdmin).setKeeper(keeper.address, true)

    // wallet acts as an operational handler to seed legacy cap terms
    await vester.setHandler(wallet.address, true)
    await esGmx.setMinter(wallet.address, true)
    await esGmx.setMinter(vester.address, true)
  })

  it("derives the tracker from the vester", async () => {
    expect(await zeroer.vester()).eq(vester.address)
    expect(await zeroer.rewardTracker()).eq(tracker.address)
  })

  it("gates keeper and keeper grants", async () => {
    await expect(zeroer.connect(user0).zeroCaps([user0.address]))
      .to.be.revertedWith("VesterCapZeroer: forbidden")
    await expect(zeroer.connect(user0).setKeeper(user0.address, true))
      .to.be.revertedWith("Guardable: forbidden")
  })

  it("cannot run without handler status on the vester", async () => {
    await vester.setBonusRewards(user0.address, expandDecimals(1000, 18))
    await expect(zeroer.connect(keeper).zeroCaps([user0.address]))
      .to.be.revertedWith("Vester: forbidden")
  })

  it("raises deductions to the positive terms and skips converged accounts", async () => {
    await vester.setHandler(zeroer.address, true)

    await vester.setBonusRewards(user0.address, expandDecimals(1000, 18))
    await vester.setTransferredCumulativeRewards(user1.address, expandDecimals(500, 18))

    expect(await zeroer.getPositiveTerms(user0.address)).eq(expandDecimals(1000, 18))
    expect(await zeroer.isZeroed(user0.address)).eq(false)
    expect(await zeroer.isZeroed(user2.address)).eq(true)

    await zeroer.connect(keeper).zeroCaps([user0.address, user1.address, user2.address])

    expect(await vester.cumulativeRewardDeductions(user0.address)).eq(expandDecimals(1000, 18))
    expect(await vester.cumulativeRewardDeductions(user1.address)).eq(expandDecimals(500, 18))
    expect(await vester.cumulativeRewardDeductions(user2.address)).eq(0)
    expect(await vester.getMaxVestableAmount(user0.address)).eq(0)
    expect(await vester.getMaxVestableAmount(user1.address)).eq(0)
    expect(await zeroer.isZeroed(user0.address)).eq(true)
  })

  it("is repeatable until convergence and re-zeroes reopened caps", async () => {
    await vester.setHandler(zeroer.address, true)
    await vester.setBonusRewards(user0.address, expandDecimals(1000, 18))

    await zeroer.connect(keeper).zeroCaps([user0.address])
    await zeroer.connect(keeper).zeroCaps([user0.address])
    expect(await vester.cumulativeRewardDeductions(user0.address)).eq(expandDecimals(1000, 18))

    await vester.setBonusRewards(user0.address, expandDecimals(1200, 18))
    expect(await vester.getMaxVestableAmount(user0.address)).eq(expandDecimals(200, 18))

    await zeroer.connect(keeper).zeroCaps([user0.address])
    expect(await vester.cumulativeRewardDeductions(user0.address)).eq(expandDecimals(1200, 18))
    expect(await vester.getMaxVestableAmount(user0.address)).eq(0)
  })

  it("never lowers an existing deduction", async () => {
    await vester.setHandler(zeroer.address, true)
    await vester.setTransferredCumulativeRewards(user1.address, expandDecimals(500, 18))
    await vester.setCumulativeRewardDeductions(user1.address, expandDecimals(5000, 18))

    await zeroer.connect(keeper).zeroCaps([user1.address])
    expect(await vester.cumulativeRewardDeductions(user1.address)).eq(expandDecimals(5000, 18))
  })

  it("blocks new deposits only; existing positions keep vesting, claiming, withdrawing", async () => {
    await vester.setHandler(zeroer.address, true)
    await vester.setBonusRewards(user0.address, expandDecimals(1000, 18))

    await esGmx.mint(user0.address, expandDecimals(400, 18))
    await esGmx.connect(user0).approve(vester.address, expandDecimals(400, 18))
    await vester.connect(user0).deposit(expandDecimals(400, 18))

    await zeroer.connect(keeper).zeroCaps([user0.address])

    await esGmx.mint(user0.address, expandDecimals(10, 18))
    await esGmx.connect(user0).approve(vester.address, expandDecimals(10, 18))
    await expect(vester.connect(user0).deposit(expandDecimals(10, 18)))
      .to.be.revertedWith("Vester: max vestable amount exceeded")

    await increaseTime(provider, 100 * 24 * 60 * 60)
    await mineBlock(provider)

    await gmx.mint(vester.address, expandDecimals(400, 18))
    await vester.connect(user0).claim()
    const claimed = await gmx.balanceOf(user0.address)
    expect(claimed).gt(expandDecimals(109, 18))
    expect(claimed).lt(expandDecimals(110, 18))

    await vester.connect(user0).withdraw()
    const esBalance = await esGmx.balanceOf(user0.address)
    expect(esBalance).gt(expandDecimals(299, 18))
  })
})
