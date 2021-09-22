const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")

use(solidity)

describe("BatchSender", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let batchSender
  let gmt

  beforeEach(async () => {
    batchSender = await deployContract("BatchSender", [])
    gmt = await deployContract("GMT", [1500])
    await gmt.beginMigration()
  })

  it("send", async () => {
      expect(await gmt.balanceOf(wallet.address)).eq(1500)

      expect(await gmt.balanceOf(user0.address)).eq(0)
      expect(await gmt.balanceOf(user1.address)).eq(0)
      expect(await gmt.balanceOf(user2.address)).eq(0)
      expect(await gmt.balanceOf(user3.address)).eq(0)

      const accounts = [user0.address, user1.address, user2.address, user3.address]
      const amounts = [100, 200, 300, 400]

      await expect(batchSender.connect(user0).send(gmt.address, accounts, amounts))
        .to.be.revertedWith("BatchSender: forbidden")

      await gmt.approve(batchSender.address, 1000)

      await expect(batchSender.connect(wallet).send(gmt.address, accounts, amounts))
        .to.be.revertedWith("GMT: forbidden msg.sender")

      await gmt.addMsgSender(batchSender.address)
      await batchSender.send(gmt.address, accounts, amounts)

      expect(await gmt.balanceOf(user0.address)).eq(100)
      expect(await gmt.balanceOf(user1.address)).eq(200)
      expect(await gmt.balanceOf(user2.address)).eq(300)
      expect(await gmt.balanceOf(user3.address)).eq(400)
      expect(await gmt.balanceOf(wallet.address)).eq(500)
  })
})
