const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { toUsd } = require("../shared/units")
const { deployContract } = require("../shared/fixtures")

use(solidity)

describe("ShortsTracker", function () {
  const provider = waffle.provider
  const [deployer, user0, user1, user2, handler, eth, btc] = provider.getWallets()
  let shortsTracker
  let shortsTrackerTimelock
  let vault

  beforeEach(async function () {
    vault = await deployContract("VaultTest", [])
    shortsTracker = await deployContract("ShortsTracker", [vault.address])
    shortsTrackerTimelock = await deployContract("ShortsTrackerTimelock", [deployer.address, 60, 300, 0])
    await shortsTracker.setGov(shortsTrackerTimelock.address)
  })

  it("inits", async function () {
    expect(await shortsTrackerTimelock.admin()).to.eq(deployer.address)
    expect(await shortsTrackerTimelock.buffer()).to.eq(60)
    expect(await shortsTrackerTimelock.averagePriceUpdateDelay()).to.eq(300)
  })

  it("setBuffer", async () => {
    expect(await shortsTrackerTimelock.buffer()).to.eq(60)
    await expect(shortsTrackerTimelock.connect(user0).setBuffer(50)).to.be.revertedWith("ShortsTrackerTimelock: admin forbidden")
    await expect(shortsTrackerTimelock.setBuffer(50)).to.be.revertedWith("ShortsTrackerTimelock: buffer cannot be decreased")
    await expect(shortsTrackerTimelock.setBuffer(86400 * 5 + 1)).to.be.revertedWith("ShortsTrackerTimelock: invalid buffer")

    await shortsTrackerTimelock.setBuffer(120)
    expect(await shortsTrackerTimelock.buffer()).to.eq(120)
  })

  it("setAdmin", async () => {
    await expect(shortsTrackerTimelock.connect(user0).signalSetAdmin(user0.address)).to.be.revertedWith("ShortsTrackerTimelock: admin forbidden")
    await expect(shortsTrackerTimelock.connect(user0).setAdmin(user0.address)).to.be.revertedWith("ShortsTrackerTimelock: admin forbidden")

    await expect(shortsTrackerTimelock.setAdmin(user0.address)).to.be.revertedWith("ShortsTrackerTimelock: action not signalled")

    await expect(shortsTrackerTimelock.signalSetAdmin(ethers.constants.AddressZero)).to.be.revertedWith("ShortsTrackerTimelock: invalid admin")
    await shortsTrackerTimelock.signalSetAdmin(user0.address)
    await expect(shortsTrackerTimelock.setAdmin(user0.address)).to.be.revertedWith("ShortsTrackerTimelock: action time not yet passed")

    await network.provider.send("evm_increaseTime", [58])
    await expect(shortsTrackerTimelock.setAdmin(user0.address)).to.be.revertedWith("ShortsTrackerTimelock: action time not yet passed")

    await network.provider.send("evm_increaseTime", [1])
    expect(await shortsTrackerTimelock.admin()).to.eq(deployer.address)
    await shortsTrackerTimelock.setAdmin(user0.address)
    expect(await shortsTrackerTimelock.admin()).to.eq(user0.address)
  })

  it("setContractHandler", async () => {
    await expect(shortsTrackerTimelock.connect(user0).setContractHandler(user0.address, true)).to.be.revertedWith("ShortsTrackerTimelock: admin forbidden")

    expect(await shortsTrackerTimelock.isHandler(user0.address)).to.be.false
    await shortsTrackerTimelock.setContractHandler(user0.address, true)
    expect(await shortsTrackerTimelock.isHandler(user0.address)).to.be.true

    await shortsTrackerTimelock.setContractHandler(user0.address, false)
    expect(await shortsTrackerTimelock.isHandler(user0.address)).to.be.false
  })

  it("setGov", async () => {
    await expect(shortsTrackerTimelock.connect(user0).signalSetGov(shortsTracker.address, user0.address)).to.be.revertedWith("ShortsTrackerTimelock: admin forbidden")
    await expect(shortsTrackerTimelock.connect(user0).setGov(shortsTracker.address, user0.address)).to.be.revertedWith("ShortsTrackerTimelock: admin forbidden")

    await expect(shortsTrackerTimelock.setGov(shortsTracker.address, user0.address)).to.be.revertedWith("ShortsTrackerTimelock: action not signalled")

    await expect(shortsTrackerTimelock.signalSetGov(shortsTracker.address, ethers.constants.AddressZero)).to.be.revertedWith("ShortsTrackerTimelock: invalid gov")
    await shortsTrackerTimelock.signalSetGov(shortsTracker.address, user0.address)
    await expect(shortsTrackerTimelock.setGov(shortsTracker.address, user0.address)).to.be.revertedWith("ShortsTrackerTimelock: action time not yet passed")

    await network.provider.send("evm_increaseTime", [58])
    await expect(shortsTrackerTimelock.setGov(shortsTracker.address, user0.address)).to.be.revertedWith("ShortsTrackerTimelock: action time not yet passed")

    await network.provider.send("evm_increaseTime", [1])
    expect(await shortsTracker.gov()).to.eq(shortsTrackerTimelock.address)
    await shortsTrackerTimelock.setGov(shortsTracker.address, user0.address)
    expect(await shortsTracker.gov()).to.eq(user0.address)
  })

  it("setAveragePriceUpdateDelay", async () => {
    await expect(shortsTrackerTimelock.connect(user0).signalSetAveragePriceUpdateDelay(60)).to.be.revertedWith("ShortsTrackerTimelock: admin forbidden")
    await expect(shortsTrackerTimelock.connect(user0).setAveragePriceUpdateDelay(60)).to.be.revertedWith("ShortsTrackerTimelock: admin forbidden")

    await expect(shortsTrackerTimelock.setAveragePriceUpdateDelay(60)).to.be.revertedWith("ShortsTrackerTimelock: action not signalled")

    await shortsTrackerTimelock.signalSetAveragePriceUpdateDelay(60)
    await expect(shortsTrackerTimelock.setAveragePriceUpdateDelay(60)).to.be.revertedWith("ShortsTrackerTimelock: action time not yet passed")

    await network.provider.send("evm_increaseTime", [58])
    await expect(shortsTrackerTimelock.setAveragePriceUpdateDelay(60)).to.be.revertedWith("ShortsTrackerTimelock: action time not yet passed")

    await network.provider.send("evm_increaseTime", [1])
    expect(await shortsTrackerTimelock.averagePriceUpdateDelay()).to.eq(300)
    await shortsTrackerTimelock.setAveragePriceUpdateDelay(60)
    expect(await shortsTrackerTimelock.averagePriceUpdateDelay()).to.eq(60)
  })

  it("setMaxAveragePriceChange", async () => {
    await expect(shortsTrackerTimelock.connect(user0).signalSetMaxAveragePriceChange(10)).to.be.revertedWith("ShortsTrackerTimelock: admin forbidden")
    await expect(shortsTrackerTimelock.connect(user0).setMaxAveragePriceChange(10)).to.be.revertedWith("ShortsTrackerTimelock: admin forbidden")

    await expect(shortsTrackerTimelock.setMaxAveragePriceChange(10)).to.be.revertedWith("ShortsTrackerTimelock: action not signalled")

    await shortsTrackerTimelock.signalSetMaxAveragePriceChange(10)
    await expect(shortsTrackerTimelock.setMaxAveragePriceChange(10)).to.be.revertedWith("ShortsTrackerTimelock: action time not yet passed")

    await network.provider.send("evm_increaseTime", [58])
    await expect(shortsTrackerTimelock.setMaxAveragePriceChange(10)).to.be.revertedWith("ShortsTrackerTimelock: action time not yet passed")

    await network.provider.send("evm_increaseTime", [1])
    expect(await shortsTrackerTimelock.maxAveragePriceChange()).to.eq(0)
    await shortsTrackerTimelock.setMaxAveragePriceChange(10)
    expect(await shortsTrackerTimelock.maxAveragePriceChange()).to.eq(10)
  })

  it("setIsGlobalShortDataReady", async () => {
    await expect(shortsTrackerTimelock.connect(user0).signalSetIsGlobalShortDataReady(shortsTracker.address, true)).to.be.revertedWith("ShortsTrackerTimelock: admin forbidden")
    await expect(shortsTrackerTimelock.connect(user0).setIsGlobalShortDataReady(shortsTracker.address, true)).to.be.revertedWith("ShortsTrackerTimelock: admin forbidden")

    await expect(shortsTrackerTimelock.setIsGlobalShortDataReady(shortsTracker.address, true)).to.be.revertedWith("ShortsTrackerTimelock: action not signalled")

    await shortsTrackerTimelock.signalSetIsGlobalShortDataReady(shortsTracker.address, true)
    await expect(shortsTrackerTimelock.setIsGlobalShortDataReady(shortsTracker.address, true)).to.be.revertedWith("ShortsTrackerTimelock: action time not yet passed")

    await network.provider.send("evm_increaseTime", [58])
    await expect(shortsTrackerTimelock.setIsGlobalShortDataReady(shortsTracker.address, true)).to.be.revertedWith("ShortsTrackerTimelock: action time not yet passed")

    await network.provider.send("evm_increaseTime", [1])
    expect(await shortsTracker.isGlobalShortDataReady()).to.be.false
    await shortsTrackerTimelock.setIsGlobalShortDataReady(shortsTracker.address, true)
    expect(await shortsTracker.isGlobalShortDataReady()).to.be.true
  })

  it("disableIsGlobalShortDataReady", async () => {
    await shortsTrackerTimelock.signalSetGov(shortsTracker.address, user0.address)
    await network.provider.send("evm_increaseTime", [61])
    await shortsTrackerTimelock.setGov(shortsTracker.address, user0.address)
    expect(await shortsTracker.gov()).to.eq(user0.address)

    await shortsTracker.connect(user0).setInitData([eth.address, btc.address], [toUsd(1600), toUsd(20500)])
    await shortsTracker.connect(user0).setGov(shortsTrackerTimelock.address)

    expect(await shortsTracker.isGlobalShortDataReady()).to.be.true
    await shortsTrackerTimelock.disableIsGlobalShortDataReady(shortsTracker.address)
    expect(await shortsTracker.isGlobalShortDataReady()).to.be.false
  })

  it("setGlobalShortAveragePrices", async () => {
    await shortsTrackerTimelock.signalSetGov(shortsTracker.address, user0.address)
    await network.provider.send("evm_increaseTime", [61])
    await shortsTrackerTimelock.setGov(shortsTracker.address, user0.address)
    expect(await shortsTracker.gov()).to.eq(user0.address)

    await shortsTracker.connect(user0).setInitData([eth.address, btc.address], [toUsd(1600), toUsd(20500)])
    expect(await shortsTracker.globalShortAveragePrices(eth.address)).to.eq(toUsd(1600))

    await shortsTracker.connect(user0).setGov(shortsTrackerTimelock.address)
    expect(await shortsTracker.gov()).to.eq(shortsTrackerTimelock.address)

    await shortsTrackerTimelock.signalSetMaxAveragePriceChange(10)
    await network.provider.send("evm_increaseTime", [61])
    await shortsTrackerTimelock.setMaxAveragePriceChange(10)
    expect(await shortsTrackerTimelock.maxAveragePriceChange()).to.eq(10)

    await expect(shortsTrackerTimelock.connect(handler).setGlobalShortAveragePrices(shortsTracker.address, [eth.address], [toUsd(1602)]))
      .to.be.revertedWith("ShortsTrackerTimelock: handler forbidden")

    await shortsTrackerTimelock.setContractHandler(handler.address, true)
    await expect(shortsTrackerTimelock.connect(handler).setGlobalShortAveragePrices(shortsTracker.address, [eth.address], [toUsd(1602)]))
      .to.be.revertedWith("ShortsTrackerTimelock: too big change")

    await shortsTrackerTimelock.connect(handler).setGlobalShortAveragePrices(shortsTracker.address, [eth.address], [toUsd(1601)])
    expect(await shortsTracker.globalShortAveragePrices(eth.address)).to.eq(toUsd(1601))

    await expect(shortsTrackerTimelock.connect(handler).setGlobalShortAveragePrices(shortsTracker.address, [eth.address], [toUsd(1601)]))
      .to.be.revertedWith("ShortsTrackerTimelock: too early")

    expect(await shortsTrackerTimelock.averagePriceUpdateDelay()).to.eq(300)
    await network.provider.send("evm_increaseTime", [290])
    await expect(shortsTrackerTimelock.connect(handler).setGlobalShortAveragePrices(shortsTracker.address, [eth.address], [toUsd(1601)]))
      .to.be.revertedWith("ShortsTrackerTimelock: too early")

    await network.provider.send("evm_increaseTime", [10])
    await shortsTrackerTimelock.connect(handler).setGlobalShortAveragePrices(shortsTracker.address, [eth.address], [toUsd(1602)])
    expect(await shortsTracker.globalShortAveragePrices(eth.address)).to.eq(toUsd(1602))
  })

  it("setHandler", async () => {
    await expect(shortsTrackerTimelock.connect(user0).setHandler(shortsTracker.address, user1.address, true))
      .to.be.revertedWith("ShortsTrackerTimelock: admin forbidden")

    await expect(shortsTrackerTimelock.connect(deployer).setHandler(shortsTracker.address, user1.address, true))
      .to.be.revertedWith("ShortsTrackerTimelock: action not signalled")

    await expect(shortsTrackerTimelock.connect(user0).signalSetHandler(shortsTracker.address, user1.address, true))
      .to.be.revertedWith("ShortsTrackerTimelock: admin forbidden")

    await shortsTrackerTimelock.connect(deployer).signalSetHandler(shortsTracker.address, user1.address, true)

    await expect(shortsTrackerTimelock.connect(deployer).setHandler(shortsTracker.address, user1.address, true))
      .to.be.revertedWith("ShortsTrackerTimelock: action time not yet passed")

    await network.provider.send("evm_increaseTime", [50])

    await expect(shortsTrackerTimelock.connect(deployer).setHandler(shortsTracker.address, user1.address, true))
      .to.be.revertedWith("ShortsTrackerTimelock: action time not yet passed")

    await network.provider.send("evm_increaseTime", [10])

    await expect(shortsTrackerTimelock.connect(deployer).setHandler(btc.address, user1.address, true))
      .to.be.revertedWith("ShortsTrackerTimelock: action not signalled")

    await expect(shortsTrackerTimelock.connect(deployer).setHandler(shortsTracker.address, user2.address, true))
      .to.be.revertedWith("ShortsTrackerTimelock: action not signalled")

    await expect(shortsTrackerTimelock.connect(deployer).setHandler(shortsTracker.address, user1.address, false))
      .to.be.revertedWith("ShortsTrackerTimelock: action not signalled")

    expect(await shortsTracker.isHandler(user1.address)).eq(false)
    await shortsTrackerTimelock.connect(deployer).setHandler(shortsTracker.address, user1.address, true)
    expect(await shortsTracker.isHandler(user1.address)).eq(true)

    await expect(shortsTrackerTimelock.connect(deployer).setHandler(shortsTracker.address, user1.address, true))
      .to.be.revertedWith("ShortsTrackerTimelock: action not signalled")

    await shortsTrackerTimelock.connect(deployer).signalSetHandler(shortsTracker.address, user1.address, true)

    const action0 = ethers.utils.solidityKeccak256(["string", "address", "address", "bool"], ["setHandler", btc.address, user1.address, true])
    const action1 = ethers.utils.solidityKeccak256(["string", "address", "address", "bool"], ["setHandler", shortsTracker.address, user1.address, true])

    await expect(shortsTrackerTimelock.connect(user0).cancelAction(action0))
      .to.be.revertedWith("ShortsTrackerTimelock: admin forbidden")

    await expect(shortsTrackerTimelock.connect(deployer).cancelAction(action0))
      .to.be.revertedWith("ShortsTrackerTimelock: invalid _action")

    await shortsTrackerTimelock.connect(deployer).cancelAction(action1)

    await expect(shortsTrackerTimelock.connect(deployer).setHandler(shortsTracker.address, user1.address, true))
      .to.be.revertedWith("ShortsTrackerTimelock: action not signalled")
  })
})
