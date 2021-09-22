const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed } = require("../shared/utilities")

use(solidity)

describe("YieldToken", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let bnb
  let btc
  let yieldToken
  let distributor0
  let yieldTracker0

  beforeEach(async () => {
    bnb = await deployContract("Token", [])
    btc = await deployContract("Token", [])

    yieldToken = await deployContract("YieldToken", ["Token", "TKN", 1000])

    distributor0 = await deployContract("TimeDistributor", [])
    yieldTracker0 = await deployContract("YieldTracker", [yieldToken.address])

    distributor1 = await deployContract("TimeDistributor", [])
    yieldTracker1 = await deployContract("YieldTracker", [yieldToken.address])

    await yieldTracker0.setDistributor(distributor0.address)
    await distributor0.setDistribution([yieldTracker0.address], [1000], [bnb.address])

    await yieldTracker1.setDistributor(distributor1.address)
    await distributor1.setDistribution([yieldTracker1.address], [2000], [btc.address])
  })

  it("claim", async () => {
    await bnb.mint(distributor0.address, 5000)
    await btc.mint(distributor1.address, 5000)

    const tx0 = await yieldToken.transfer(user0.address, 200)
    await reportGasUsed(provider, tx0, "tranfer0 gas used")

    await increaseTime(provider, 60 * 60 + 10)
    await mineBlock(provider)

    await yieldToken.setYieldTrackers([yieldTracker0.address])
    await yieldToken.connect(wallet).claim(user1.address)
    expect(await bnb.balanceOf(user1.address)).eq(800)
    expect(await bnb.balanceOf(yieldTracker0.address)).eq(200)
    expect(await btc.balanceOf(user1.address)).eq(0)
    expect(await btc.balanceOf(yieldTracker1.address)).eq(0)

    const tx1 = await yieldToken.transfer(user0.address, 200)
    await reportGasUsed(provider, tx1, "tranfer1 gas used")

    await yieldToken.setYieldTrackers([yieldTracker0.address, yieldTracker1.address])

    const tx2 = await yieldToken.transfer(user0.address, 200)
    await reportGasUsed(provider, tx2, "tranfer2 gas used")

    expect(await btc.balanceOf(yieldTracker1.address)).eq(2000)

    expect(await bnb.balanceOf(user2.address)).eq(0)
    expect(await btc.balanceOf(user2.address)).eq(0)

    await yieldToken.connect(user0).claim(user2.address)

    expect(await bnb.balanceOf(user2.address)).eq(200)
    expect(await btc.balanceOf(user2.address)).eq(800)

    expect(await bnb.balanceOf(user3.address)).eq(0)
    expect(await btc.balanceOf(user3.address)).eq(0)

    await yieldToken.connect(wallet).claim(user3.address)

    expect(await bnb.balanceOf(user3.address)).eq(0)
    expect(await btc.balanceOf(user3.address)).eq(1200)

    const tx3 = await yieldToken.transfer(user0.address, 200)
    await reportGasUsed(provider, tx3, "tranfer3 gas used")
  })

  it("nonStakingAccounts", async () => {
    await bnb.mint(distributor0.address, 5000)
    await btc.mint(distributor1.address, 5000)
    await yieldToken.setYieldTrackers([yieldTracker0.address, yieldTracker1.address])

    await yieldToken.transfer(user0.address, 100)
    await yieldToken.transfer(user1.address, 300)

    await increaseTime(provider, 60 * 60 + 10)
    await mineBlock(provider)

    expect(await bnb.balanceOf(wallet.address)).eq(0)
    expect(await btc.balanceOf(wallet.address)).eq(0)
    await yieldToken.connect(wallet).claim(wallet.address)
    expect(await bnb.balanceOf(wallet.address)).eq(600)
    expect(await btc.balanceOf(wallet.address)).eq(1200)

    expect(await bnb.balanceOf(user0.address)).eq(0)
    expect(await btc.balanceOf(user0.address)).eq(0)
    await yieldToken.connect(user0).claim(user0.address)
    expect(await bnb.balanceOf(user0.address)).eq(100)
    expect(await btc.balanceOf(user0.address)).eq(200)

    expect(await bnb.balanceOf(user1.address)).eq(0)
    expect(await btc.balanceOf(user1.address)).eq(0)
    await yieldToken.connect(user1).claim(user1.address)
    expect(await bnb.balanceOf(user1.address)).eq(300)
    expect(await btc.balanceOf(user1.address)).eq(600)

    expect(await yieldToken.balanceOf(wallet.address)).eq(600)
    expect(await yieldToken.stakedBalance(wallet.address)).eq(600)
    expect(await yieldToken.totalStaked()).eq(1000)
    await yieldToken.addNonStakingAccount(wallet.address)
    expect(await yieldToken.balanceOf(wallet.address)).eq(600)
    expect(await yieldToken.stakedBalance(wallet.address)).eq(0)
    expect(await yieldToken.totalStaked()).eq(400)

    await yieldToken.transfer(user0.address, 100)
    expect(await yieldToken.totalStaked()).eq(500)
    expect(await yieldToken.balanceOf(user0.address)).eq(200)
    expect(await yieldToken.balanceOf(user1.address)).eq(300)

    await increaseTime(provider, 60 * 60 + 10)
    await mineBlock(provider)

    expect(await bnb.balanceOf(wallet.address)).eq(600)
    expect(await btc.balanceOf(wallet.address)).eq(1200)
    await yieldToken.connect(wallet).claim(wallet.address)
    expect(await bnb.balanceOf(wallet.address)).eq(600)
    expect(await btc.balanceOf(wallet.address)).eq(1200)

    expect(await bnb.balanceOf(user0.address)).eq(100)
    expect(await btc.balanceOf(user0.address)).eq(200)
    await yieldToken.connect(user0).claim(user0.address)
    expect(await bnb.balanceOf(user0.address)).eq(100 + 400)
    expect(await btc.balanceOf(user0.address)).eq(200 + 800)

    expect(await bnb.balanceOf(user1.address)).eq(300)
    expect(await btc.balanceOf(user1.address)).eq(600)
    await yieldToken.connect(user1).claim(user1.address)
    expect(await bnb.balanceOf(user1.address)).eq(300 + 600)
    expect(await btc.balanceOf(user1.address)).eq(600 + 1200)
  })
})
