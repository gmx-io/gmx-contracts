const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed } = require("../shared/utilities")

use(solidity)

describe("YieldFarm", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let farm
  let token

  beforeEach(async () => {
    token = await deployContract("Token", [])
    await token.mint(wallet.address, 1000)
    farm = await deployContract("YieldFarm", ["Yield Farm", "FARM", token.address])
  })

  it("stake", async () => {
    await expect(farm.stake(1000))
      .to.be.revertedWith("ERC20: transfer amount exceeds allowance")

    await token.connect(wallet).approve(farm.address, 2000)
    await expect(farm.stake(2000))
      .to.be.revertedWith("ERC20: transfer amount exceeds balance")

    expect(await farm.balanceOf(wallet.address)).eq(0)
    expect(await token.balanceOf(wallet.address)).eq(1000)
    expect(await token.balanceOf(farm.address)).eq(0)
    await farm.stake(1000)
    expect(await farm.balanceOf(wallet.address)).eq(1000)
    expect(await token.balanceOf(wallet.address)).eq(0)
    expect(await token.balanceOf(farm.address)).eq(1000)
  })

  it("unstake", async () => {
    await token.connect(wallet).approve(farm.address, 2000)
    expect(await farm.balanceOf(wallet.address)).eq(0)
    expect(await token.balanceOf(wallet.address)).eq(1000)
    expect(await token.balanceOf(farm.address)).eq(0)
    await farm.stake(1000)
    expect(await farm.balanceOf(wallet.address)).eq(1000)
    expect(await token.balanceOf(wallet.address)).eq(0)
    expect(await token.balanceOf(farm.address)).eq(1000)

    await expect(farm.unstake(1001))
      .to.be.revertedWith("YieldToken: burn amount exceeds balance")

    await farm.unstake(1000)

    expect(await farm.balanceOf(wallet.address)).eq(0)
    expect(await token.balanceOf(wallet.address)).eq(1000)
    expect(await token.balanceOf(farm.address)).eq(0)
  })
})
