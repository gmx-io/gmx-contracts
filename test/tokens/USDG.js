const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed } = require("../shared/utilities")

use(solidity)

describe("USDG", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let usdg

  beforeEach(async () => {
    usdg = await deployContract("USDG", [user1.address])
  })

  it("addVault", async () => {
    await expect(usdg.connect(user0).addVault(user0.address))
      .to.be.revertedWith("YieldToken: forbidden")

    await usdg.setGov(user0.address)

    expect(await usdg.vaults(user0.address)).eq(false)
    await usdg.connect(user0).addVault(user0.address)
    expect(await usdg.vaults(user0.address)).eq(true)
  })

  it("removeVault", async () => {
    await expect(usdg.connect(user0).removeVault(user0.address))
      .to.be.revertedWith("YieldToken: forbidden")

    await usdg.setGov(user0.address)

    expect(await usdg.vaults(user0.address)).eq(false)
    await usdg.connect(user0).addVault(user0.address)
    expect(await usdg.vaults(user0.address)).eq(true)
    await usdg.connect(user0).removeVault(user0.address)
    expect(await usdg.vaults(user0.address)).eq(false)
  })

  it("mint", async () => {
    expect(await usdg.balanceOf(user1.address)).eq(0)
    await usdg.connect(user1).mint(user1.address, 1000)
    expect(await usdg.balanceOf(user1.address)).eq(1000)
    expect(await usdg.totalSupply()).eq(1000)

    await expect(usdg.connect(user0).mint(user1.address, 1000))
      .to.be.revertedWith("USDG: forbidden")

    await usdg.addVault(user0.address)

    expect(await usdg.balanceOf(user1.address)).eq(1000)
    await usdg.connect(user0).mint(user1.address, 500)
    expect(await usdg.balanceOf(user1.address)).eq(1500)
    expect(await usdg.totalSupply()).eq(1500)
  })

  it("burn", async () => {
    expect(await usdg.balanceOf(user1.address)).eq(0)
    await usdg.connect(user1).mint(user1.address, 1000)
    expect(await usdg.balanceOf(user1.address)).eq(1000)
    await usdg.connect(user1).burn(user1.address, 300)
    expect(await usdg.balanceOf(user1.address)).eq(700)
    expect(await usdg.totalSupply()).eq(700)

    await expect(usdg.connect(user0).burn(user1.address, 100))
      .to.be.revertedWith("USDG: forbidden")

    await usdg.addVault(user0.address)

    await usdg.connect(user0).burn(user1.address, 100)
    expect(await usdg.balanceOf(user1.address)).eq(600)
    expect(await usdg.totalSupply()).eq(600)
  })
})
