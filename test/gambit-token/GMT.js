const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock } = require("../shared/utilities")

use(solidity)

describe("GMT", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let gmt

  beforeEach(async () => {
    gmt = await deployContract("GMT", [expandDecimals(1000 * 1000, 18)])
  })

  it("inits", async () => {
    expect(await gmt.gov()).eq(wallet.address)
    expect(await gmt.admins(wallet.address)).eq(true)
    expect(await gmt.balanceOf(wallet.address)).eq(expandDecimals(1000 * 1000, 18))
    expect(await gmt.totalSupply()).eq(expandDecimals(1000 * 1000, 18))
  })

  it("setGov", async () => {
    await expect(gmt.connect(user0).setGov(user1.address))
      .to.be.revertedWith("GMT: forbidden")

    expect(await gmt.gov()).eq(wallet.address)

    await gmt.setGov(user0.address)
    expect(await gmt.gov()).eq(user0.address)

    await gmt.connect(user0).setGov(user1.address)
    expect(await gmt.gov()).eq(user1.address)
  })

  it("addAdmin", async () => {
    await expect(gmt.connect(user0).addAdmin(user1.address))
      .to.be.revertedWith("GMT: forbidden")

    expect(await gmt.admins(user1.address)).eq(false)
    await gmt.addAdmin(user1.address)
    expect(await gmt.admins(user1.address)).eq(true)
  })

  it("removeAdmin", async () => {
    await expect(gmt.connect(user0).removeAdmin(user1.address))
      .to.be.revertedWith("GMT: forbidden")

    expect(await gmt.admins(user1.address)).eq(false)

    await gmt.addAdmin(user1.address)
    expect(await gmt.admins(user1.address)).eq(true)

    await gmt.removeAdmin(user1.address)
    expect(await gmt.admins(user1.address)).eq(false)
  })

  it("setNextMigrationTime", async () => {
    await expect(gmt.connect(user0).setNextMigrationTime(1000))
      .to.be.revertedWith("GMT: forbidden")

    expect(await gmt.migrationTime()).eq(0)

    await gmt.setNextMigrationTime(1000)
    expect(await gmt.migrationTime()).eq(1000)

    await expect(gmt.setNextMigrationTime(999))
      .to.be.revertedWith("GMT: invalid _migrationTime")

    await gmt.setNextMigrationTime(1001)
    expect(await gmt.migrationTime()).eq(1001)
  })

  it("beginMigration", async () => {
    await expect(gmt.connect(user0).beginMigration())
      .to.be.revertedWith("GMT: forbidden")

    await gmt.addAdmin(user0.address)
    expect(await gmt.hasActiveMigration()).eq(false)
    await gmt.connect(user0).beginMigration()
    expect(await gmt.hasActiveMigration()).eq(true)

    await gmt.connect(user0).endMigration()
    expect(await gmt.hasActiveMigration()).eq(false)

    const nextMigrationTime = (await getBlockTime(provider)) + 1000
    await gmt.setNextMigrationTime(nextMigrationTime)

    await expect(gmt.connect(user0).beginMigration())
      .to.be.revertedWith("GMT: migrationTime not yet passed")

    await increaseTime(provider, 1010)
    await mineBlock(provider)

    expect(await gmt.hasActiveMigration()).eq(false)
    await gmt.connect(user0).beginMigration()
    expect(await gmt.hasActiveMigration()).eq(true)
  })

  it("addBlockedRecipient", async () => {
    await expect(gmt.connect(user0).addBlockedRecipient(user1.address))
      .to.be.revertedWith("GMT: forbidden")

    expect(await gmt.blockedRecipients(user1.address)).eq(false)
    await gmt.addBlockedRecipient(user1.address)
    expect(await gmt.blockedRecipients(user1.address)).eq(true)
  })

  it("removeBlockedRecipient", async () => {
    await expect(gmt.connect(user0).removeBlockedRecipient(user1.address))
      .to.be.revertedWith("GMT: forbidden")

    expect(await gmt.blockedRecipients(user1.address)).eq(false)

    await gmt.addBlockedRecipient(user1.address)
    expect(await gmt.blockedRecipients(user1.address)).eq(true)

    await gmt.removeBlockedRecipient(user1.address)
    expect(await gmt.blockedRecipients(user1.address)).eq(false)
  })

  it("addMsgSender", async () => {
    await expect(gmt.connect(user0).addMsgSender(user1.address))
      .to.be.revertedWith("GMT: forbidden")

    expect(await gmt.allowedMsgSenders(user1.address)).eq(false)
    await gmt.addMsgSender(user1.address)
    expect(await gmt.allowedMsgSenders(user1.address)).eq(true)
  })

  it("removeMsgSender", async () => {
    await expect(gmt.connect(user0).removeMsgSender(user1.address))
      .to.be.revertedWith("GMT: forbidden")

    expect(await gmt.allowedMsgSenders(user1.address)).eq(false)

    await gmt.addMsgSender(user1.address)
    expect(await gmt.allowedMsgSenders(user1.address)).eq(true)

    await gmt.removeMsgSender(user1.address)
    expect(await gmt.allowedMsgSenders(user1.address)).eq(false)
  })

  it("withdrawToken", async () => {
    const token = await deployContract("Token", [])
    await token.mint(wallet.address, 1000)

    expect(await token.balanceOf(wallet.address)).eq(1000)
    expect(await token.balanceOf(gmt.address)).eq(0)
    await token.transfer(gmt.address, 1000)
    expect(await token.balanceOf(wallet.address)).eq(0)
    expect(await token.balanceOf(gmt.address)).eq(1000)

    await expect(gmt.connect(user0).withdrawToken(token.address, user1.address, 1000))
      .to.be.revertedWith("GMT: forbidden")

    expect(await token.balanceOf(wallet.address)).eq(0)
    expect(await token.balanceOf(gmt.address)).eq(1000)
    expect(await token.balanceOf(user1.address)).eq(0)
    await gmt.withdrawToken(token.address, user1.address, 1000)
    expect(await token.balanceOf(wallet.address)).eq(0)
    expect(await token.balanceOf(gmt.address)).eq(0)
    expect(await token.balanceOf(user1.address)).eq(1000)
  })

  it("transfer", async () => {
    expect(await gmt.balanceOf(wallet.address)).eq(expandDecimals(1000 * 1000, 18))
    expect(await gmt.balanceOf(user0.address)).eq(0)
    await gmt.transfer(user0.address, expandDecimals(1000, 18))
    expect(await gmt.balanceOf(wallet.address)).eq(expandDecimals(999 * 1000, 18))
    expect(await gmt.balanceOf(user0.address)).eq(expandDecimals(1000, 18))

    await expect(gmt.connect(user0).transfer(user1.address, expandDecimals(1001, 18)))
      .to.be.revertedWith("GMT: transfer amount exceeds balance")
  })

  it("approve", async () => {
    expect(await gmt.allowance(wallet.address, user0.address)).eq(0)
    await gmt.approve(user0.address, 1000)
    expect(await gmt.allowance(wallet.address, user0.address)).eq(1000)
  })

  it("transferFrom", async () => {
    expect(await gmt.allowance(wallet.address, user0.address)).eq(0)
    await gmt.approve(user0.address, expandDecimals(2000, 18))
    expect(await gmt.allowance(wallet.address, user0.address)).eq(expandDecimals(2000, 18))

    expect(await gmt.balanceOf(wallet.address)).eq(expandDecimals(1000 * 1000, 18))
    expect(await gmt.balanceOf(user1.address)).eq(0)

    await gmt.connect(user0).transferFrom(wallet.address, user1.address, expandDecimals(1000, 18))
    expect(await gmt.allowance(wallet.address, user0.address)).eq(expandDecimals(1000, 18))

    expect(await gmt.balanceOf(wallet.address)).eq(expandDecimals(999 * 1000, 18))
    expect(await gmt.balanceOf(user1.address)).eq(expandDecimals(1000, 18))

    await expect(gmt.connect(user0).transferFrom(wallet.address, user1.address, expandDecimals(1001, 18)))
      .to.be.revertedWith("GMT: transfer amount exceeds allowance")
  })

  it("allows migrations", async () => {
    await gmt.beginMigration()
    await gmt.approve(user0.address, expandDecimals(1000, 18))
    await expect(gmt.connect(user0).transferFrom(wallet.address, user1.address, expandDecimals(500, 18)))
      .to.be.revertedWith("GMT: forbidden msg.sender")

    await gmt.addMsgSender(user0.address)

    expect(await gmt.balanceOf(user1.address)).eq(0)
    await gmt.connect(user0).transferFrom(wallet.address, user1.address, expandDecimals(500, 18))
    expect(await gmt.balanceOf(user1.address)).eq(expandDecimals(500, 18))

    await gmt.addBlockedRecipient(user1.address)
    await expect(gmt.connect(user0).transferFrom(wallet.address, user1.address, expandDecimals(500, 18)))
      .to.be.revertedWith("GMT: forbidden recipient")

    await gmt.removeBlockedRecipient(user1.address)

    await gmt.connect(user0).transferFrom(wallet.address, user1.address, expandDecimals(500, 18))
    expect(await gmt.balanceOf(user1.address)).eq(expandDecimals(1000, 18))
  })
})
