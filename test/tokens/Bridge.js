const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed } = require("../shared/utilities")

use(solidity)

describe("Bridge", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let gmx
  let wgmx
  let bridge

  beforeEach(async () => {
    gmx = await deployContract("GMX", [])
    wgmx = await deployContract("GMX", [])
    bridge = await deployContract("Bridge", [gmx.address, wgmx.address])
  })

  it("wrap, unwrap", async () => {
    await gmx.setMinter(wallet.address, true)
    await gmx.mint(user0.address, 100)
    await gmx.connect(user0).approve(bridge.address, 100)
    await expect(bridge.connect(user0).wrap(200, user1.address))
      .to.be.revertedWith("BaseToken: transfer amount exceeds allowance")

    await expect(bridge.connect(user0).wrap(100, user1.address))
      .to.be.revertedWith("BaseToken: transfer amount exceeds balance")

    await wgmx.setMinter(wallet.address, true)
    await wgmx.mint(bridge.address, 50)

    await expect(bridge.connect(user0).wrap(100, user1.address))
      .to.be.revertedWith("BaseToken: transfer amount exceeds balance")

    await wgmx.mint(bridge.address, 50)

    expect(await gmx.balanceOf(user0.address)).eq(100)
    expect(await gmx.balanceOf(bridge.address)).eq(0)
    expect(await wgmx.balanceOf(user1.address)).eq(0)
    expect(await wgmx.balanceOf(bridge.address)).eq(100)

    await bridge.connect(user0).wrap(100, user1.address)

    expect(await gmx.balanceOf(user0.address)).eq(0)
    expect(await gmx.balanceOf(bridge.address)).eq(100)
    expect(await wgmx.balanceOf(user1.address)).eq(100)
    expect(await wgmx.balanceOf(bridge.address)).eq(0)

    await wgmx.connect(user1).approve(bridge.address, 100)

    expect(await gmx.balanceOf(user2.address)).eq(0)
    expect(await gmx.balanceOf(bridge.address)).eq(100)
    expect(await wgmx.balanceOf(user1.address)).eq(100)
    expect(await wgmx.balanceOf(bridge.address)).eq(0)

    await bridge.connect(user1).unwrap(100, user2.address)

    expect(await gmx.balanceOf(user2.address)).eq(100)
    expect(await gmx.balanceOf(bridge.address)).eq(0)
    expect(await wgmx.balanceOf(user1.address)).eq(0)
    expect(await wgmx.balanceOf(bridge.address)).eq(100)
  })

  it("withdrawToken", async () => {
    await gmx.setMinter(wallet.address, true)
    await gmx.mint(bridge.address, 100)

    await expect(bridge.connect(user0).withdrawToken(gmx.address, user1.address, 100))
      .to.be.revertedWith("Governable: forbidden")

    await expect(bridge.connect(user0).setGov(user0.address))
      .to.be.revertedWith("Governable: forbidden")

    await bridge.connect(wallet).setGov(user0.address)

    expect(await gmx.balanceOf(user1.address)).eq(0)
    expect(await gmx.balanceOf(bridge.address)).eq(100)
    await bridge.connect(user0).withdrawToken(gmx.address, user1.address, 100)
    expect(await gmx.balanceOf(user1.address)).eq(100)
    expect(await gmx.balanceOf(bridge.address)).eq(0)
  })
})
