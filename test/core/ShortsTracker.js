const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { toUsd } = require("../shared/units")
const { deployContract } = require("../shared/fixtures")

use(solidity)

describe("ShortsTracker", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, _, __, eth, btc] = provider.getWallets()
  let shortsTracker
  let vault

  beforeEach(async function () {
    vault = await deployContract("VaultTest", [])
    shortsTracker = await deployContract("ShortsTrackerTest", [vault.address])
    await shortsTracker.setHandler(user0.address, true)
  })

  it("inits", async function () {
    expect(await shortsTracker.gov()).to.eq(wallet.address)
    expect(await shortsTracker.vault()).to.eq(vault.address)
  })

  it("getNextGlobalAveragePrice", async function () {
    // global delta 10000, realised pnl 1000 => 9000
    // global delta 10000, realised pnl -1000 => 11000
    // global delta -10000, realised pnl 1000 => -11000
    // global delta -10000, realised pnl -1000 => -9000
    // global delta 10000, realised pnl 11000 => -1000 (flips sign)
    // global delta -10000, realised pnl -11000 => 1000 (flips sign)

    const cases = [
      [60000, 54000, 1000, "60845070422535211267605633802816901", "8999999999999999999999999999999999"],
      [60000, 54000, -1000, "62608695652173913043478260869565217", "10999999999999999999999999999999999"],
      [60000, 66000, 1000, "58021978021978021978021978021978021", "-11000000000000000000000000000000001"],
      [60000, 66000, -1000, "59325842696629213483146067415730337", "-9000000000000000000000000000000000"],
      [60000, 54000, 11000, "53333333333333333333333333333333333", "-1000000000000000000000000000000000"],
      [60000, 66000, -11000, "66835443037974683544303797468354430", "999999999999999999999999999999999"]
    ]

    const size = toUsd(100000)
    await vault.increaseGlobalShortSize(eth.address, size)
    let i = 0
    for (const [_avgPrice, _nextPrice, _realisedPnl, expectedAvgPrice, expectedDelta] of cases) {
      const avgPrice = toUsd(_avgPrice)
      const nextPrice = toUsd(_nextPrice)
      const realisedPnl = toUsd(_realisedPnl)
      await shortsTracker.connect(user0).setGlobalShortAveragePrice(eth.address, avgPrice)
      const [nextSize, nextAvgPrice] = await shortsTracker.getNextGlobalShortDataWithRealisedPnl(eth.address, nextPrice, toUsd(20000), realisedPnl, false)
      expect(nextAvgPrice, i).to.eq(expectedAvgPrice)

      const delta = nextSize.mul(nextAvgPrice.sub(nextPrice)).div(nextAvgPrice)
      expect(delta, i).to.eq(expectedDelta)
    }
  })

  it("setIsGlobalShortDataReady", async function () {
    expect(await shortsTracker.isGlobalShortDataReady()).to.be.false

    await expect(shortsTracker.connect(user1).setIsGlobalShortDataReady(true)).to.be.revertedWith("Governable: forbidden")

    await shortsTracker.setIsGlobalShortDataReady(true)
    expect(await shortsTracker.isGlobalShortDataReady()).to.be.true

    await shortsTracker.setIsGlobalShortDataReady(false)
    expect(await shortsTracker.isGlobalShortDataReady()).to.be.false
  })

  it("setInitData", async function () {
    await expect(shortsTracker.connect(user1).setInitData([], [])).to.be.revertedWith("Governable: forbidden")

    expect(await shortsTracker.globalShortAveragePrices(eth.address)).to.eq(0)
    expect(await shortsTracker.globalShortAveragePrices(btc.address)).to.eq(0)

    shortsTracker.setInitData([eth.address, btc.address], [100, 200])

    expect(await shortsTracker.globalShortAveragePrices(eth.address)).to.eq(100)
    expect(await shortsTracker.globalShortAveragePrices(btc.address)).to.eq(200)
  })
})
