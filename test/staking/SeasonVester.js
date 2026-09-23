const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed, print } = require("../shared/utilities")

use(solidity)

const secondsPerYear = 365 * 24 * 60 * 60
const { AddressZero } = ethers.constants

describe("SeasonVester (SCDEV-316 PoC)", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3, user4] = provider.getWallets()
  let gmx
  let esGmx
  let eth
  let rewardTracker
  let rewardDistributor
  let seasonVester // season 1: 1 year, 5:1
  let seasonIssuer

  beforeEach(async () => {
    gmx = await deployContract("GMX", [])
    esGmx = await deployContract("EsGMX", [])
    eth = await deployContract("Token", [])

    await gmx.setMinter(wallet.address, true)
    await esGmx.setMinter(wallet.address, true)

    // the tracker receipt token sums GMX + esGMX staked 1:1 and serves as the pair token
    rewardTracker = await deployContract("RewardTracker", ["Staked GMX", "sGMX"])
    rewardDistributor = await deployContract("RewardDistributor", [eth.address, rewardTracker.address])
    await rewardDistributor.updateLastDistributionTime()
    await rewardTracker.initialize([gmx.address, esGmx.address], rewardDistributor.address)

    seasonVester = await deployContract("SeasonVester", [
      "Season 1 Vested GMX",
      "sv1GMX",
      secondsPerYear,
      5, // VEST_RATIO: 5 staked units per 1 esGMX vesting
      esGmx.address,
      rewardTracker.address, // pairToken: staking receipts
      gmx.address
    ])

    seasonIssuer = await deployContract("SeasonIssuer", [esGmx.address, seasonVester.address])
    await esGmx.setMinter(seasonIssuer.address, true)
    await seasonVester.setHandler(seasonIssuer.address, true)

    // burn permission for conversions; GMX funds the claim payouts
    await esGmx.setMinter(seasonVester.address, true)
    await gmx.mint(seasonVester.address, expandDecimals(10000, 18))
  })

  async function stakeGmx(user, amount) {
    await gmx.mint(user.address, amount)
    await gmx.connect(user).approve(rewardTracker.address, amount)
    await rewardTracker.connect(user).stake(gmx.address, amount)
  }

  async function stakeEsGmx(user, amount) {
    await esGmx.connect(user).approve(rewardTracker.address, amount)
    await rewardTracker.connect(user).stake(esGmx.address, amount)
  }

  // CONTROL: the legacy Vester regenerates its cap on withdraw (SCDEV-313 claim)
  it("control: legacy Vester extracts 200 GMX from a cap of 100", async () => {
    const legacyVester = await deployContract("Vester", [
      "Vested GMX",
      "vGMX",
      secondsPerYear,
      esGmx.address,
      AddressZero, // no pair token
      gmx.address,
      AddressZero // no reward tracker: cap comes from bonusRewards only
    ])
    await esGmx.setMinter(legacyVester.address, true)
    await gmx.mint(legacyVester.address, expandDecimals(10000, 18))

    await legacyVester.setHandler(wallet.address, true)
    await legacyVester.setBonusRewards(user0.address, expandDecimals(100, 18))
    expect(await legacyVester.getMaxVestableAmount(user0.address)).eq(expandDecimals(100, 18))

    await esGmx.mint(user0.address, expandDecimals(200, 18))
    await esGmx.connect(user0).approve(legacyVester.address, expandDecimals(200, 18))

    await legacyVester.connect(user0).deposit(expandDecimals(100, 18))
    await increaseTime(provider, secondsPerYear + 10)
    await mineBlock(provider)
    await legacyVester.connect(user0).claim()
    expect(await gmx.balanceOf(user0.address)).eq(expandDecimals(100, 18))

    await expect(legacyVester.connect(user0).deposit(expandDecimals(100, 18)))
      .to.be.revertedWith("Vester: max vestable amount exceeded")

    // withdraw() deletes cumulativeClaimAmounts, regenerating the cap
    await legacyVester.connect(user0).withdraw()

    await legacyVester.connect(user0).deposit(expandDecimals(100, 18))
    await increaseTime(provider, secondsPerYear + 10)
    await mineBlock(provider)
    await legacyVester.connect(user0).claim()

    expect(await gmx.balanceOf(user0.address)).eq(expandDecimals(200, 18))
  })

  // SeasonVester: the cap is consumed monotonically
  it("cap does not regenerate on withdraw: conversions are bounded by season issuance", async () => {
    await seasonIssuer.issue([user0.address], [expandDecimals(100, 18)])
    expect(await seasonVester.getMaxVestableAmount(user0.address)).eq(expandDecimals(100, 18))

    await stakeGmx(user0, expandDecimals(500, 18))
    await rewardTracker.connect(user0).approve(seasonVester.address, expandDecimals(500, 18))
    await esGmx.connect(user0).approve(seasonVester.address, expandDecimals(200, 18))

    await seasonVester.connect(user0).deposit(expandDecimals(100, 18))
    expect(await rewardTracker.balanceOf(user0.address)).eq(0)
    expect(await seasonVester.pairAmounts(user0.address)).eq(expandDecimals(500, 18))

    await increaseTime(provider, secondsPerYear + 10)
    await mineBlock(provider)
    await seasonVester.connect(user0).claim()
    expect(await gmx.balanceOf(user0.address)).eq(expandDecimals(100, 18))

    // the user obtains 100 more esGMX from elsewhere (fungible units, any source)
    await esGmx.mint(user0.address, expandDecimals(100, 18))

    await seasonVester.connect(user0).withdraw()
    expect(await rewardTracker.balanceOf(user0.address)).eq(expandDecimals(500, 18))

    await rewardTracker.connect(user0).approve(seasonVester.address, expandDecimals(500, 18))
    await expect(seasonVester.connect(user0).deposit(expandDecimals(100, 18)))
      .to.be.revertedWith("SeasonVester: max vestable amount exceeded")

    expect(await gmx.balanceOf(user0.address)).eq(expandDecimals(100, 18))
    expect(await seasonVester.getTotalVested(user0.address)).eq(expandDecimals(100, 18))
  })

  it("withdraw restores headroom only for the unconverted portion", async () => {
    await seasonIssuer.issue([user1.address], [expandDecimals(100, 18)])
    await stakeGmx(user1, expandDecimals(500, 18))
    await rewardTracker.connect(user1).approve(seasonVester.address, expandDecimals(500, 18))
    await esGmx.connect(user1).approve(seasonVester.address, expandDecimals(200, 18))

    await seasonVester.connect(user1).deposit(expandDecimals(100, 18))

    // vest for half a year, then withdraw: ~50 converted, ~50 returned unvested
    await increaseTime(provider, secondsPerYear / 2)
    await mineBlock(provider)
    await seasonVester.connect(user1).withdraw()

    const converted = await seasonVester.cumulativeClaimAmounts(user1.address)
    expect(converted).gt(expandDecimals(49, 18))
    expect(converted).lt(expandDecimals(51, 18))
    expect(await esGmx.balanceOf(user1.address)).eq(expandDecimals(100, 18).sub(converted))

    const headroom = expandDecimals(100, 18).sub(converted)
    await rewardTracker.connect(user1).approve(seasonVester.address, expandDecimals(500, 18))
    await seasonVester.connect(user1).deposit(headroom)

    await esGmx.mint(user1.address, expandDecimals(1, 18))
    await expect(seasonVester.connect(user1).deposit(expandDecimals(1, 18)))
      .to.be.revertedWith("SeasonVester: max vestable amount exceeded")
  })

  it("esGMX without season issuance cannot be vested", async () => {
    await esGmx.mint(user2.address, expandDecimals(100, 18))
    await stakeGmx(user2, expandDecimals(500, 18))
    await rewardTracker.connect(user2).approve(seasonVester.address, expandDecimals(500, 18))
    await esGmx.connect(user2).approve(seasonVester.address, expandDecimals(100, 18))

    await expect(seasonVester.connect(user2).deposit(expandDecimals(100, 18)))
      .to.be.revertedWith("SeasonVester: max vestable amount exceeded")
  })

  it("5:1 staked-balance requirement is met by GMX + esGMX staked via receipt custody", async () => {
    await seasonIssuer.issue([user3.address], [expandDecimals(30, 18)])

    await stakeGmx(user3, expandDecimals(30, 18))
    await stakeEsGmx(user3, expandDecimals(20, 18))
    expect(await rewardTracker.balanceOf(user3.address)).eq(expandDecimals(50, 18))

    await rewardTracker.connect(user3).approve(seasonVester.address, expandDecimals(100, 18))
    await esGmx.connect(user3).approve(seasonVester.address, expandDecimals(30, 18))

    await seasonVester.connect(user3).deposit(expandDecimals(10, 18))
    expect(await rewardTracker.balanceOf(user3.address)).eq(0)
    expect(await seasonVester.pairAmounts(user3.address)).eq(expandDecimals(50, 18))

    // mint 1 esGMX so the revert comes from missing receipts, not a missing balance
    await esGmx.mint(user3.address, expandDecimals(1, 18))
    await expect(seasonVester.connect(user3).deposit(expandDecimals(1, 18)))
      .to.be.revertedWith("RewardTracker: transfer amount exceeds balance")
  })

  // Cross-season: two Vesters with different rules, one shared esGMX token
  it("cross-season routing is bounded by each season's cap; collateral cannot be double-used", async () => {
    // season 2: looser rules (half the duration, 2:1 ratio), same esGMX token
    const season2Vester = await deployContract("SeasonVester", [
      "Season 2 Vested GMX",
      "sv2GMX",
      secondsPerYear / 2,
      2,
      esGmx.address,
      rewardTracker.address,
      gmx.address
    ])
    const season2Issuer = await deployContract("SeasonIssuer", [esGmx.address, season2Vester.address])
    await esGmx.setMinter(season2Issuer.address, true)
    await season2Vester.setHandler(season2Issuer.address, true)
    await esGmx.setMinter(season2Vester.address, true)
    await gmx.mint(season2Vester.address, expandDecimals(10000, 18))

    await seasonIssuer.issue([user4.address], [expandDecimals(100, 18)])
    await season2Issuer.issue([user4.address], [expandDecimals(100, 18)])
    expect(await esGmx.balanceOf(user4.address)).eq(expandDecimals(200, 18))

    await stakeGmx(user4, expandDecimals(800, 18))
    await esGmx.connect(user4).approve(seasonVester.address, expandDecimals(200, 18))
    await esGmx.connect(user4).approve(season2Vester.address, expandDecimals(200, 18))
    await rewardTracker.connect(user4).approve(seasonVester.address, expandDecimals(800, 18))
    await rewardTracker.connect(user4).approve(season2Vester.address, expandDecimals(800, 18))

    await expect(season2Vester.connect(user4).deposit(expandDecimals(200, 18)))
      .to.be.revertedWith("SeasonVester: max vestable amount exceeded")

    await season2Vester.connect(user4).deposit(expandDecimals(100, 18))
    expect(await season2Vester.pairAmounts(user4.address)).eq(expandDecimals(200, 18))
    await seasonVester.connect(user4).deposit(expandDecimals(100, 18))
    expect(await seasonVester.pairAmounts(user4.address)).eq(expandDecimals(500, 18))

    // 700 of 800 receipts are in custody across the two vesters
    expect(await rewardTracker.balanceOf(user4.address)).eq(expandDecimals(100, 18))

    await increaseTime(provider, secondsPerYear + 10)
    await mineBlock(provider)
    await seasonVester.connect(user4).claim()
    await season2Vester.connect(user4).claim()
    expect(await gmx.balanceOf(user4.address)).eq(expandDecimals(200, 18))

    // and neither cap regenerates
    await seasonVester.connect(user4).withdraw()
    await season2Vester.connect(user4).withdraw()
    await esGmx.mint(user4.address, expandDecimals(100, 18))
    await rewardTracker.connect(user4).approve(seasonVester.address, expandDecimals(800, 18))
    await rewardTracker.connect(user4).approve(season2Vester.address, expandDecimals(800, 18))
    await expect(seasonVester.connect(user4).deposit(expandDecimals(1, 18)))
      .to.be.revertedWith("SeasonVester: max vestable amount exceeded")
    await expect(season2Vester.connect(user4).deposit(expandDecimals(1, 18)))
      .to.be.revertedWith("SeasonVester: max vestable amount exceeded")
  })

  it("a season with unchanged rules reuses the prior Vester: cap accrues, stays monotonic", async () => {
    await seasonIssuer.issue([user0.address], [expandDecimals(100, 18)])
    await stakeGmx(user0, expandDecimals(1000, 18))
    await rewardTracker.connect(user0).approve(seasonVester.address, expandDecimals(1000, 18))
    await esGmx.connect(user0).approve(seasonVester.address, expandDecimals(500, 18))

    await seasonVester.connect(user0).deposit(expandDecimals(100, 18))
    await increaseTime(provider, secondsPerYear + 10)
    await mineBlock(provider)
    await seasonVester.connect(user0).withdraw()
    expect(await gmx.balanceOf(user0.address)).eq(expandDecimals(100, 18))

    // season 2 with unchanged rules: same Vester, the ledger keeps crediting
    await seasonIssuer.issue([user0.address], [expandDecimals(100, 18)])
    expect(await seasonVester.getMaxVestableAmount(user0.address)).eq(expandDecimals(200, 18))

    await rewardTracker.connect(user0).approve(seasonVester.address, expandDecimals(1000, 18))
    await seasonVester.connect(user0).deposit(expandDecimals(100, 18))
    await increaseTime(provider, secondsPerYear + 10)
    await mineBlock(provider)
    await seasonVester.connect(user0).withdraw()
    expect(await gmx.balanceOf(user0.address)).eq(expandDecimals(200, 18))

    await esGmx.mint(user0.address, expandDecimals(100, 18))
    await rewardTracker.connect(user0).approve(seasonVester.address, expandDecimals(1000, 18))
    await expect(seasonVester.connect(user0).deposit(expandDecimals(100, 18)))
      .to.be.revertedWith("SeasonVester: max vestable amount exceeded")
  })

  // CONTROL: the legacy Vester's second cap-regeneration route via account transfer
  it("control: legacy transferStakeValues regenerates the cap at a fresh address", async () => {
    const legacyVester = await deployContract("Vester", [
      "Vested GMX",
      "vGMX",
      secondsPerYear,
      esGmx.address,
      AddressZero,
      gmx.address,
      AddressZero
    ])
    await esGmx.setMinter(legacyVester.address, true)
    await gmx.mint(legacyVester.address, expandDecimals(10000, 18))

    await legacyVester.setHandler(wallet.address, true)
    await legacyVester.setBonusRewards(user0.address, expandDecimals(100, 18))
    await esGmx.mint(user0.address, expandDecimals(200, 18))
    await esGmx.connect(user0).approve(legacyVester.address, expandDecimals(200, 18))

    // consume the full cap without ever calling withdraw()
    await legacyVester.connect(user0).deposit(expandDecimals(100, 18))
    await increaseTime(provider, secondsPerYear + 10)
    await mineBlock(provider)
    await legacyVester.connect(user0).claim()
    expect(await gmx.balanceOf(user0.address)).eq(expandDecimals(100, 18))
    await expect(legacyVester.connect(user0).deposit(expandDecimals(100, 18)))
      .to.be.revertedWith("Vester: max vestable amount exceeded")

    // simulate acceptTransfer: stake values move, cumulativeClaimAmounts stays behind
    await legacyVester.transferStakeValues(user0.address, user1.address)
    await esGmx.connect(user0).transfer(user1.address, expandDecimals(100, 18))

    expect(await legacyVester.getMaxVestableAmount(user1.address)).eq(expandDecimals(100, 18))
    expect(await legacyVester.getTotalVested(user1.address)).eq(0)

    await esGmx.connect(user1).approve(legacyVester.address, expandDecimals(100, 18))
    await legacyVester.connect(user1).deposit(expandDecimals(100, 18))
    await increaseTime(provider, secondsPerYear + 10)
    await mineBlock(provider)
    await legacyVester.connect(user1).claim()

    const total = (await gmx.balanceOf(user0.address)).add(await gmx.balanceOf(user1.address))
    expect(total).eq(expandDecimals(200, 18))
  })

  // transferSeasonState: cap and used capacity move together
  it("transferSeasonState closes the transfer-regeneration route", async () => {
    await seasonIssuer.issue([user0.address], [expandDecimals(100, 18)])
    await stakeGmx(user0, expandDecimals(500, 18))
    await rewardTracker.connect(user0).approve(seasonVester.address, expandDecimals(500, 18))
    await esGmx.connect(user0).approve(seasonVester.address, expandDecimals(100, 18))

    await seasonVester.connect(user0).deposit(expandDecimals(100, 18))
    await increaseTime(provider, secondsPerYear + 10)
    await mineBlock(provider)
    await seasonVester.connect(user0).withdraw()
    expect(await gmx.balanceOf(user0.address)).eq(expandDecimals(100, 18))

    await seasonVester.setHandler(wallet.address, true)
    await seasonVester.transferSeasonState(user0.address, user1.address)

    expect(await seasonVester.getMaxVestableAmount(user1.address)).eq(expandDecimals(100, 18))
    expect(await seasonVester.getTotalVested(user1.address)).eq(expandDecimals(100, 18))
    expect(await seasonVester.getMaxVestableAmount(user0.address)).eq(0)

    await esGmx.mint(user1.address, expandDecimals(100, 18))
    await stakeGmx(user1, expandDecimals(500, 18))
    await rewardTracker.connect(user1).approve(seasonVester.address, expandDecimals(500, 18))
    await esGmx.connect(user1).approve(seasonVester.address, expandDecimals(100, 18))
    await expect(seasonVester.connect(user1).deposit(expandDecimals(100, 18)))
      .to.be.revertedWith("SeasonVester: max vestable amount exceeded")
  })

  it("transferSeasonState conserves remaining headroom and requires an emptied position", async () => {
    await seasonIssuer.issue([user0.address], [expandDecimals(100, 18)])
    await stakeGmx(user0, expandDecimals(500, 18))
    await rewardTracker.connect(user0).approve(seasonVester.address, expandDecimals(500, 18))
    await esGmx.connect(user0).approve(seasonVester.address, expandDecimals(100, 18))

    await seasonVester.connect(user0).deposit(expandDecimals(100, 18))
    await seasonVester.setHandler(wallet.address, true)

    await expect(seasonVester.transferSeasonState(user0.address, user1.address))
      .to.be.revertedWith("SeasonVester: sender has active vesting balance")

    await expect(seasonVester.transferSeasonState(user0.address, user0.address))
      .to.be.revertedWith("SeasonVester: self transfer")

    await increaseTime(provider, secondsPerYear / 2)
    await mineBlock(provider)
    await seasonVester.connect(user0).withdraw()
    const converted = await seasonVester.cumulativeClaimAmounts(user0.address)
    const headroom = expandDecimals(100, 18).sub(converted)

    await seasonVester.transferSeasonState(user0.address, user1.address)

    expect(await seasonVester.getMaxVestableAmount(user1.address)).eq(expandDecimals(100, 18))
    expect(await seasonVester.cumulativeClaimAmounts(user1.address)).eq(converted)

    // the withdrawn esGMX follows via the account's token transfer
    await esGmx.connect(user0).transfer(user1.address, headroom)
    await stakeGmx(user1, expandDecimals(500, 18))
    await rewardTracker.connect(user1).approve(seasonVester.address, expandDecimals(500, 18))
    await esGmx.connect(user1).approve(seasonVester.address, expandDecimals(200, 18))
    await seasonVester.connect(user1).deposit(headroom)

    await esGmx.mint(user1.address, expandDecimals(1, 18))
    await expect(seasonVester.connect(user1).deposit(expandDecimals(1, 18)))
      .to.be.revertedWith("SeasonVester: max vestable amount exceeded")
  })

  it("account transfer across two season Vesters conserves each season's headroom independently", async () => {
    const season2Vester = await deployContract("SeasonVester", [
      "Season 2 Vested GMX",
      "sv2GMX",
      secondsPerYear / 2,
      2,
      esGmx.address,
      rewardTracker.address,
      gmx.address
    ])
    const season2Issuer = await deployContract("SeasonIssuer", [esGmx.address, season2Vester.address])
    await esGmx.setMinter(season2Issuer.address, true)
    await season2Vester.setHandler(season2Issuer.address, true)
    await esGmx.setMinter(season2Vester.address, true)
    await gmx.mint(season2Vester.address, expandDecimals(10000, 18))

    await seasonIssuer.issue([user0.address], [expandDecimals(100, 18)])
    await season2Issuer.issue([user0.address], [expandDecimals(60, 18)])

    await stakeGmx(user0, expandDecimals(700, 18))
    await esGmx.connect(user0).approve(seasonVester.address, expandDecimals(100, 18))
    await esGmx.connect(user0).approve(season2Vester.address, expandDecimals(60, 18))
    await rewardTracker.connect(user0).approve(seasonVester.address, expandDecimals(700, 18))
    await rewardTracker.connect(user0).approve(season2Vester.address, expandDecimals(700, 18))

    await seasonVester.connect(user0).deposit(expandDecimals(100, 18))
    await season2Vester.connect(user0).deposit(expandDecimals(60, 18))

    // half a year: season 1 is half vested, season 2 (half the duration) fully vested
    await increaseTime(provider, secondsPerYear / 2)
    await mineBlock(provider)

    await seasonVester.setHandler(wallet.address, true)
    await season2Vester.setHandler(wallet.address, true)

    // each Vester guards its own transfer: season 1 still has an active position
    await expect(seasonVester.transferSeasonState(user0.address, user1.address))
      .to.be.revertedWith("SeasonVester: sender has active vesting balance")

    await seasonVester.connect(user0).withdraw()
    await season2Vester.connect(user0).withdraw()
    const converted1 = await seasonVester.cumulativeClaimAmounts(user0.address)
    const headroom1 = expandDecimals(100, 18).sub(converted1)

    await seasonVester.transferSeasonState(user0.address, user1.address)
    await season2Vester.transferSeasonState(user0.address, user1.address)

    expect(await seasonVester.getMaxVestableAmount(user1.address)).eq(expandDecimals(100, 18))
    expect(await seasonVester.cumulativeClaimAmounts(user1.address)).eq(converted1)
    expect(await season2Vester.getMaxVestableAmount(user1.address)).eq(expandDecimals(60, 18))
    expect(await season2Vester.getTotalVested(user1.address)).eq(expandDecimals(60, 18))

    await esGmx.connect(user0).transfer(user1.address, headroom1)
    await stakeGmx(user1, expandDecimals(500, 18))
    await rewardTracker.connect(user1).approve(seasonVester.address, expandDecimals(500, 18))
    await rewardTracker.connect(user1).approve(season2Vester.address, expandDecimals(500, 18))
    await esGmx.connect(user1).approve(seasonVester.address, expandDecimals(200, 18))
    await esGmx.connect(user1).approve(season2Vester.address, expandDecimals(200, 18))

    // season 1 headroom is usable at the new address; season 2 is fully consumed
    await seasonVester.connect(user1).deposit(headroom1)
    await esGmx.mint(user1.address, expandDecimals(2, 18))
    await expect(seasonVester.connect(user1).deposit(expandDecimals(1, 18)))
      .to.be.revertedWith("SeasonVester: max vestable amount exceeded")
    await expect(season2Vester.connect(user1).deposit(expandDecimals(1, 18)))
      .to.be.revertedWith("SeasonVester: max vestable amount exceeded")
  })
})
