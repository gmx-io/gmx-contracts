const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, bigNumberify, getBlockTime, increaseTime,
  mineBlock, reportGasUsed, newWallet, getPriceBitArray } = require("../shared/utilities")
const { toChainlinkPrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")

use(solidity)

function getExpandedPrice(price) {
  return bigNumberify(price).mul(expandDecimals(1, 30)).div(expandDecimals(1, 3))
}

describe("FastPriceFeed", function () {
  const provider = waffle.provider
  const { AddressZero } = ethers.constants

  const [wallet, rewardRouter, user0, user1, user2, user3, signer0, signer1] = provider.getWallets()
  let bnb
  let btc
  let eth
  let fastPriceFeed

  beforeEach(async () => {
    bnb = await deployContract("Token", [])
    btc = await deployContract("Token", [])
    eth = await deployContract("Token", [])
    fastPriceFeed = await deployContract("FastPriceFeed", [5 * 60, 250])
    await fastPriceFeed.initialize(2, [signer0.address, signer1.address])
  })

  it("inits", async () => {
    expect(await fastPriceFeed.gov()).eq(wallet.address)
    expect(await fastPriceFeed.priceDuration()).eq(5 * 60)
    expect(await fastPriceFeed.minAuthorizations()).eq(2)
    expect(await fastPriceFeed.isSigner(wallet.address)).eq(false)
    expect(await fastPriceFeed.isSigner(signer0.address)).eq(true)
    expect(await fastPriceFeed.isSigner(signer1.address)).eq(true)

    await expect(fastPriceFeed.initialize(2, [signer0.address, signer1.address]))
      .to.be.revertedWith("FastPriceFeed: already initialized")
  })

  it("setPriceDuration", async () => {
    await expect(fastPriceFeed.connect(user0).setVolBasisPoints(20))
      .to.be.revertedWith("Governable: forbidden")

    await fastPriceFeed.setGov(user0.address)

    expect(await fastPriceFeed.volBasisPoints()).eq(0)
    await fastPriceFeed.connect(user0).setVolBasisPoints(20)
    expect(await fastPriceFeed.volBasisPoints()).eq(20)
  })

  it("setPriceDuration", async () => {
    await expect(fastPriceFeed.connect(user0).setPriceDuration(30 * 60))
      .to.be.revertedWith("Governable: forbidden")

    await fastPriceFeed.setGov(user0.address)

    await expect(fastPriceFeed.connect(user0).setPriceDuration(31 * 60))
      .to.be.revertedWith("FastPriceFeed: invalid _priceDuration")

    expect(await fastPriceFeed.priceDuration()).eq(5 * 60)
    await fastPriceFeed.connect(user0).setPriceDuration(30 * 60)
    expect(await fastPriceFeed.priceDuration()).eq(30 * 60)
  })

  it("setIsSpreadEnabled", async () => {
    await expect(fastPriceFeed.connect(user0).setIsSpreadEnabled(true))
      .to.be.revertedWith("Governable: forbidden")

    await fastPriceFeed.setGov(user0.address)

    expect(await fastPriceFeed.isSpreadEnabled()).eq(false)
    expect(await fastPriceFeed.favorFastPrice()).eq(true)
    await fastPriceFeed.connect(user0).setIsSpreadEnabled(true)
    expect(await fastPriceFeed.isSpreadEnabled()).eq(true)
    expect(await fastPriceFeed.favorFastPrice()).eq(false)
  })

  it("setPrices", async () => {
    await expect(fastPriceFeed.connect(user0).setPrices([btc.address, eth.address, bnb.address], [expandDecimals(60000, 30), expandDecimals(5000, 30), expandDecimals(700, 30)]))
      .to.be.revertedWith("Governable: forbidden")

    await fastPriceFeed.setGov(user0.address)

    expect(await fastPriceFeed.lastUpdatedAt()).eq(0)
    await fastPriceFeed.connect(user0).setPrices([btc.address, eth.address, bnb.address], [expandDecimals(60000, 30), expandDecimals(5000, 30), expandDecimals(700, 30)])

    const blockTime = await getBlockTime(provider)

    expect(await fastPriceFeed.prices(btc.address)).eq(expandDecimals(60000, 30))
    expect(await fastPriceFeed.prices(eth.address)).eq(expandDecimals(5000, 30))
    expect(await fastPriceFeed.prices(bnb.address)).eq(expandDecimals(700, 30))

    expect(await fastPriceFeed.lastUpdatedAt()).eq(blockTime)
  })

  it("favorFastPrice", async () => {
    await expect(fastPriceFeed.connect(user0).disableFastPrice())
      .to.be.revertedWith("FastPriceFeed: forbidden")
    await expect(fastPriceFeed.connect(user1).disableFastPrice())
      .to.be.revertedWith("FastPriceFeed: forbidden")

    expect(await fastPriceFeed.favorFastPrice()).eq(true)
    expect(await fastPriceFeed.disableFastPriceVotes(signer0.address)).eq(false)
    expect(await fastPriceFeed.disableFastPriceVoteCount()).eq(0)

    await fastPriceFeed.connect(signer0).disableFastPrice()

    expect(await fastPriceFeed.favorFastPrice()).eq(true)
    expect(await fastPriceFeed.disableFastPriceVotes(signer0.address)).eq(true)
    expect(await fastPriceFeed.disableFastPriceVoteCount()).eq(1)

    await expect(fastPriceFeed.connect(signer0).disableFastPrice())
      .to.be.revertedWith("FastPriceFeed: already voted")

    expect(await fastPriceFeed.favorFastPrice()).eq(true)
    expect(await fastPriceFeed.disableFastPriceVotes(signer1.address)).eq(false)
    expect(await fastPriceFeed.disableFastPriceVoteCount()).eq(1)

    await fastPriceFeed.connect(signer1).disableFastPrice()

    expect(await fastPriceFeed.favorFastPrice()).eq(false)
    expect(await fastPriceFeed.disableFastPriceVotes(signer1.address)).eq(true)
    expect(await fastPriceFeed.disableFastPriceVoteCount()).eq(2)

    await fastPriceFeed.connect(signer1).enableFastPrice()

    expect(await fastPriceFeed.favorFastPrice()).eq(true)
    expect(await fastPriceFeed.disableFastPriceVotes(signer1.address)).eq(false)
    expect(await fastPriceFeed.disableFastPriceVoteCount()).eq(1)

    await expect(fastPriceFeed.connect(signer1).enableFastPrice())
      .to.be.revertedWith("FastPriceFeed: already enabled")
  })

  it("getPrice", async () => {
    expect(await fastPriceFeed.getPrice(bnb.address, 800, true)).eq(800)
    await fastPriceFeed.setPrices([bnb.address], [801])
    expect(await fastPriceFeed.getPrice(bnb.address, 800, true)).eq(801)
    await fastPriceFeed.setPrices([bnb.address], [900])
    expect(await fastPriceFeed.getPrice(bnb.address, 800, true)).eq(820)
    expect(await fastPriceFeed.getPrice(bnb.address, 800, false)).eq(800)
    await fastPriceFeed.setPrices([bnb.address], [700])
    expect(await fastPriceFeed.getPrice(bnb.address, 800, true)).eq(800)
    expect(await fastPriceFeed.getPrice(bnb.address, 800, false)).eq(780)

    await fastPriceFeed.setPrices([bnb.address], [900])

    await increaseTime(provider, 200)
    await mineBlock(provider)

    expect(await fastPriceFeed.getPrice(bnb.address, 800, true)).eq(820)

    await increaseTime(provider, 110)
    await mineBlock(provider)

    expect(await fastPriceFeed.getPrice(bnb.address, 800, true)).eq(800)

    await fastPriceFeed.setPrices([bnb.address], [810])
    expect(await fastPriceFeed.getPrice(bnb.address, 800, true)).eq(810)
    expect(await fastPriceFeed.getPrice(bnb.address, 800, false)).eq(810)

    await fastPriceFeed.setPrices([bnb.address], [790])
    expect(await fastPriceFeed.getPrice(bnb.address, 800, true)).eq(790)
    expect(await fastPriceFeed.getPrice(bnb.address, 800, false)).eq(790)

    await fastPriceFeed.setVolBasisPoints(20)

    await fastPriceFeed.setPrices([bnb.address], [810])
    expect(await fastPriceFeed.getPrice(bnb.address, 800, true)).eq(810)
    expect(await fastPriceFeed.getPrice(bnb.address, 800, false)).eq(808) // 810 * (100 - 0.2)%

    await fastPriceFeed.setPrices([bnb.address], [790])
    expect(await fastPriceFeed.getPrice(bnb.address, 800, true)).eq(791) // 790 * (100 + 0.2)%
    expect(await fastPriceFeed.getPrice(bnb.address, 800, false)).eq(790)

    await fastPriceFeed.connect(signer0).disableFastPrice()
    await fastPriceFeed.connect(signer1).disableFastPrice()

    await fastPriceFeed.setPrices([bnb.address], [810])
    expect(await fastPriceFeed.getPrice(bnb.address, 800, true)).eq(810)
    expect(await fastPriceFeed.getPrice(bnb.address, 800, false)).eq(800)

    await fastPriceFeed.setPrices([bnb.address], [790])
    expect(await fastPriceFeed.getPrice(bnb.address, 800, true)).eq(800)
    expect(await fastPriceFeed.getPrice(bnb.address, 800, false)).eq(790)
  })

  it("setTokens", async () => {
    const token1 = await deployContract("Token", [])
    const token2 = await deployContract("Token", [])

    await expect(fastPriceFeed.connect(user0).setTokens([token1.address, token2.address]))
      .to.be.revertedWith("Governable: forbidden")

    await fastPriceFeed.setGov(user0.address)

    await fastPriceFeed.connect(user0).setTokens([token1.address, token2.address])

    expect(await fastPriceFeed.tokens(0)).eq(token1.address)
    expect(await fastPriceFeed.tokens(1)).eq(token2.address)
  })

  it("setCompactedPrices", async () => {
    const price1 = "2009991111"
    const price2 = "1004445555"
    const price3 = "123"
    const price4 = "4567"
    const price5 = "891011"
    const price6 = "1213141516"
    const price7 = "234"
    const price8 = "5678"
    const price9 = "910910"
    const price10 = "10"

    const token1 = await deployContract("Token", [])
    const token2 = await deployContract("Token", [])
    const token3 = await deployContract("Token", [])
    const token4 = await deployContract("Token", [])
    const token5 = await deployContract("Token", [])
    const token6 = await deployContract("Token", [])
    const token7 = await deployContract("Token", [])
    const token8 = await deployContract("Token", [])
    const token9 = await deployContract("Token", [])
    const token10 = await deployContract("Token", [])

    await fastPriceFeed.connect(wallet).setTokens([token1.address, token2.address])

    let priceBitArray = getPriceBitArray([price1, price2])

    expect(priceBitArray.length).eq(1)

    await expect(fastPriceFeed.connect(user0).setCompactedPrices(priceBitArray))
      .to.be.revertedWith("Governable: forbidden")

    await fastPriceFeed.setGov(user0.address)

    expect(await fastPriceFeed.lastUpdatedAt()).eq(0)

    await fastPriceFeed.connect(user0).setCompactedPrices(priceBitArray)
    const blockTime = await getBlockTime(provider)

    expect(await fastPriceFeed.prices(token1.address)).eq(getExpandedPrice(price1))
    expect(await fastPriceFeed.prices(token2.address)).eq(getExpandedPrice(price2))

    expect(await fastPriceFeed.lastUpdatedAt()).eq(blockTime)

    await fastPriceFeed.connect(user0).setTokens([
      token1.address, token2.address, token3.address, token4.address,
      token5.address, token6.address, token7.address])

    priceBitArray = getPriceBitArray([
      price1, price2, price3, price4,
      price5, price6, price7])

    expect(priceBitArray.length).eq(1)

    await fastPriceFeed.connect(user0).setCompactedPrices(priceBitArray)

    const p1 = await fastPriceFeed.prices(token1.address)
    expect(ethers.utils.formatUnits(p1, 30)).eq("2009991.111")
    expect(await fastPriceFeed.prices(token1.address)).eq("2009991111000000000000000000000000000")
    expect(await fastPriceFeed.prices(token2.address)).eq(getExpandedPrice(price2))
    expect(await fastPriceFeed.prices(token3.address)).eq(getExpandedPrice(price3))
    expect(await fastPriceFeed.prices(token4.address)).eq(getExpandedPrice(price4))
    expect(await fastPriceFeed.prices(token5.address)).eq(getExpandedPrice(price5))
    expect(await fastPriceFeed.prices(token6.address)).eq(getExpandedPrice(price6))
    expect(await fastPriceFeed.prices(token7.address)).eq(getExpandedPrice(price7))

    await fastPriceFeed.connect(user0).setTokens([
      token1.address, token2.address, token3.address, token4.address,
      token5.address, token6.address, token7.address, token8.address])

    priceBitArray = getPriceBitArray([
      price1, price2, price3, price4,
      price5, price6, price7, price8])

    expect(priceBitArray.length).eq(1)

    await fastPriceFeed.connect(user0).setCompactedPrices(priceBitArray)

    expect(await fastPriceFeed.prices(token1.address)).eq(getExpandedPrice(price1))
    expect(await fastPriceFeed.prices(token2.address)).eq(getExpandedPrice(price2))
    expect(await fastPriceFeed.prices(token3.address)).eq(getExpandedPrice(price3))
    expect(await fastPriceFeed.prices(token4.address)).eq(getExpandedPrice(price4))
    expect(await fastPriceFeed.prices(token5.address)).eq(getExpandedPrice(price5))
    expect(await fastPriceFeed.prices(token6.address)).eq(getExpandedPrice(price6))
    expect(await fastPriceFeed.prices(token7.address)).eq(getExpandedPrice(price7))
    expect(await fastPriceFeed.prices(token8.address)).eq(getExpandedPrice(price8))

    await fastPriceFeed.connect(user0).setTokens([
      token1.address, token2.address, token3.address, token4.address,
      token5.address, token6.address, token7.address, token8.address,
      token9.address])

    priceBitArray = getPriceBitArray([
      price1, price2, price3, price4,
      price5, price6, price7, price8,
      price9])

    expect(priceBitArray.length).eq(2)

    await fastPriceFeed.connect(user0).setCompactedPrices(priceBitArray)

    expect(await fastPriceFeed.prices(token1.address)).eq(getExpandedPrice(price1))
    expect(await fastPriceFeed.prices(token2.address)).eq(getExpandedPrice(price2))
    expect(await fastPriceFeed.prices(token3.address)).eq(getExpandedPrice(price3))
    expect(await fastPriceFeed.prices(token4.address)).eq(getExpandedPrice(price4))
    expect(await fastPriceFeed.prices(token5.address)).eq(getExpandedPrice(price5))
    expect(await fastPriceFeed.prices(token6.address)).eq(getExpandedPrice(price6))
    expect(await fastPriceFeed.prices(token7.address)).eq(getExpandedPrice(price7))
    expect(await fastPriceFeed.prices(token8.address)).eq(getExpandedPrice(price8))
    expect(await fastPriceFeed.prices(token9.address)).eq(getExpandedPrice(price9))

    await fastPriceFeed.connect(user0).setTokens([
      token1.address, token2.address, token3.address, token4.address,
      token5.address, token6.address, token7.address, token8.address,
      token9.address, token10.address])

    priceBitArray = getPriceBitArray([
      price1, price2, price3, price4,
      price5, price6, price7, price8,
      price9, price10])

    expect(priceBitArray.length).eq(2)

    await fastPriceFeed.connect(user0).setCompactedPrices(priceBitArray)

    expect(await fastPriceFeed.prices(token1.address)).eq(getExpandedPrice(price1))
    expect(await fastPriceFeed.prices(token2.address)).eq(getExpandedPrice(price2))
    expect(await fastPriceFeed.prices(token3.address)).eq(getExpandedPrice(price3))
    expect(await fastPriceFeed.prices(token4.address)).eq(getExpandedPrice(price4))
    expect(await fastPriceFeed.prices(token5.address)).eq(getExpandedPrice(price5))
    expect(await fastPriceFeed.prices(token6.address)).eq(getExpandedPrice(price6))
    expect(await fastPriceFeed.prices(token7.address)).eq(getExpandedPrice(price7))
    expect(await fastPriceFeed.prices(token8.address)).eq(getExpandedPrice(price8))
    expect(await fastPriceFeed.prices(token9.address)).eq(getExpandedPrice(price9))
    expect(await fastPriceFeed.prices(token10.address)).eq(getExpandedPrice(price10))
  })
})
