const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock } = require("../shared/utilities")

use(solidity)

const PRECISION = 1000000

describe("Treasury", function () {
  const provider = waffle.provider
  const [wallet, fund, user0, user1, user2, user3] = provider.getWallets()
  let treasury

  let gmt
  let busd
  let pair
  let router

  let gmtPresalePrice = 4.5 * PRECISION
  let gmtListingPrice = 5 * PRECISION
  let busdSlotCap = expandDecimals(2000, 18)
  let busdHardCap = expandDecimals(900 * 1000, 18)
  let busdBasisPoints = 5000 // 50%
  let unlockTime

  beforeEach(async () => {
    treasury = await deployContract("Treasury", [])
    gmt = await deployContract("GMT", [expandDecimals(1000 * 1000, 18)])
    busd = await deployContract("Token", [])
    pair = await deployContract("Token", [])
    router = await deployContract("PancakeRouter", [pair.address])

    unlockTime = await getBlockTime(provider) + 1000

    await treasury.initialize(
      [
        gmt.address,
        busd.address,
        router.address,
        fund.address
      ],
      [
        gmtPresalePrice,
        gmtListingPrice,
        busdSlotCap,
        busdHardCap,
        busdBasisPoints,
        unlockTime
      ]
    )

    await gmt.beginMigration()

    await gmt.addAdmin(treasury.address)
    await gmt.addMsgSender(treasury.address)
    await gmt.addMsgSender(wallet.address)
  })

  it("initialize", async () => {
    await expect(treasury.initialize(
      [
        gmt.address,
        busd.address,
        router.address,
        fund.address
      ],
      [
        gmtPresalePrice,
        gmtListingPrice,
        busdSlotCap,
        busdHardCap,
        busdBasisPoints,
        unlockTime
      ]
    )).to.be.revertedWith("Treasury: already initialized")

    await expect(treasury.connect(user0).initialize(
      [
        gmt.address,
        busd.address,
        router.address,
        fund.address
      ],
      [
        gmtPresalePrice,
        gmtListingPrice,
        busdSlotCap,
        busdHardCap,
        busdBasisPoints,
        unlockTime
      ]
    )).to.be.revertedWith("Treasury: forbidden")

    expect(await treasury.isInitialized()).eq(true)

    expect(await treasury.gmt()).eq(gmt.address)
    expect(await treasury.busd()).eq(busd.address)
    expect(await treasury.router()).eq(router.address)
    expect(await treasury.fund()).eq(fund.address)

    expect(await treasury.gmtPresalePrice()).eq(gmtPresalePrice)
    expect(await treasury.gmtListingPrice()).eq(gmtListingPrice)
    expect(await treasury.busdSlotCap()).eq(busdSlotCap)
    expect(await treasury.busdHardCap()).eq(busdHardCap)
    expect(await treasury.busdBasisPoints()).eq(busdBasisPoints)
    expect(await treasury.unlockTime()).eq(unlockTime)
  })

  it("setGov", async () => {
    await expect(treasury.connect(user0).setGov(user1.address))
      .to.be.revertedWith("Treasury: forbidden")

    expect(await treasury.gov()).eq(wallet.address)

    await treasury.setGov(user0.address)
    expect(await treasury.gov()).eq(user0.address)

    await treasury.connect(user0).setGov(user1.address)
    expect(await treasury.gov()).eq(user1.address)
  })

  it("setFund", async () => {
    await expect(treasury.connect(user0).setFund(user2.address))
      .to.be.revertedWith("Treasury: forbidden")

    expect(await treasury.fund()).eq(fund.address)
    await treasury.setFund(user2.address)
    expect(await treasury.fund()).eq(user2.address)
  })

  it("extendUnlockTime", async () => {
    await expect(treasury.connect(user0).extendUnlockTime(unlockTime + 100))
      .to.be.revertedWith("Treasury: forbidden")

    await expect(treasury.extendUnlockTime(unlockTime - 100))
      .to.be.revertedWith("Treasury: invalid _unlockTime")

    expect(await treasury.unlockTime()).eq(unlockTime)

    await treasury.extendUnlockTime(unlockTime + 100)
    expect(await treasury.unlockTime()).eq(unlockTime + 100)
  })

  it("addWhitelists", async () => {
    const whitelist = [user0.address, user1.address, user2.address]

    await expect(treasury.connect(user0).addWhitelists(whitelist))
      .to.be.revertedWith("Treasury: forbidden")

    expect(await treasury.swapWhitelist(user0.address)).eq(false)
    expect(await treasury.swapWhitelist(user1.address)).eq(false)
    expect(await treasury.swapWhitelist(user2.address)).eq(false)
    expect(await treasury.swapWhitelist(user3.address)).eq(false)

    await treasury.addWhitelists(whitelist)

    expect(await treasury.swapWhitelist(user0.address)).eq(true)
    expect(await treasury.swapWhitelist(user1.address)).eq(true)
    expect(await treasury.swapWhitelist(user2.address)).eq(true)
    expect(await treasury.swapWhitelist(user3.address)).eq(false)
  })

  it("removeWhitelists", async () => {
    const whitelist = [user0.address, user1.address, user2.address]

    await expect(treasury.connect(user0).removeWhitelists(whitelist))
      .to.be.revertedWith("Treasury: forbidden")

    expect(await treasury.swapWhitelist(user0.address)).eq(false)
    expect(await treasury.swapWhitelist(user1.address)).eq(false)
    expect(await treasury.swapWhitelist(user2.address)).eq(false)
    expect(await treasury.swapWhitelist(user3.address)).eq(false)

    await treasury.addWhitelists(whitelist)

    expect(await treasury.swapWhitelist(user0.address)).eq(true)
    expect(await treasury.swapWhitelist(user1.address)).eq(true)
    expect(await treasury.swapWhitelist(user2.address)).eq(true)
    expect(await treasury.swapWhitelist(user3.address)).eq(false)

    await treasury.removeWhitelists([user0.address, user1.address])

    expect(await treasury.swapWhitelist(user0.address)).eq(false)
    expect(await treasury.swapWhitelist(user1.address)).eq(false)
    expect(await treasury.swapWhitelist(user2.address)).eq(true)
    expect(await treasury.swapWhitelist(user3.address)).eq(false)
  })

  it("updateWhitelist", async () => {
    const whitelist = [user0.address, user1.address, user2.address]

    expect(await treasury.swapWhitelist(user0.address)).eq(false)
    expect(await treasury.swapWhitelist(user1.address)).eq(false)
    expect(await treasury.swapWhitelist(user2.address)).eq(false)
    expect(await treasury.swapWhitelist(user3.address)).eq(false)

    await treasury.addWhitelists(whitelist)

    expect(await treasury.swapWhitelist(user0.address)).eq(true)
    expect(await treasury.swapWhitelist(user1.address)).eq(true)
    expect(await treasury.swapWhitelist(user2.address)).eq(true)
    expect(await treasury.swapWhitelist(user3.address)).eq(false)

    await expect(treasury.connect(user0).updateWhitelist(user0.address, user3.address))
      .to.be.revertedWith("Treasury: forbidden")

    await expect(treasury.updateWhitelist(user3.address, user0.address))
      .to.be.revertedWith("Treasury: invalid prevAccount")

    await treasury.updateWhitelist(user0.address, user3.address)

    expect(await treasury.swapWhitelist(user0.address)).eq(false)
    expect(await treasury.swapWhitelist(user1.address)).eq(true)
    expect(await treasury.swapWhitelist(user2.address)).eq(true)
    expect(await treasury.swapWhitelist(user3.address)).eq(true)
  })

  it("swap", async () => {
    await busd.mint(user0.address, expandDecimals(1000 * 1000, 18))

    const whitelist = [user0.address, user1.address, user2.address]
    await treasury.addWhitelists(whitelist)

    await expect(treasury.connect(user3).swap(2000))
      .to.be.revertedWith("Treasury: forbidden")

    await expect(treasury.connect(user0).swap(0))
      .to.be.revertedWith("Treasury: invalid _busdAmount")

    await expect(treasury.connect(user0).swap(2000))
      .to.be.revertedWith("ERC20: transfer amount exceeds allowance")

    await busd.connect(user0).approve(treasury.address, expandDecimals(1000 * 1000, 18))
    await expect(treasury.connect(user0).swap(2000))
      .to.be.revertedWith("GMT: transfer amount exceeds balance")

    await gmt.transfer(treasury.address, expandDecimals(1000 * 1000, 18))

    expect(await treasury.swapAmounts(user0.address)).eq(0)
    expect(await treasury.busdReceived()).eq(0)
    expect(await busd.balanceOf(treasury.address)).eq(0)
    expect(await busd.balanceOf(user0.address)).eq(expandDecimals(1000 * 1000, 18))
    expect(await gmt.balanceOf(treasury.address)).eq(expandDecimals(1000 * 1000, 18))
    expect(await gmt.balanceOf(user0.address)).eq(0)

    await treasury.connect(user0).swap(2000)

    expect(await treasury.swapAmounts(user0.address)).eq(2000)
    expect(await treasury.busdReceived()).eq(2000)
    expect(await busd.balanceOf(treasury.address)).eq(2000)
    expect(await busd.balanceOf(user0.address)).eq("999999999999999999998000")
    expect(await gmt.balanceOf(treasury.address)).eq("999999999999999999999556")
    expect(await gmt.balanceOf(user0.address)).eq(444)

    await expect(gmt.connect(user0).transfer(user1.address, 100))
      .to.be.revertedWith("GMT: forbidden msg.sender")

    await treasury.connect(user0).swap(1000)

    expect(await treasury.swapAmounts(user0.address)).eq(3000)
    expect(await treasury.busdReceived()).eq(3000)
    expect(await busd.balanceOf(treasury.address)).eq(3000)
    expect(await busd.balanceOf(user0.address)).eq("999999999999999999997000")
    expect(await gmt.balanceOf(treasury.address)).eq("999999999999999999999334")
    expect(await gmt.balanceOf(user0.address)).eq(666)
  })

  it("validates swap.busdSlotCap", async () => {
    await busd.mint(user0.address, expandDecimals(1000 * 1000, 18))

    const whitelist = [user0.address, user1.address, user2.address]
    await treasury.addWhitelists(whitelist)

    await busd.connect(user0).approve(treasury.address, expandDecimals(1000 * 1000, 18))
    await gmt.transfer(treasury.address, expandDecimals(1000 * 1000, 18))

    expect(await treasury.swapAmounts(user0.address)).eq(0)
    expect(await treasury.busdReceived()).eq(0)
    expect(await busd.balanceOf(treasury.address)).eq(0)
    expect(await busd.balanceOf(user0.address)).eq(expandDecimals(1000 * 1000, 18))
    expect(await gmt.balanceOf(treasury.address)).eq(expandDecimals(1000 * 1000, 18))
    expect(await gmt.balanceOf(user0.address)).eq(0)

    await expect(treasury.connect(user0).swap(expandDecimals(2001, 18)))
      .to.be.revertedWith("Treasury: busdSlotCap exceeded")

    await treasury.connect(user0).swap(expandDecimals(1000, 18))

    expect(await treasury.swapAmounts(user0.address)).eq(expandDecimals(1000, 18))
    expect(await treasury.busdReceived()).eq(expandDecimals(1000, 18))
    expect(await busd.balanceOf(treasury.address)).eq(expandDecimals(1000, 18))
    expect(await busd.balanceOf(user0.address)).eq("999000000000000000000000")
    expect(await gmt.balanceOf(treasury.address)).eq("999777777777777777777778")
    expect(await gmt.balanceOf(user0.address)).eq("222222222222222222222")

    await expect(treasury.connect(user0).swap(expandDecimals(1001, 18)))
      .to.be.revertedWith("Treasury: busdSlotCap exceeded")

    await treasury.connect(user0).swap(expandDecimals(1000, 18))

    expect(await treasury.swapAmounts(user0.address)).eq(expandDecimals(2000, 18))
    expect(await treasury.busdReceived()).eq(expandDecimals(2000, 18))
    expect(await busd.balanceOf(treasury.address)).eq(expandDecimals(2000, 18))
    expect(await busd.balanceOf(user0.address)).eq("998000000000000000000000")
    expect(await gmt.balanceOf(treasury.address)).eq("999555555555555555555556")
    expect(await gmt.balanceOf(user0.address)).eq("444444444444444444444")

    await expect(treasury.connect(user0).swap("1"))
      .to.be.revertedWith("Treasury: busdSlotCap exceeded")
  })

  it("validates swap.busdHardCap", async () => {
    await busd.mint(user0.address, expandDecimals(1000 * 1000, 18))

    const whitelist = [user0.address, user1.address, user2.address]
    await treasury.addWhitelists(whitelist)

    await busd.connect(user0).approve(treasury.address, expandDecimals(1000 * 1000, 18))
    await gmt.transfer(treasury.address, expandDecimals(1000 * 1000, 18))

    expect(await treasury.busdReceived()).eq(0)
    await expect(treasury.connect(user0).swap(expandDecimals(901 * 1000, 18)))
      .to.be.revertedWith("Treasury: busdHardCap exceeded")

    await expect(treasury.connect(user0).swap(expandDecimals(900 * 1000, 18)))
      .to.be.revertedWith("Treasury: busdSlotCap exceeded")

    await treasury.connect(user0).swap(expandDecimals(2000, 18))
    expect(await treasury.busdReceived()).eq(expandDecimals(2000, 18))

    await expect(treasury.connect(user0).swap(expandDecimals(899 * 1000, 18)))
      .to.be.revertedWith("Treasury: busdHardCap exceeded")

    await expect(treasury.connect(user0).swap(expandDecimals(898 * 1000, 18)))
      .to.be.revertedWith("Treasury: busdSlotCap exceeded")
  })

  it("validates swap.isSwapActive", async () => {
    await busd.mint(user0.address, expandDecimals(1000 * 1000, 18))

    const whitelist = [user0.address, user1.address, user2.address]
    await treasury.addWhitelists(whitelist)

    await busd.connect(user0).approve(treasury.address, expandDecimals(1000 * 1000, 18))
    await gmt.transfer(treasury.address, expandDecimals(1000 * 1000, 18))

    await treasury.connect(user0).swap(expandDecimals(1000, 18))
    await treasury.endSwap()

    await expect(treasury.connect(user0).swap(expandDecimals(1000, 18)))
      .to.be.revertedWith("Treasury: swap is no longer active")
  })

  it("addLiquidity", async () => {
    await busd.mint(user0.address, expandDecimals(1000 * 1000, 18))

    const whitelist = [user0.address, user1.address, user2.address]
    await treasury.addWhitelists(whitelist)

    await busd.connect(user0).approve(treasury.address, expandDecimals(1000 * 1000, 18))
    await gmt.transfer(treasury.address, expandDecimals(1000 * 1000, 18))

    await treasury.connect(user0).swap(expandDecimals(1000, 18))
    await treasury.endSwap()

    await treasury.increaseBusdBasisPoints(7500)

    await expect(treasury.connect(user0).addLiquidity())
      .to.be.revertedWith("Treasury: forbidden")

    expect(await treasury.isLiquidityAdded()).eq(false)
    expect(await busd.balanceOf(treasury.address)).eq(expandDecimals(1000, 18))
    expect(await busd.balanceOf(pair.address)).eq(0)
    expect(await busd.balanceOf(fund.address)).eq(0)
    expect(await gmt.balanceOf(pair.address)).eq(0)
    expect(await gmt.balanceOf(fund.address)).eq(0)

    await treasury.addLiquidity()

    expect(await treasury.isLiquidityAdded()).eq(true)
    expect(await busd.balanceOf(treasury.address)).eq(0)
    expect(await busd.balanceOf(pair.address)).eq(expandDecimals(750, 18))
    expect(await busd.balanceOf(fund.address)).eq(expandDecimals(250, 18))
    expect(await gmt.balanceOf(pair.address)).eq(expandDecimals(150, 18)) // ~150, 750 / 5
    expect(await gmt.balanceOf(fund.address)).eq(0)

    await expect(treasury.addLiquidity())
      .to.be.revertedWith("Treasury: liquidity already added")
  })

  it("withdrawToken", async () => {
    await expect(treasury.connect(user0).withdrawToken(busd.address, user1.address, 1000))
      .to.be.revertedWith("Treasury: forbidden")

    await expect(treasury.withdrawToken(busd.address, user1.address, 1000))
      .to.be.revertedWith("Treasury: unlockTime not yet passed")

    await increaseTime(provider, 2000)
    await mineBlock(provider)

    await busd.mint(wallet.address, 1000)
    await busd.transfer(treasury.address, 1000)

    expect(await busd.balanceOf(user1.address)).eq(0)
    await treasury.withdrawToken(busd.address, user1.address, 1000)
    expect(await busd.balanceOf(user1.address)).eq(1000)
  })

  it("increaseBusdBasisPoints", async () => {
    await expect(treasury.connect(user0).increaseBusdBasisPoints(4000))
      .to.be.revertedWith("Treasury: forbidden")

    await expect(treasury.increaseBusdBasisPoints(4000))
      .to.be.revertedWith("Treasury: invalid _busdBasisPoints")

    expect(await treasury.busdBasisPoints()).eq(5000)
    await treasury.increaseBusdBasisPoints(5001)
    expect(await treasury.busdBasisPoints()).eq(5001)
  })

  it("endSwap", async () => {
    await expect(treasury.connect(user0).endSwap())
      .to.be.revertedWith("Treasury: forbidden")

    expect(await treasury.isSwapActive()).eq(true)
    await treasury.endSwap()
    expect(await treasury.isSwapActive()).eq(false)
  })
})
