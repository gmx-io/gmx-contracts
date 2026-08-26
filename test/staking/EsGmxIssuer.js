const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals } = require("../shared/utilities")

use(solidity)

const { AddressZero } = ethers.constants

describe("EsGmxIssuer", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, capsAdmin, guardian, distributor] = provider.getWallets()
  let esGmx
  let issuer
  let sorted

  beforeEach(async () => {
    esGmx = await deployContract("EsGMX", [])
    issuer = await deployContract("EsGmxIssuer", [esGmx.address])

    await esGmx.setMinter(wallet.address, true)
    await issuer.setCapsAdmin(capsAdmin.address)
    await issuer.setGuardian(guardian.address)
    await issuer.connect(capsAdmin).setDistributor(distributor.address, true)

    sorted = [user0.address, user1.address, user2.address].sort((a, b) =>
      a.toLowerCase() < b.toLowerCase() ? -1 : 1
    )
  })

  it("inits and gates roles", async () => {
    expect(await issuer.esGmx()).eq(esGmx.address)
    expect(await issuer.vester()).eq(AddressZero)
    expect(await issuer.gov()).eq(wallet.address)
    expect(await issuer.capsAdmin()).eq(capsAdmin.address)
    expect(await issuer.guardian()).eq(guardian.address)
    expect(await issuer.isDistributor(distributor.address)).eq(true)

    await expect(issuer.connect(user0).setDistributor(user0.address, true))
      .to.be.revertedWith("Guardable: forbidden")
    await expect(issuer.connect(user0).setClaimsPaused(true))
      .to.be.revertedWith("Guardable: forbidden")
    await expect(issuer.connect(user0).setHandler(user0.address, true))
      .to.be.revertedWith("Governable: forbidden")
    await expect(issuer.connect(user0).setVester(user0.address))
      .to.be.revertedWith("Governable: forbidden")
    await expect(issuer.connect(user0).withdrawToken(esGmx.address, user0.address, 1))
      .to.be.revertedWith("Governable: forbidden")
    await expect(issuer.connect(user0).finalizeEpoch(1, 0, 0))
      .to.be.revertedWith("Guardable: forbidden")
    await expect(issuer.connect(user0).reduceIssuedAmount(user0.address, 1))
      .to.be.revertedWith("Guardable: forbidden")
  })

  it("setVester is one-shot", async () => {
    await expect(issuer.setVester(AddressZero))
      .to.be.revertedWith("EsGmxIssuer: invalid vester")
    await issuer.setVester(user1.address)
    expect(await issuer.vester()).eq(user1.address)
    await expect(issuer.setVester(user2.address))
      .to.be.revertedWith("EsGmxIssuer: vester already set")
  })

  it("distributeEpoch validates inputs and funding", async () => {
    await expect(issuer.connect(user0).distributeEpoch(1, 0, [sorted[0]], [100]))
      .to.be.revertedWith("EsGmxIssuer: forbidden")
    await expect(issuer.connect(distributor).distributeEpoch(1, 0, [], []))
      .to.be.revertedWith("EsGmxIssuer: empty batch")
    await expect(issuer.connect(distributor).distributeEpoch(1, 0, [sorted[0]], [100, 200]))
      .to.be.revertedWith("EsGmxIssuer: invalid input lengths")
    await expect(issuer.connect(distributor).distributeEpoch(1, 0, [sorted[1], sorted[0]], [100, 200]))
      .to.be.revertedWith("EsGmxIssuer: accounts not sorted")
    await expect(issuer.connect(distributor).distributeEpoch(1, 0, [sorted[0], sorted[0]], [100, 200]))
      .to.be.revertedWith("EsGmxIssuer: accounts not sorted")
    await expect(issuer.connect(distributor).distributeEpoch(1, 0, [AddressZero], [100]))
      .to.be.revertedWith("EsGmxIssuer: invalid account")
    await expect(issuer.connect(distributor).distributeEpoch(1, 0, [sorted[0]], [0]))
      .to.be.revertedWith("EsGmxIssuer: invalid amount")

    await expect(issuer.connect(distributor).distributeEpoch(1, 0, [sorted[0]], [100]))
      .to.be.revertedWith("EsGmxIssuer: insufficient esGMX for issuance")

    await esGmx.mint(issuer.address, 1000)
    await issuer.connect(distributor).distributeEpoch(1, 0, [sorted[0], sorted[1]], [100, 200])

    expect(await issuer.issuedAmounts(sorted[0])).eq(100)
    expect(await issuer.issuedAmounts(sorted[1])).eq(200)
    expect(await issuer.claimable(sorted[0])).eq(100)
    expect(await issuer.totalIssuedAmount()).eq(300)

    const epoch = await issuer.epochs(1)
    expect(epoch.finalized).eq(false)
    expect(epoch.entryCount).eq(2)
    expect(epoch.totalAmount).eq(300)

    await expect(issuer.connect(distributor).distributeEpoch(1, 1, [sorted[0]], [800]))
      .to.be.revertedWith("EsGmxIssuer: insufficient esGMX for issuance")
    await issuer.connect(distributor).distributeEpoch(1, 1, [sorted[0]], [700])
    expect(await issuer.totalIssuedAmount()).eq(1000)
  })

  it("closes both replay shapes, scoped per epoch", async () => {
    await esGmx.mint(issuer.address, 1000)
    await issuer.connect(distributor).distributeEpoch(1, 0, [sorted[0]], [100])

    await expect(issuer.connect(distributor).distributeEpoch(1, 0, [sorted[1]], [100]))
      .to.be.revertedWith("EsGmxIssuer: batch index already processed")
    await expect(issuer.connect(distributor).distributeEpoch(1, 1, [sorted[0]], [100]))
      .to.be.revertedWith("EsGmxIssuer: batch content already processed")

    await issuer.connect(distributor).distributeEpoch(1, 1, [sorted[0]], [150])
    await issuer.connect(distributor).distributeEpoch(2, 0, [sorted[0]], [100])

    expect(await issuer.issuedAmounts(sorted[0])).eq(350)
  })

  it("finalizeEpoch reconciles and seals", async () => {
    await esGmx.mint(issuer.address, 1000)
    await issuer.connect(distributor).distributeEpoch(1, 0, [sorted[0], sorted[1]], [100, 200])

    await expect(issuer.connect(capsAdmin).finalizeEpoch(1, 1, 300))
      .to.be.revertedWith("EsGmxIssuer: entry count mismatch")
    await expect(issuer.connect(capsAdmin).finalizeEpoch(1, 2, 299))
      .to.be.revertedWith("EsGmxIssuer: total amount mismatch")
    await expect(issuer.connect(capsAdmin).finalizeEpoch(2, 1, 100))
      .to.be.revertedWith("EsGmxIssuer: entry count mismatch")

    await issuer.connect(capsAdmin).finalizeEpoch(1, 2, 300)
    expect((await issuer.epochs(1)).finalized).eq(true)

    await expect(issuer.connect(capsAdmin).finalizeEpoch(1, 2, 300))
      .to.be.revertedWith("EsGmxIssuer: epoch finalized")
    await expect(issuer.connect(distributor).distributeEpoch(1, 2, [sorted[2]], [50]))
      .to.be.revertedWith("EsGmxIssuer: epoch finalized")
  })

  it("claims pay the account in full, once", async () => {
    await esGmx.mint(issuer.address, 1000)
    await issuer.connect(distributor).distributeEpoch(1, 0, [user0.address], [400])

    await issuer.connect(user0).claim()
    expect(await esGmx.balanceOf(user0.address)).eq(400)
    expect(await issuer.claimable(user0.address)).eq(0)
    expect(await issuer.totalClaimedAmount()).eq(400)

    await issuer.connect(user0).claim()
    expect(await esGmx.balanceOf(user0.address)).eq(400)

    await issuer.connect(distributor).distributeEpoch(1, 1, [user0.address], [100])
    await expect(issuer.connect(user1).claimForAccount(user0.address))
      .to.be.revertedWith("EsGmxIssuer: forbidden")
    await issuer.setHandler(user1.address, true)
    await issuer.connect(user1).claimForAccount(user0.address)
    expect(await esGmx.balanceOf(user0.address)).eq(500)
    expect(await esGmx.balanceOf(user1.address)).eq(0)
  })

  it("guardian pause blocks claims", async () => {
    await esGmx.mint(issuer.address, 1000)
    await issuer.connect(distributor).distributeEpoch(1, 0, [user0.address], [400])

    await issuer.connect(guardian).setClaimsPaused(true)
    await expect(issuer.connect(user0).claim())
      .to.be.revertedWith("EsGmxIssuer: claims paused")

    await issuer.connect(guardian).setClaimsPaused(false)
    await issuer.connect(user0).claim()
    expect(await esGmx.balanceOf(user0.address)).eq(400)
  })

  it("reduceIssuedAmount reaches only unclaimed amounts", async () => {
    await esGmx.mint(issuer.address, 1000)
    await issuer.connect(distributor).distributeEpoch(1, 0, [user0.address], [400])

    await issuer.connect(capsAdmin).reduceIssuedAmount(user0.address, 150)
    expect(await issuer.issuedAmounts(user0.address)).eq(250)
    expect(await issuer.claimable(user0.address)).eq(250)
    expect(await issuer.totalIssuedAmount()).eq(250)

    await issuer.connect(user0).claim()
    await expect(issuer.connect(capsAdmin).reduceIssuedAmount(user0.address, 1))
      .to.be.revertedWith("EsGmxIssuer: amount exceeds unclaimed")
  })

  it("withdrawToken reaches only esGMX above the outstanding ledger", async () => {
    await esGmx.mint(issuer.address, 1000)
    await issuer.connect(distributor).distributeEpoch(1, 0, [user0.address], [600])

    await expect(issuer.withdrawToken(esGmx.address, wallet.address, 401))
      .to.be.revertedWith("EsGmxIssuer: amount exceeds excess balance")
    await issuer.withdrawToken(esGmx.address, wallet.address, 400)
    expect(await esGmx.balanceOf(wallet.address)).eq(400)

    await issuer.connect(user0).claim()
    expect(await esGmx.balanceOf(issuer.address)).eq(0)
    await expect(issuer.withdrawToken(esGmx.address, wallet.address, 1))
      .to.be.revertedWith("EsGmxIssuer: amount exceeds excess balance")
  })

  it("claims need handler status once esGMX is in private transfer mode", async () => {
    await esGmx.mint(issuer.address, 1000)
    await issuer.connect(distributor).distributeEpoch(1, 0, [user0.address], [400])

    await esGmx.setInPrivateTransferMode(true)
    await expect(issuer.connect(user0).claim())
      .to.be.revertedWith("BaseToken: msg.sender not whitelisted")

    await esGmx.setHandler(issuer.address, true)
    await issuer.connect(user0).claim()
    expect(await esGmx.balanceOf(user0.address)).eq(400)
  })
})
