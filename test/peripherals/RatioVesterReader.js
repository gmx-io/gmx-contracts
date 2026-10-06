const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, increaseTime, mineBlock } = require("../shared/utilities")

use(solidity)

const { AddressZero } = ethers.constants
const secondsPerYear = 365 * 24 * 60 * 60
const PAIR_PRECISION = expandDecimals(1, 30)

describe("RatioVesterReader", function () {
  const provider = waffle.provider
  const [wallet, user0, capsAdmin, distributor] = provider.getWallets()
  let esGmx, gmx, pair
  let issuer, vester, reader

  beforeEach(async () => {
    esGmx = await deployContract("EsGMX", [])
    gmx = await deployContract("Token", [])
    pair = await deployContract("Token", [])

    issuer = await deployContract("EsGmxIssuer", [esGmx.address])
    vester = await deployContract("RatioVester", [
      "Vested GMX S1", "vGMX-S1", secondsPerYear, esGmx.address, pair.address, gmx.address,
      issuer.address, PAIR_PRECISION.mul(5), false
    ])
    reader = await deployContract("RatioVesterReader", [])

    await esGmx.setMinter(wallet.address, true)
    await esGmx.setMinter(vester.address, true)
    await issuer.setCapsAdmin(capsAdmin.address)
    await issuer.connect(capsAdmin).setDistributor(distributor.address, true)
    await issuer.setVester(vester.address)
    await vester.confirmIssuerBinding()

    await esGmx.mint(issuer.address, expandDecimals(10000, 18))
    await gmx.mint(vester.address, expandDecimals(10000, 18))
  })

  const issueAndDeposit = async (amount, batch) => {
    await issuer.connect(distributor).distributeEpoch(1, batch, [user0.address], [amount])
    await issuer.connect(user0).claim()
    await esGmx.connect(user0).approve(vester.address, amount)
    const pairAmount = amount.mul(5)
    await pair.mint(user0.address, pairAmount)
    await pair.connect(user0).approve(vester.address, pairAmount)
    await vester.connect(user0).deposit(amount)
  }

  it("returns the vesting summary per vester", async () => {
    await issueAndDeposit(expandDecimals(100, 18), 0)

    await increaseTime(provider, 73 * 24 * 60 * 60)
    await mineBlock(provider)

    const info = await reader.getVestingInfo([vester.address], user0.address)
    expect(info.length).eq(12)
    expect(info[0]).eq(expandDecimals(100, 18))
    expect(info[1]).eq(expandDecimals(500, 18))
    expect(info[2]).gt(expandDecimals(19, 18))
    expect(info[2]).lt(expandDecimals(21, 18))
    expect(info[7]).eq(expandDecimals(100, 18))
    expect(info[8]).eq(1)
    expect(info[9]).eq(secondsPerYear)
    expect(info[10]).eq(0)
    expect(info[11]).eq(PAIR_PRECISION.mul(5))
  })

  it("returns live tranches and drops them after withdrawal", async () => {
    await issueAndDeposit(expandDecimals(100, 18), 0)
    await increaseTime(provider, 8 * 24 * 60 * 60)
    await mineBlock(provider)
    await issueAndDeposit(expandDecimals(50, 18), 1)

    let result = await reader.getTranches(vester.address, user0.address)
    expect(result.startTimes.length).eq(2)
    expect(result.totalAmounts[0]).eq(expandDecimals(100, 18))
    expect(result.totalAmounts[1]).eq(expandDecimals(50, 18))
    expect(result.startTimes[1]).gt(result.startTimes[0])

    await vester.connect(user0).withdraw()
    result = await reader.getTranches(vester.address, user0.address)
    expect(result.startTimes.length).eq(0)
  })

  it("returns issuer info", async () => {
    await issuer.connect(distributor).distributeEpoch(1, 0, [user0.address], [expandDecimals(300, 18)])

    let info = await reader.getIssuerInfo(issuer.address, user0.address)
    expect(info[0]).eq(expandDecimals(300, 18))
    expect(info[1]).eq(0)
    expect(info[2]).eq(expandDecimals(300, 18))
    expect(info[3]).eq(expandDecimals(300, 18))
    expect(info[4]).eq(0)

    await issuer.connect(user0).claim()
    info = await reader.getIssuerInfo(issuer.address, user0.address)
    expect(info[1]).eq(expandDecimals(300, 18))
    expect(info[2]).eq(0)
    expect(info[4]).eq(expandDecimals(300, 18))
  })
})
