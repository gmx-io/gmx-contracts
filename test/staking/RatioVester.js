const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, increaseTime, mineBlock } = require("../shared/utilities")

use(solidity)

const { AddressZero } = ethers.constants

const secondsPerYear = 365 * 24 * 60 * 60
const EPOCH_DURATION = 7 * 24 * 60 * 60
const EPOCH_OFFSET = 24 * 60 * 60
const PAIR_PRECISION = expandDecimals(1, 30)

describe("RatioVester", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, capsAdmin, guardian, distributor, handler] = provider.getWallets()
  let esGmx
  let gmx
  let pair
  let issuer
  let vester

  const alignToEpochStart = async () => {
    const block = await provider.getBlock("latest")
    const next = (Math.floor((block.timestamp + EPOCH_OFFSET) / EPOCH_DURATION) + 1) * EPOCH_DURATION - EPOCH_OFFSET
    await increaseTime(provider, next - block.timestamp + 60)
    await mineBlock(provider)
  }

  const issueAndApprove = async (account, esAmount, pairAmount) => {
    await issuer.connect(distributor).distributeEpoch(1, await nextBatchIndex(), [account.address], [esAmount])
    await issuer.connect(account).claim()
    await esGmx.connect(account).approve(vester.address, esAmount)
    await pair.mint(account.address, pairAmount)
    await pair.connect(account).approve(vester.address, pairAmount)
  }

  let batchIndex = 0
  const nextBatchIndex = async () => {
    batchIndex += 1
    return batchIndex
  }

  beforeEach(async () => {
    batchIndex = 0
    esGmx = await deployContract("EsGMX", [])
    gmx = await deployContract("Token", [])
    pair = await deployContract("Token", [])

    issuer = await deployContract("EsGmxIssuer", [esGmx.address])
    vester = await deployContract("RatioVester", [
      "Vested GMX S1",
      "vGMX-S1",
      secondsPerYear,
      esGmx.address,
      pair.address,
      gmx.address,
      issuer.address,
      PAIR_PRECISION.mul(5),
      false
    ])

    await esGmx.setMinter(wallet.address, true)
    await esGmx.setMinter(vester.address, true)

    await issuer.setCapsAdmin(capsAdmin.address)
    await issuer.connect(capsAdmin).setDistributor(distributor.address, true)
    await issuer.setVester(vester.address)
    await vester.confirmIssuerBinding()

    await vester.setCapsAdmin(capsAdmin.address)
    await vester.setGuardian(guardian.address)
    await vester.setHandler(handler.address, true)

    await esGmx.mint(issuer.address, expandDecimals(1000000, 18))
    await gmx.mint(vester.address, expandDecimals(1000000, 18))

    await alignToEpochStart()
  })

  it("requires the confirmed issuer binding for deposits", async () => {
    const unbound = await deployContract("RatioVester", [
      "V", "V", secondsPerYear, esGmx.address, pair.address, gmx.address,
      issuer.address, PAIR_PRECISION.mul(5), false
    ])
    await gmx.mint(unbound.address, expandDecimals(1000, 18))
    await issueAndApprove(user0, expandDecimals(100, 18), expandDecimals(500, 18))
    await esGmx.connect(user0).approve(unbound.address, expandDecimals(100, 18))
    await expect(unbound.connect(user0).deposit(expandDecimals(100, 18)))
      .to.be.revertedWith("RatioVester: issuer binding not confirmed")
    await expect(unbound.confirmIssuerBinding())
      .to.be.revertedWith("RatioVester: issuer not bound")
  })

  it("caps deposits at issuance and locks pair at the fixed ratio", async () => {
    await issueAndApprove(user0, expandDecimals(1000, 18), expandDecimals(5000, 18))

    await expect(vester.connect(user0).deposit(expandDecimals(1001, 18)))
      .to.be.revertedWith("RatioVester: cap exceeded")

    await vester.connect(user0).deposit(expandDecimals(1000, 18))
    expect(await vester.balances(user0.address)).eq(expandDecimals(1000, 18))
    expect(await vester.pairAmounts(user0.address)).eq(expandDecimals(5000, 18))
    expect(await pair.balanceOf(vester.address)).eq(expandDecimals(5000, 18))
    expect(await vester.getVestingCap(user0.address)).eq(expandDecimals(1000, 18))

    await expect(vester.connect(user0).deposit(expandDecimals(1, 18)))
      .to.be.revertedWith("RatioVester: cap exceeded")
  })

  it("term: a new grant after a year of history still takes the full duration", async () => {
    await issueAndApprove(user0, expandDecimals(100000, 18), expandDecimals(500000, 18))
    await vester.connect(user0).deposit(expandDecimals(100000, 18))

    await increaseTime(provider, 366 * 24 * 60 * 60)
    await mineBlock(provider)
    await vester.connect(user0).claim()
    expect(await gmx.balanceOf(user0.address)).eq(expandDecimals(100000, 18))

    await issueAndApprove(user0, expandDecimals(1000, 18), 0)
    await vester.connect(user0).deposit(expandDecimals(1000, 18))

    await increaseTime(provider, 5 * 24 * 60 * 60)
    await mineBlock(provider)

    const claimable = await vester.claimable(user0.address)
    expect(claimable).gt(expandDecimals(10, 18))
    expect(claimable).lt(expandDecimals(20, 18))
    expect(await vester.balances(user0.address)).gt(expandDecimals(980, 18))
  })

  it("merges deposits within one epoch into a single tranche anchored at the first", async () => {
    await issueAndApprove(user0, expandDecimals(600, 18), expandDecimals(3000, 18))

    await vester.connect(user0).deposit(expandDecimals(100, 18))
    await increaseTime(provider, 2 * 24 * 60 * 60)
    await mineBlock(provider)
    await vester.connect(user0).deposit(expandDecimals(200, 18))
    expect(await vester.tranchesLength(user0.address)).eq(1)

    const tranche = await vester.tranches(user0.address, 0)
    expect(tranche.totalAmount).eq(expandDecimals(300, 18))

    await increaseTime(provider, 7 * 24 * 60 * 60)
    await mineBlock(provider)
    await vester.connect(user0).deposit(expandDecimals(300, 18))
    expect(await vester.tranchesLength(user0.address)).eq(2)
  })

  it("collateral: no refund mid-session, full return at withdrawal, converted stays claimable", async () => {
    await issueAndApprove(user0, expandDecimals(1000, 18), expandDecimals(5000, 18))
    await vester.connect(user0).deposit(expandDecimals(1000, 18))

    await increaseTime(provider, 100 * 24 * 60 * 60)
    await mineBlock(provider)
    await vester.connect(user0).settleTranches(user0.address, 100)
    expect(await vester.pairAmounts(user0.address)).eq(expandDecimals(5000, 18))

    const esBefore = await esGmx.balanceOf(user0.address)
    await vester.connect(user0).withdraw()

    expect(await pair.balanceOf(user0.address)).eq(expandDecimals(5000, 18))
    const esReturned = (await esGmx.balanceOf(user0.address)).sub(esBefore)
    expect(esReturned).gt(expandDecimals(720, 18))
    expect(esReturned).lt(expandDecimals(727, 18))

    const unpaid = await vester.unpaidClaimAmounts(user0.address)
    expect(unpaid).gt(expandDecimals(273, 18))
    expect(unpaid).lt(expandDecimals(280, 18))

    await vester.connect(user0).claim()
    expect(await gmx.balanceOf(user0.address)).eq(unpaid)
    expect(await vester.unpaidClaimAmounts(user0.address)).eq(0)
  })

  it("counter separation: a closed session's unpaid amount never underflows the next", async () => {
    await issueAndApprove(user0, expandDecimals(300, 18), expandDecimals(1500, 18))
    await vester.connect(user0).deposit(expandDecimals(100, 18))

    await increaseTime(provider, 366 * 24 * 60 * 60)
    await mineBlock(provider)
    await vester.connect(user0).claim()
    expect(await gmx.balanceOf(user0.address)).eq(expandDecimals(100, 18))

    await vester.connect(user0).withdraw()
    expect(await pair.balanceOf(user0.address)).eq(expandDecimals(1500, 18))

    await pair.connect(user0).approve(vester.address, expandDecimals(1500, 18))
    await vester.connect(user0).deposit(expandDecimals(50, 18))
    await increaseTime(provider, 10 * 24 * 60 * 60)
    await mineBlock(provider)

    await vester.connect(user0).withdraw()
    const unpaid = await vester.unpaidClaimAmounts(user0.address)
    expect(unpaid).gt(0)
    await vester.connect(user0).claim()
    expect(await vester.unpaidClaimAmounts(user0.address)).eq(0)
  })

  it("conversion clamps to remaining headroom and resumes on unwind", async () => {
    await issueAndApprove(user0, expandDecimals(1000, 18), expandDecimals(5000, 18))
    await vester.connect(user0).deposit(expandDecimals(1000, 18))

    await vester.connect(guardian).increaseCapDeduction(user0.address, expandDecimals(900, 18))
    expect(await vester.getVestingCap(user0.address)).eq(expandDecimals(100, 18))

    await increaseTime(provider, 100 * 24 * 60 * 60)
    await mineBlock(provider)
    await vester.connect(user0).settleTranches(user0.address, 100)

    expect(await vester.totalConvertedAmounts(user0.address)).eq(expandDecimals(100, 18))

    await vester.decreaseCapDeduction(user0.address, expandDecimals(900, 18))
    await vester.connect(user0).settleTranches(user0.address, 100)
    const converted = await vester.totalConvertedAmounts(user0.address)
    expect(converted).gt(expandDecimals(270, 18))
    expect(converted).lt(expandDecimals(280, 18))
  })

  it("conservation: deduct below converted, transfer, unwind, no headroom reappears", async () => {
    await issueAndApprove(user0, expandDecimals(100, 18), expandDecimals(500, 18))
    await vester.connect(user0).deposit(expandDecimals(100, 18))
    await increaseTime(provider, 300 * 24 * 60 * 60)
    await mineBlock(provider)
    await vester.connect(user0).claim()
    await vester.connect(user0).withdraw()

    const used = await vester.totalConvertedAmounts(user0.address)
    expect(used).gt(expandDecimals(80, 18))

    await vester.connect(guardian).increaseCapDeduction(user0.address, expandDecimals(30, 18))
    await vester.connect(capsAdmin).setProvisioningComplete()
    await vester.connect(handler).transferVestingState(user0.address, user1.address)

    expect(await vester.getVestingCap(user0.address)).eq(0)
    const receiverCap = await vester.transferredCaps(user1.address)
    const receiverUsed = await vester.totalConvertedAmounts(user1.address)
    expect(receiverCap).eq(receiverUsed)

    await vester.decreaseCapDeduction(user0.address, expandDecimals(30, 18))
    const senderCap = await vester.getVestingCap(user0.address)
    const senderUsed = await vester.totalConvertedAmounts(user0.address)
    // exact lineage conservation: sender headroom equals the pre-deduction headroom,
    // receiver headroom stays zero, so nothing regenerates and nothing is lost
    expect(senderCap.sub(senderUsed)).eq(expandDecimals(100, 18).sub(used))
    expect(await vester.getVestingCap(user1.address)).eq(receiverUsed)
  })

  it("issuance after a transfer stays vestable on the old address", async () => {
    await issueAndApprove(user0, expandDecimals(1000, 18), expandDecimals(5000, 18))
    await vester.connect(user0).deposit(expandDecimals(1000, 18))
    await increaseTime(provider, 146 * 24 * 60 * 60)
    await mineBlock(provider)
    await vester.connect(user0).claim()
    await vester.connect(user0).withdraw()

    await vester.connect(capsAdmin).setProvisioningComplete()
    await vester.connect(handler).transferVestingState(user0.address, user1.address)
    expect(await vester.totalConvertedAmounts(user0.address)).eq(0)

    await issueAndApprove(user0, expandDecimals(300, 18), expandDecimals(1500, 18))
    await vester.connect(user0).deposit(expandDecimals(300, 18))
    expect(await vester.balances(user0.address)).eq(expandDecimals(300, 18))
  })

  it("an oversized cap deduction cannot brick settlement or withdrawal", async () => {
    await issueAndApprove(user0, expandDecimals(100, 18), expandDecimals(500, 18))
    await vester.connect(user0).deposit(expandDecimals(100, 18))
    await increaseTime(provider, 30 * 24 * 60 * 60)
    await mineBlock(provider)
    await vester.connect(user0).claim()
    await vester.connect(user0).withdraw()
    await vester.connect(capsAdmin).setProvisioningComplete()
    await vester.connect(handler).transferVestingState(user0.address, user1.address)

    await issueAndApprove(user0, expandDecimals(50, 18), expandDecimals(250, 18))
    await vester.connect(user0).deposit(expandDecimals(50, 18))

    await vester.connect(guardian).increaseCapDeduction(user0.address, ethers.constants.MaxUint256)
    expect(await vester.getVestingCap(user0.address)).eq(0)
    const esBefore = await esGmx.balanceOf(user0.address)
    await vester.connect(user0).withdraw()
    expect((await esGmx.balanceOf(user0.address)).sub(esBefore)).eq(expandDecimals(50, 18))
  })

  it("operates with esGMX in private transfer mode given the grants-table handlers", async () => {
    await esGmx.setInPrivateTransferMode(true)
    await esGmx.setHandler(issuer.address, true)
    await esGmx.setHandler(vester.address, true)

    await issueAndApprove(user0, expandDecimals(100, 18), expandDecimals(500, 18))
    await vester.connect(user0).deposit(expandDecimals(100, 18))

    await increaseTime(provider, 100 * 24 * 60 * 60)
    await mineBlock(provider)
    await vester.connect(user0).claim()
    const claimed = await gmx.balanceOf(user0.address)
    expect(claimed).gt(expandDecimals(27, 18))
    expect(claimed).lt(expandDecimals(28, 18))

    await vester.connect(user0).withdraw()
    const esBalance = await esGmx.balanceOf(user0.address)
    expect(esBalance).gt(expandDecimals(72, 18))
    expect(esBalance).lt(expandDecimals(73, 18))

    await esGmx.setHandler(vester.address, false)
    await esGmx.connect(user0).approve(vester.address, expandDecimals(1, 18))
    await expect(vester.connect(user0).deposit(expandDecimals(1, 18)))
      .to.be.revertedWith("BaseToken: msg.sender not whitelisted")
  })

  it("transfer guards: open session, freshness, pause, provisioning", async () => {
    await issueAndApprove(user0, expandDecimals(100, 18), expandDecimals(500, 18))
    await vester.connect(user0).deposit(expandDecimals(100, 18))

    await expect(vester.connect(user0).transferVestingState(user0.address, user1.address))
      .to.be.revertedWith("RatioVester: forbidden")
    await expect(vester.connect(handler).transferVestingState(user0.address, user1.address))
      .to.be.revertedWith("RatioVester: provisioning not complete")

    await vester.connect(capsAdmin).setProvisioningComplete()
    await expect(vester.connect(handler).transferVestingState(user0.address, user1.address))
      .to.be.revertedWith("RatioVester: sender has open session")

    await vester.connect(user0).withdraw()
    await vester.connect(user0).claim()

    await vester.connect(guardian).setTransferPaused(true)
    await expect(vester.connect(handler).transferVestingState(user0.address, user1.address))
      .to.be.revertedWith("RatioVester: transfers paused")
    await vester.connect(guardian).setTransferPaused(false)

    await vester.connect(handler).transferVestingState(user0.address, user1.address)

    await expect(vester.connect(handler).transferVestingState(user2.address, user1.address))
      .to.be.revertedWith("RatioVester: receiver not fresh")
  })

  it("solvency: a deposit beyond backing reverts at the deposit", async () => {
    const lean = await deployContract("RatioVester", [
      "V", "V", secondsPerYear, esGmx.address, pair.address, gmx.address,
      AddressZero, PAIR_PRECISION.mul(5), false
    ])
    await lean.setCapsAdmin(capsAdmin.address)
    await lean.connect(capsAdmin).setProvisionCaps([user0.address], [expandDecimals(1000, 18)])
    await gmx.mint(lean.address, expandDecimals(400, 18))

    await esGmx.mint(user0.address, expandDecimals(1000, 18))
    await esGmx.connect(user0).approve(lean.address, expandDecimals(1000, 18))
    await pair.mint(user0.address, expandDecimals(5000, 18))
    await pair.connect(user0).approve(lean.address, expandDecimals(5000, 18))

    await expect(lean.connect(user0).deposit(expandDecimals(500, 18)))
      .to.be.revertedWith("RatioVester: insufficient backing")
    await lean.connect(user0).deposit(expandDecimals(400, 18))
  })

  it("freeze halts conversion and claims, never withdrawal", async () => {
    await issueAndApprove(user0, expandDecimals(1000, 18), expandDecimals(5000, 18))
    await vester.connect(user0).deposit(expandDecimals(1000, 18))

    await vester.connect(guardian).setAccountFrozen(user0.address, true)
    await increaseTime(provider, 100 * 24 * 60 * 60)
    await mineBlock(provider)

    expect(await vester.claimable(user0.address)).eq(0)
    await expect(vester.connect(user0).claim())
      .to.be.revertedWith("RatioVester: account frozen")

    await vester.connect(user0).withdraw()
    expect(await esGmx.balanceOf(user0.address)).eq(expandDecimals(1000, 18))
    expect(await pair.balanceOf(user0.address)).eq(expandDecimals(5000, 18))
  })

  it("deactivation: notice, push-out only, vesting freezes while claims stay open", async () => {
    await expect(vester.setDeactivatedAt((await provider.getBlock("latest")).timestamp + 1000))
      .to.be.revertedWith("RatioVester: notice period too short")

    await issueAndApprove(user0, expandDecimals(1000, 18), expandDecimals(5000, 18))
    await vester.connect(user0).deposit(expandDecimals(1000, 18))

    const now = (await provider.getBlock("latest")).timestamp
    const deactivateAt = now + 10 * 24 * 60 * 60
    await vester.setDeactivatedAt(deactivateAt)
    await expect(vester.setDeactivatedAt(deactivateAt - 1))
      .to.be.revertedWith("RatioVester: can only push out")

    await increaseTime(provider, 30 * 24 * 60 * 60)
    await mineBlock(provider)

    await expect(vester.connect(user0).deposit(expandDecimals(1, 18)))
      .to.be.revertedWith("RatioVester: deactivated")
    await expect(vester.setDeactivatedAt(deactivateAt + 1000))
      .to.be.revertedWith("RatioVester: already deactivated")

    const claimable = await vester.claimable(user0.address)
    expect(claimable).gt(expandDecimals(26, 18))
    expect(claimable).lt(expandDecimals(29, 18))

    await vester.connect(user0).claim()
    await vester.connect(user0).withdraw()
    expect(await pair.balanceOf(user0.address)).eq(expandDecimals(5000, 18))
  })

  it("paginated settle walks a backlog to completion", async () => {
    await issueAndApprove(user0, expandDecimals(500, 18), expandDecimals(2500, 18))

    for (let i = 0; i < 5; i++) {
      await vester.connect(user0).deposit(expandDecimals(100, 18))
      await increaseTime(provider, 7 * 24 * 60 * 60)
      await mineBlock(provider)
    }
    expect(await vester.tranchesLength(user0.address)).eq(5)

    await increaseTime(provider, 366 * 24 * 60 * 60)
    await mineBlock(provider)

    await vester.connect(user1).settleTranches(user0.address, 2)
    expect(await vester.trancheStartIndex(user0.address)).eq(2)
    await vester.connect(user1).settleTranches(user0.address, 2)
    expect(await vester.trancheStartIndex(user0.address)).eq(4)
    await vester.connect(user1).settleTranches(user0.address, 2)
    expect(await vester.trancheStartIndex(user0.address)).eq(5)

    await vester.connect(user0).claim()
    expect(await gmx.balanceOf(user0.address)).eq(expandDecimals(500, 18))
  })

  it("withdrawToken never reaches collateral, in-flight esGMX, or GMX obligations", async () => {
    await issueAndApprove(user0, expandDecimals(1000, 18), expandDecimals(5000, 18))
    await vester.connect(user0).deposit(expandDecimals(1000, 18))

    await expect(vester.withdrawToken(pair.address, wallet.address, 1))
      .to.be.revertedWith("RatioVester: amount exceeds excess balance")
    await expect(vester.withdrawToken(esGmx.address, wallet.address, 1))
      .to.be.revertedWith("RatioVester: amount exceeds excess balance")

    const gmxBalance = await gmx.balanceOf(vester.address)
    const excess = gmxBalance.sub(expandDecimals(1000, 18))
    await expect(vester.withdrawToken(gmx.address, wallet.address, excess.add(1)))
      .to.be.revertedWith("RatioVester: amount exceeds excess balance")
    await vester.withdrawToken(gmx.address, wallet.address, excess)
  })
})
