const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed } = require("../shared/utilities")

use(solidity)

describe("TimeDistributor", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let token
  let distributor

  beforeEach(async () => {
    token = await deployContract("Token", [])
    await token.mint(wallet.address, 1000)
    distributor = await deployContract("TimeDistributor", [])
  })

  it("distribute", async () => {
    await token.transfer(distributor.address, 1000)
    await expect(distributor.connect(user0).setDistribution([user1.address], [100], [token.address]))
      .to.be.revertedWith("TimeDistributor: forbidden")

    await distributor.connect(wallet).setDistribution([user1.address], [100], [token.address])
    expect(await distributor.getDistributionAmount(user1.address)).eq(0)

    await increaseTime(provider, 60 * 60 + 10)
    await mineBlock(provider)

    expect(await distributor.getDistributionAmount(user1.address)).eq(100)

    await increaseTime(provider, 2 * 60 * 60 + 10)
    await mineBlock(provider)

    expect(await distributor.getDistributionAmount(user1.address)).eq(300)

    expect(await token.balanceOf(user1.address)).eq(0)
    await distributor.connect(user1).distribute()
    expect(await token.balanceOf(user1.address)).eq(300)

    expect(await distributor.getDistributionAmount(user1.address)).eq(0)

    await increaseTime(provider, 10)
    await mineBlock(provider)

    expect(await distributor.getDistributionAmount(user1.address)).eq(0)

    await increaseTime(provider, 60)
    await mineBlock(provider)

    await distributor.connect(user1).distribute()

    await increaseTime(provider, 60 * 60 - 60)
    await mineBlock(provider)

    expect(await distributor.getDistributionAmount(user1.address)).eq(100)

    await distributor.connect(user1).distribute()

    await expect(distributor.connect(user0).setTokensPerInterval(user1.address, 50))
      .to.be.revertedWith("TimeDistributor: forbidden")

    expect(await distributor.tokensPerInterval(user1.address)).eq(100)
    await distributor.connect(wallet).setTokensPerInterval(user1.address, 50)
    expect(await distributor.tokensPerInterval(user1.address)).eq(50)

    await expect(distributor.connect(user0).updateLastDistributionTime(user1.address))
      .to.be.revertedWith("TimeDistributor: forbidden")

    await increaseTime(provider, 60)
    await mineBlock(provider)

    const lastDistributionTime = await distributor.lastDistributionTime(user1.address)
    await distributor.connect(wallet).updateLastDistributionTime(user1.address)
    expect(await distributor.lastDistributionTime(user1.address)).eq(lastDistributionTime)

    await increaseTime(provider, 60 * 60 + 1)
    await mineBlock(provider)

    await distributor.connect(wallet).updateLastDistributionTime(user1.address)
    expect(await distributor.lastDistributionTime(user1.address)).eq(lastDistributionTime.add(60 * 60))
  })
})
