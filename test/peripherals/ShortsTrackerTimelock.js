const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { toUsd } = require("../shared/units")
const { deployContract } = require("../shared/fixtures")

use(solidity)

describe("ShortsTracker", function () {
  const provider = waffle.provider
  const [_, user0, handler, eth, btc] = provider.getWallets()
  let shortsTracker
  let shortsTrackerTimelock
  let vault

  beforeEach(async function () {
    vault = await deployContract("VaultTest", [])
    shortsTracker = await deployContract("ShortsTracker", [vault.address])
    shortsTrackerTimelock = await deployContract("ShortsTrackerTimelock", [300])
    await shortsTracker.setGov(shortsTrackerTimelock.address)
  })

  it("setGov", async () => {
    await expect(shortsTrackerTimelock.connect(user0).setGov(user0.address)).to.be.revertedWith("Governable: forbidden")
    await shortsTrackerTimelock.setGov(user0.address)
    expect(await shortsTrackerTimelock.gov()).to.eq(user0.address)
  })

  it("setHandler", async () => {
    await expect(shortsTrackerTimelock.connect(user0).setHandler(user0.address, true)).to.be.revertedWith("Governable: forbidden")
    expect(await shortsTrackerTimelock.isHandler(user0.address)).to.be.false
    await shortsTrackerTimelock.setHandler(user0.address, true)
    expect(await shortsTrackerTimelock.isHandler(user0.address)).to.be.true
    await shortsTrackerTimelock.setHandler(user0.address, false)
    expect(await shortsTrackerTimelock.isHandler(user0.address)).to.be.false
  })

  it("setUpdateDelay", async () => {
    await expect(shortsTrackerTimelock.connect(user0).setUpdateDelay(60)).to.be.revertedWith("Governable: forbidden")
    expect(await shortsTrackerTimelock.updateDelay()).to.eq(300)
    await shortsTrackerTimelock.setUpdateDelay(60)
    expect(await shortsTrackerTimelock.updateDelay()).to.eq(60)
  })

  it("setMaxAveragePriceChange", async () => {
    await expect(shortsTrackerTimelock.connect(user0).setMaxAveragePriceChange(eth.address, 20)).to.be.revertedWith("Governable: forbidden")
    expect(await shortsTrackerTimelock.maxAveragePriceChange(eth.address)).to.eq(0)
    await shortsTrackerTimelock.setMaxAveragePriceChange(eth.address, 20)
    expect(await shortsTrackerTimelock.maxAveragePriceChange(eth.address)).to.eq(20)
  })

  it("setIsGlobalShortDataReady", async () => {
    await expect(shortsTrackerTimelock.connect(user0).setIsGlobalShortDataReady(shortsTracker.address, true)).to.be.revertedWith("Governable: forbidden")

    expect(await shortsTracker.isGlobalShortDataReady()).to.be.false
    await shortsTrackerTimelock.setIsGlobalShortDataReady(shortsTracker.address, true)
    expect(await shortsTracker.isGlobalShortDataReady()).to.be.true
    await shortsTrackerTimelock.setIsGlobalShortDataReady(shortsTracker.address, false)
    expect(await shortsTracker.isGlobalShortDataReady()).to.be.false
  })

  it("setShortsTrackerGov", async () => {
    await shortsTrackerTimelock.setShortsTrackerGov(shortsTracker.address, user0.address)
    expect(await shortsTracker.gov()).to.eq(user0.address)
  })

  it("setGlobalShortAveragePrices", async () => {
    await shortsTrackerTimelock.setShortsTrackerGov(shortsTracker.address, user0.address)
    expect(await shortsTracker.gov()).to.eq(user0.address)

    await shortsTracker.connect(user0).setInitData([eth.address, btc.address], [toUsd(1600), toUsd(20500)])
    expect(await shortsTracker.globalShortAveragePrices(eth.address)).to.eq(toUsd(1600))

    await shortsTracker.connect(user0).setGov(shortsTrackerTimelock.address)
    expect(await shortsTracker.gov()).to.eq(shortsTrackerTimelock.address)

    await shortsTrackerTimelock.setMaxAveragePriceChange(eth.address, 10)
    expect(await shortsTrackerTimelock.maxAveragePriceChange(eth.address)).to.eq(10)

    await expect(shortsTrackerTimelock.connect(handler).setGlobalShortAveragePrices(shortsTracker.address, [eth.address], [toUsd(1602)]))
      .to.be.revertedWith("ShortsTrackerTimelock: forbidden")

    await shortsTrackerTimelock.setHandler(handler.address, true)
    await expect(shortsTrackerTimelock.connect(handler).setGlobalShortAveragePrices(shortsTracker.address, [eth.address], [toUsd(1602)]))
      .to.be.revertedWith("ShortsTrackerTimelock: too big change")

    await shortsTrackerTimelock.connect(handler).setGlobalShortAveragePrices(shortsTracker.address, [eth.address], [toUsd(1601)])
    expect(await shortsTracker.globalShortAveragePrices(eth.address)).to.eq(toUsd(1601))

    await expect(shortsTrackerTimelock.connect(handler).setGlobalShortAveragePrices(shortsTracker.address, [eth.address], [toUsd(1601)]))
      .to.be.revertedWith("ShortsTrackerTimelock: too early")

    expect(await shortsTrackerTimelock.updateDelay()).to.eq(300)
    await network.provider.send("evm_increaseTime", [290])
    await expect(shortsTrackerTimelock.connect(handler).setGlobalShortAveragePrices(shortsTracker.address, [eth.address], [toUsd(1601)]))
      .to.be.revertedWith("ShortsTrackerTimelock: too early")

    await network.provider.send("evm_increaseTime", [10])
    await shortsTrackerTimelock.connect(handler).setGlobalShortAveragePrices(shortsTracker.address, [eth.address], [toUsd(1602)])
    expect(await shortsTracker.globalShortAveragePrices(eth.address)).to.eq(toUsd(1602))
  })
})
