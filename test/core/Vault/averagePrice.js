const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed } = require("../../shared/utilities")
const { toChainlinkPrice } = require("../../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../../shared/units")
const { initVault, getBnbConfig, getEthConfig, getBtcConfig, getDaiConfig, validateVaultBalance } = require("./helpers")

use(solidity)

describe("Vault.averagePrice", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let vault
  let vaultPriceFeed
  let usdg
  let router
  let bnb
  let bnbPriceFeed
  let btc
  let btcPriceFeed
  let dai
  let daiPriceFeed
  let distributor0
  let yieldTracker0

  let glpManager
  let glp

  beforeEach(async () => {
    bnb = await deployContract("Token", [])
    bnbPriceFeed = await deployContract("PriceFeed", [])

    btc = await deployContract("Token", [])
    btcPriceFeed = await deployContract("PriceFeed", [])

    eth = await deployContract("Token", [])
    ethPriceFeed = await deployContract("PriceFeed", [])

    dai = await deployContract("Token", [])
    daiPriceFeed = await deployContract("PriceFeed", [])

    vault = await deployContract("Vault", [])
    usdg = await deployContract("USDG", [vault.address])
    router = await deployContract("Router", [vault.address, usdg.address, bnb.address])
    vaultPriceFeed = await deployContract("VaultPriceFeed", [])

    const initVaultResult = await initVault(vault, router, usdg, vaultPriceFeed)

    distributor0 = await deployContract("TimeDistributor", [])
    yieldTracker0 = await deployContract("YieldTracker", [usdg.address])

    await yieldTracker0.setDistributor(distributor0.address)
    await distributor0.setDistribution([yieldTracker0.address], [1000], [bnb.address])

    await bnb.mint(distributor0.address, 5000)
    await usdg.setYieldTrackers([yieldTracker0.address])

    await vaultPriceFeed.setTokenConfig(bnb.address, bnbPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(dai.address, daiPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(eth.address, ethPriceFeed.address, 8, false)

    await vault.setFees(
      50, // _taxBasisPoints
      20, // _stableTaxBasisPoints
      30, // _mintBurnFeeBasisPoints
      30, // _swapFeeBasisPoints
      4, // _stableSwapFeeBasisPoints
      10, // _marginFeeBasisPoints
      toUsd(5), // _liquidationFeeUsd
      60 * 60, // _minProfitTime
      false // _hasDynamicFees
    )

    glp = await deployContract("GLP", [])
    glpManager = await deployContract("GlpManager", [vault.address, usdg.address, glp.address, ethers.constants.AddressZero, 24 * 60 * 60])
  })

  it("position.averagePrice, buyPrice != markPrice", async () => {
    await daiPriceFeed.setLatestAnswer(toChainlinkPrice(1))
    await vault.setTokenConfig(...getDaiConfig(dai, daiPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await vault.setTokenConfig(...getBtcConfig(btc, btcPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(41000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))

    await btc.mint(user1.address, expandDecimals(1, 8))
    await btc.connect(user1).transfer(vault.address, 250000) // 0.0025 BTC => 100 USD
    await vault.buyUSDG(btc.address, user1.address)

    await btc.mint(user0.address, expandDecimals(1, 8))
    await btc.connect(user1).transfer(vault.address, 25000) // 0.00025 BTC => 10 USD
    await expect(vault.connect(user0).increasePosition(user0.address, btc.address, btc.address, toUsd(110), true))
      .to.be.revertedWith("Vault: reserve exceeds pool")

    await vault.connect(user0).increasePosition(user0.address, btc.address, btc.address, toUsd(90), true)
    let blockTime = await getBlockTime(provider)

    expect(await glpManager.getAumInUsdg(false)).eq("99702400000000000000") // 99.7024
    expect(await glpManager.getAumInUsdg(true)).eq("100192710000000000000") // 100.19271

    let position = await vault.getPosition(user0.address, btc.address, btc.address, true)
    expect(position[0]).eq(toUsd(90)) // size
    expect(position[1]).eq(toUsd(9.91)) // collateral, 10 - 90 * 0.1%
    expect(position[2]).eq(toNormalizedPrice(41000)) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(225000) // reserveAmount, 0.00225 * 40,000 => 90
    expect(position[7]).eq(blockTime)

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(45100))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(46100))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(47100))

    expect(await glpManager.getAumInUsdg(false)).eq("102202981000000000000") // 102.202981
    expect(await glpManager.getAumInUsdg(true)).eq("103183601000000000000") // 103.183601

    let leverage = await vault.getPositionLeverage(user0.address, btc.address, btc.address, true)
    expect(leverage).eq(90817) // ~9X leverage

    expect(await vault.feeReserves(btc.address)).eq(969)
    expect(await vault.reservedAmounts(btc.address)).eq(225000)
    expect(await vault.guaranteedUsd(btc.address)).eq(toUsd(80.09))
    expect(await vault.poolAmounts(btc.address)).eq(274250 - 219)
    expect(await btc.balanceOf(user2.address)).eq(0)

    let delta = await vault.getPositionDelta(user0.address, btc.address, btc.address, true)
    expect(delta[0]).eq(true)
    expect(delta[1]).eq(toUsd(9))

    await increaseTime(provider, 10 * 60)
    await mineBlock(provider)

    await expect(vault.connect(user0).increasePosition(user0.address, btc.address, btc.address, toUsd(90), true))
      .to.be.revertedWith("Vault: reserve exceeds pool")

    await vault.connect(user0).increasePosition(user0.address, btc.address, btc.address, toUsd(10), true)
    blockTime = await getBlockTime(provider)

    expect(await glpManager.getAumInUsdg(false)).eq("102203938000000000000") // 102.203938
    expect(await glpManager.getAumInUsdg(true)).eq("102740698000000000000") // 102.740698

    position = await vault.getPosition(user0.address, btc.address, btc.address, true)
    expect(position[0]).eq(toUsd(100)) // size
    expect(position[1]).eq(toUsd(9.90)) // collateral, 10 - 90 * 0.1% - 10 * 0.1%
    expect(position[2]).eq("43211009174311926605504587155963302") // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(225000 + 22172) // reserveAmount, 0.00225 * 40,000 => 90, 0.00022172 * 45100 => ~10
    expect(position[7]).eq(blockTime)

    leverage = await vault.getPositionLeverage(user0.address, btc.address, btc.address, true)
    expect(leverage).eq(101010) // ~10X leverage

    expect(await vault.feeReserves(btc.address)).eq(969 + 21) // 0.00000021 * 45100 => 0.01 USD
    expect(await vault.reservedAmounts(btc.address)).eq(225000 + 22172)
    expect(await vault.guaranteedUsd(btc.address)).eq(toUsd(90.1))
    expect(await vault.poolAmounts(btc.address)).eq(274250 - 219 - 21)
    expect(await btc.balanceOf(user2.address)).eq(0)

    // profits will decrease slightly as there is a difference between the buy price and the mark price
    delta = await vault.getPositionDelta(user0.address, btc.address, btc.address, true)
    expect(delta[0]).eq(true)
    expect(delta[1]).eq("4371549893842887473460721868365") // ~4.37

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(47100))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(47100))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(47100))

    delta = await vault.getPositionDelta(user0.address, btc.address, btc.address, true)
    expect(delta[0]).eq(true)
    expect(delta[1]).eq(toUsd(9))

    await validateVaultBalance(expect, vault, btc)
  })

  it("position.averagePrice, buyPrice == markPrice", async () => {
    await daiPriceFeed.setLatestAnswer(toChainlinkPrice(1))
    await vault.setTokenConfig(...getDaiConfig(dai, daiPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await vault.setTokenConfig(...getBtcConfig(btc, btcPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(41000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))

    await btc.mint(user1.address, expandDecimals(1, 8))
    await btc.connect(user1).transfer(vault.address, 250000) // 0.0025 BTC => 100 USD
    await vault.buyUSDG(btc.address, user1.address)

    await btc.mint(user0.address, expandDecimals(1, 8))
    await btc.connect(user1).transfer(vault.address, 25000) // 0.00025 BTC => 10 USD
    await expect(vault.connect(user0).increasePosition(user0.address, btc.address, btc.address, toUsd(110), true))
      .to.be.revertedWith("Vault: reserve exceeds pool")

    expect(await glpManager.getAumInUsdg(false)).eq("99700000000000000000") // 99.7
    expect(await glpManager.getAumInUsdg(true)).eq("102192500000000000000") // 102.1925

    await vault.connect(user0).increasePosition(user0.address, btc.address, btc.address, toUsd(90), true)

    expect(await glpManager.getAumInUsdg(false)).eq("99702400000000000000") // 99.7024
    expect(await glpManager.getAumInUsdg(true)).eq("100192710000000000000") // 100.19271

    let position = await vault.getPosition(user0.address, btc.address, btc.address, true)
    expect(position[0]).eq(toUsd(90)) // size
    expect(position[1]).eq(toUsd(9.91)) // collateral, 10 - 90 * 0.1%
    expect(position[2]).eq(toNormalizedPrice(41000)) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(225000) // reserveAmount, 0.00225 * 40,000 => 90

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(45100))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(45100))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(45100))

    expect(await glpManager.getAumInUsdg(false)).eq("102202981000000000000") // 102.202981
    expect(await glpManager.getAumInUsdg(true)).eq("102202981000000000000") // 102.202981

    let leverage = await vault.getPositionLeverage(user0.address, btc.address, btc.address, true)
    expect(leverage).eq(90817) // ~9X leverage

    expect(await vault.feeReserves(btc.address)).eq(969)
    expect(await vault.reservedAmounts(btc.address)).eq(225000)
    expect(await vault.guaranteedUsd(btc.address)).eq(toUsd(80.09))
    expect(await vault.poolAmounts(btc.address)).eq(274250 - 219)
    expect(await btc.balanceOf(user2.address)).eq(0)

    let delta = await vault.getPositionDelta(user0.address, btc.address, btc.address, true)
    expect(delta[0]).eq(true)
    expect(delta[1]).eq(toUsd(9))

    await expect(vault.connect(user0).increasePosition(user0.address, btc.address, btc.address, toUsd(90), true))
      .to.be.revertedWith("Vault: reserve exceeds pool")

    await vault.connect(user0).increasePosition(user0.address, btc.address, btc.address, toUsd(10), true)

    expect(await glpManager.getAumInUsdg(false)).eq("102203487000000000000") // 102.203487
    expect(await glpManager.getAumInUsdg(true)).eq("102203487000000000000") // 102.203487

    position = await vault.getPosition(user0.address, btc.address, btc.address, true)
    expect(position[0]).eq(toUsd(100)) // size
    expect(position[1]).eq(toUsd(9.90)) // collateral, 10 - 90 * 0.1% - 10 * 0.1%
    expect(position[2]).eq("41376146788990825688073394495412844") // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(225000 + 22172) // reserveAmount, 0.00225 * 40,000 => 90, 0.00022172 * 45100 => ~10

    leverage = await vault.getPositionLeverage(user0.address, btc.address, btc.address, true)
    expect(leverage).eq(101010) // ~10X leverage

    expect(await vault.feeReserves(btc.address)).eq(969 + 22) // 0.00000021 * 45100 => 0.01 USD
    expect(await vault.reservedAmounts(btc.address)).eq(225000 + 22172)
    expect(await vault.guaranteedUsd(btc.address)).eq(toUsd(90.1))
    expect(await vault.poolAmounts(btc.address)).eq(274250 - 219 - 22)
    expect(await btc.balanceOf(user2.address)).eq(0)

    delta = await vault.getPositionDelta(user0.address, btc.address, btc.address, true)
    expect(delta[0]).eq(true)
    expect(delta[1]).eq(toUsd(9))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(41000))

    delta = await vault.getPositionDelta(user0.address, btc.address, btc.address, true)
    expect(delta[0]).eq(false)
    expect(delta[1]).eq("909090909090909090909090909090") // ~0.909

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(50000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(50000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(50000))

    delta = await vault.getPositionDelta(user0.address, btc.address, btc.address, true)
    expect(delta[0]).eq(true)
    expect(delta[1]).eq("20842572062084257206208425720620") // ~20.84

    await validateVaultBalance(expect, vault, btc)
  })

  it("position.averagePrice, buyPrice < averagePrice", async () => {
    await daiPriceFeed.setLatestAnswer(toChainlinkPrice(1))
    await vault.setTokenConfig(...getDaiConfig(dai, daiPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await vault.setTokenConfig(...getBtcConfig(btc, btcPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(41000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))

    await btc.mint(user1.address, expandDecimals(1, 8))
    await btc.connect(user1).transfer(vault.address, 250000) // 0.0025 BTC => 100 USD
    await vault.buyUSDG(btc.address, user1.address)

    await btc.mint(user0.address, expandDecimals(1, 8))
    await btc.connect(user1).transfer(vault.address, 25000) // 0.00025 BTC => 10 USD
    await expect(vault.connect(user0).increasePosition(user0.address, btc.address, btc.address, toUsd(110), true))
      .to.be.revertedWith("Vault: reserve exceeds pool")

    await vault.connect(user0).increasePosition(user0.address, btc.address, btc.address, toUsd(90), true)

    let position = await vault.getPosition(user0.address, btc.address, btc.address, true)
    expect(position[0]).eq(toUsd(90)) // size
    expect(position[1]).eq(toUsd(9.91)) // collateral, 10 - 90 * 0.1%
    expect(position[2]).eq(toNormalizedPrice(41000)) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(225000) // reserveAmount, 0.00225 * 40,000 => 90

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(36900))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(36900))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(36900))

    let leverage = await vault.getPositionLeverage(user0.address, btc.address, btc.address, true)
    expect(leverage).eq(90817) // ~9X leverage

    expect(await vault.feeReserves(btc.address)).eq(969)
    expect(await vault.reservedAmounts(btc.address)).eq(225000)
    expect(await vault.guaranteedUsd(btc.address)).eq(toUsd(80.09))
    expect(await vault.poolAmounts(btc.address)).eq(274250 - 219)
    expect(await btc.balanceOf(user2.address)).eq(0)

    let delta = await vault.getPositionDelta(user0.address, btc.address, btc.address, true)
    expect(delta[0]).eq(false)
    expect(delta[1]).eq(toUsd(9))

    await expect(vault.connect(user0).increasePosition(user0.address, btc.address, btc.address, toUsd(90), true))
      .to.be.revertedWith("Vault: liquidation fees exceed collateral")

    await btc.connect(user1).transfer(vault.address, 25000)
    await vault.connect(user0).increasePosition(user0.address, btc.address, btc.address, toUsd(10), true)

    position = await vault.getPosition(user0.address, btc.address, btc.address, true)
    expect(position[0]).eq(toUsd(100)) // size
    expect(position[1]).eq(toUsd(9.91 + 9.215)) // collateral, 0.00025 * 36900 => 9.225, 0.01 fees
    expect(position[2]).eq("40549450549450549450549450549450549") // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(225000 + 27100) // reserveAmount, 0.000271 * 36900 => ~10

    leverage = await vault.getPositionLeverage(user0.address, btc.address, btc.address, true)
    expect(leverage).eq(52287) // ~5.2X leverage

    expect(await vault.feeReserves(btc.address)).eq(969 + 27) // 0.00000027 * 36900 => 0.01 USD
    expect(await vault.reservedAmounts(btc.address)).eq(225000 + 27100)
    expect(await vault.guaranteedUsd(btc.address)).eq(toUsd(80.875))
    expect(await vault.poolAmounts(btc.address)).eq(274250 + 25000 - 219 - 27)
    expect(await btc.balanceOf(user2.address)).eq(0)

    delta = await vault.getPositionDelta(user0.address, btc.address, btc.address, true)
    expect(delta[0]).eq(false)
    expect(delta[1]).eq("8999999999999999999999999999999")

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(41000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(41000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(41000))

    delta = await vault.getPositionDelta(user0.address, btc.address, btc.address, true)
    expect(delta[0]).eq(true)
    expect(delta[1]).eq("1111111111111111111111111111111") // ~1.111

    await validateVaultBalance(expect, vault, btc)
  })

  it("long position.averagePrice, buyPrice == averagePrice", async () => {
    await daiPriceFeed.setLatestAnswer(toChainlinkPrice(1))
    await vault.setTokenConfig(...getDaiConfig(dai, daiPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await vault.setTokenConfig(...getBtcConfig(btc, btcPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))

    await btc.mint(user1.address, expandDecimals(1, 8))
    await btc.connect(user1).transfer(vault.address, 250000) // 0.0025 BTC => 100 USD
    await vault.buyUSDG(btc.address, user1.address)

    await btc.mint(user0.address, expandDecimals(1, 8))
    await btc.connect(user1).transfer(vault.address, 25000) // 0.00025 BTC => 10 USD
    await vault.connect(user0).increasePosition(user0.address, btc.address, btc.address, toUsd(90), true)

    let position = await vault.getPosition(user0.address, btc.address, btc.address, true)
    expect(position[0]).eq(toUsd(90)) // size
    expect(position[1]).eq(toUsd(9.91)) // collateral, 10 - 90 * 0.1%
    expect(position[2]).eq(toNormalizedPrice(40000)) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(225000) // reserveAmount, 0.00225 * 40,000 => 90

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))

    let delta = await vault.getPositionDelta(user0.address, btc.address, btc.address, true)
    expect(delta[0]).eq(false)
    expect(delta[1]).eq(0)

    await btc.connect(user1).transfer(vault.address, 25000)
    await vault.connect(user0).increasePosition(user0.address, btc.address, btc.address, toUsd(10), true)

    position = await vault.getPosition(user0.address, btc.address, btc.address, true)
    expect(position[0]).eq(toUsd(100)) // size
    expect(position[1]).eq(toUsd(9.91 + 9.99)) // collateral
    expect(position[2]).eq(toNormalizedPrice(40000)) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(225000 + 25000) // reserveAmount

    delta = await vault.getPositionDelta(user0.address, btc.address, btc.address, true)
    expect(delta[0]).eq(false)
    expect(delta[1]).eq(0)

    await validateVaultBalance(expect, vault, btc)
  })

  it("long position.averagePrice, buyPrice > averagePrice", async () => {
    await daiPriceFeed.setLatestAnswer(toChainlinkPrice(1))
    await vault.setTokenConfig(...getDaiConfig(dai, daiPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await vault.setTokenConfig(...getBtcConfig(btc, btcPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))

    await btc.mint(user1.address, expandDecimals(1, 8))
    await btc.connect(user1).transfer(vault.address, 250000) // 0.0025 BTC => 100 USD
    await vault.buyUSDG(btc.address, user1.address)

    await btc.mint(user0.address, expandDecimals(1, 8))
    await btc.connect(user1).transfer(vault.address, 25000) // 0.00025 BTC => 10 USD
    await vault.connect(user0).increasePosition(user0.address, btc.address, btc.address, toUsd(90), true)

    let position = await vault.getPosition(user0.address, btc.address, btc.address, true)
    expect(position[0]).eq(toUsd(90)) // size
    expect(position[1]).eq(toUsd(9.91)) // collateral, 10 - 90 * 0.1%
    expect(position[2]).eq(toNormalizedPrice(40000)) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(225000) // reserveAmount, 0.00225 * 40,000 => 90

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(50000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(50000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(50000))

    let delta = await vault.getPositionDelta(user0.address, btc.address, btc.address, true)
    expect(delta[0]).eq(true)
    expect(delta[1]).eq(toUsd(22.5))

    await btc.connect(user1).transfer(vault.address, 25000)
    await vault.connect(user0).increasePosition(user0.address, btc.address, btc.address, toUsd(10), true)

    position = await vault.getPosition(user0.address, btc.address, btc.address, true)
    expect(position[0]).eq(toUsd(100)) // size
    expect(position[2]).eq("40816326530612244897959183673469387") // averagePrice

    delta = await vault.getPositionDelta(user0.address, btc.address, btc.address, true)
    expect(delta[0]).eq(true)
    expect(delta[1]).eq(toUsd(22.5))

    await validateVaultBalance(expect, vault, btc)
  })

  it("long position.averagePrice, buyPrice < averagePrice", async () => {
    await daiPriceFeed.setLatestAnswer(toChainlinkPrice(1))
    await vault.setTokenConfig(...getDaiConfig(dai, daiPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await vault.setTokenConfig(...getBtcConfig(btc, btcPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))

    await btc.mint(user1.address, expandDecimals(1, 8))
    await btc.connect(user1).transfer(vault.address, 250000) // 0.0025 BTC => 100 USD
    await vault.buyUSDG(btc.address, user1.address)

    await btc.mint(user0.address, expandDecimals(1, 8))
    await btc.connect(user1).transfer(vault.address, 125000) // 0.000125 BTC => 50 USD
    await vault.connect(user0).increasePosition(user0.address, btc.address, btc.address, toUsd(90), true)

    let position = await vault.getPosition(user0.address, btc.address, btc.address, true)
    expect(position[0]).eq(toUsd(90)) // size
    expect(position[1]).eq("49910000000000000000000000000000") // collateral, 50 - 90 * 0.1%
    expect(position[2]).eq(toNormalizedPrice(40000)) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(225000) // reserveAmount, 0.00225 * 40,000 => 90

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(30000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(30000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(30000))

    let delta = await vault.getPositionDelta(user0.address, btc.address, btc.address, true)
    expect(delta[0]).eq(false)
    expect(delta[1]).eq(toUsd(22.5))

    await btc.connect(user1).transfer(vault.address, 25000)
    await vault.connect(user0).increasePosition(user0.address, btc.address, btc.address, toUsd(10), true)

    position = await vault.getPosition(user0.address, btc.address, btc.address, true)
    expect(position[0]).eq(toUsd(100)) // size
    expect(position[2]).eq("38709677419354838709677419354838709") // averagePrice

    delta = await vault.getPositionDelta(user0.address, btc.address, btc.address, true)
    expect(delta[0]).eq(false)
    expect(delta[1]).eq("22499999999999999999999999999999")
  })

  it("long position.averagePrice, buyPrice < averagePrice + minProfitBasisPoints", async () => {
    await daiPriceFeed.setLatestAnswer(toChainlinkPrice(1))
    await vault.setTokenConfig(...getDaiConfig(dai, daiPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await vault.setTokenConfig(...getBtcConfig(btc, btcPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))

    await btc.mint(user1.address, expandDecimals(1, 8))
    await btc.connect(user1).transfer(vault.address, 250000) // 0.0025 BTC => 100 USD
    await vault.buyUSDG(btc.address, user1.address)

    await btc.mint(user0.address, expandDecimals(1, 8))
    await btc.connect(user1).transfer(vault.address, 125000) // 0.000125 BTC => 50 USD
    await vault.connect(user0).increasePosition(user0.address, btc.address, btc.address, toUsd(90), true)

    let position = await vault.getPosition(user0.address, btc.address, btc.address, true)
    expect(position[0]).eq(toUsd(90)) // size
    expect(position[1]).eq("49910000000000000000000000000000") // collateral, 50 - 90 * 0.1%
    expect(position[2]).eq(toNormalizedPrice(40000)) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(225000) // reserveAmount, 0.00225 * 40,000 => 90

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40300))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40300))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40300))

    let delta = await vault.getPositionDelta(user0.address, btc.address, btc.address, true)
    expect(delta[0]).eq(true)
    expect(delta[1]).eq("0")

    await btc.connect(user1).transfer(vault.address, 25000)
    await vault.connect(user0).increasePosition(user0.address, btc.address, btc.address, toUsd(10), true)

    position = await vault.getPosition(user0.address, btc.address, btc.address, true)
    expect(position[0]).eq(toUsd(100)) // size
    expect(position[2]).eq(toUsd(40300)) // averagePrice

    delta = await vault.getPositionDelta(user0.address, btc.address, btc.address, true)
    expect(delta[0]).eq(false)
    expect(delta[1]).eq("0")

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(41000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(41000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(41000))

    delta = await vault.getPositionDelta(user0.address, btc.address, btc.address, true)
    expect(delta[0]).eq(true)
    expect(delta[1]).eq("1736972704714640198511166253101") // (700 / 40300) * 100 => 1.73697
  })

  it("short position.averagePrice, buyPrice == averagePrice", async () => {
    await daiPriceFeed.setLatestAnswer(toChainlinkPrice(1))
    await vault.setTokenConfig(...getDaiConfig(dai, daiPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await vault.setTokenConfig(...getBtcConfig(btc, btcPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))

    await dai.mint(user1.address, expandDecimals(101, 18))
    await dai.connect(user1).transfer(vault.address, expandDecimals(101, 18))
    await vault.buyUSDG(dai.address, user1.address)

    await dai.mint(user0.address, expandDecimals(50, 18))
    await dai.connect(user0).transfer(vault.address, expandDecimals(50, 18))
    await vault.connect(user0).increasePosition(user0.address, dai.address, btc.address, toUsd(90), false)

    let position = await vault.getPosition(user0.address, dai.address, btc.address, false)
    expect(position[0]).eq(toUsd(90)) // size
    expect(position[1]).eq("49910000000000000000000000000000") // collateral, 50 - 90 * 0.1%
    expect(position[2]).eq(toNormalizedPrice(40000)) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(expandDecimals(90, 18))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))

    let delta = await vault.getPositionDelta(user0.address, dai.address, btc.address, false)
    expect(delta[0]).eq(false)
    expect(delta[1]).eq(0)

    await vault.connect(user0).increasePosition(user0.address, dai.address, btc.address, toUsd(10), false)

    position = await vault.getPosition(user0.address, dai.address, btc.address, false)
    expect(position[0]).eq(toUsd(100)) // size
    expect(position[1]).eq("49900000000000000000000000000000") // collateral
    expect(position[2]).eq(toNormalizedPrice(40000)) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(expandDecimals(100, 18)) // reserveAmount

    delta = await vault.getPositionDelta(user0.address, dai.address, btc.address, false)
    expect(delta[0]).eq(false)
    expect(delta[1]).eq(0)
  })

  it("short position.averagePrice, buyPrice > averagePrice", async () => {
    await daiPriceFeed.setLatestAnswer(toChainlinkPrice(1))
    await vault.setTokenConfig(...getDaiConfig(dai, daiPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await vault.setTokenConfig(...getBtcConfig(btc, btcPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))

    await dai.mint(user1.address, expandDecimals(101, 18))
    await dai.connect(user1).transfer(vault.address, expandDecimals(101, 18))
    await vault.buyUSDG(dai.address, user1.address)

    await dai.mint(user0.address, expandDecimals(50, 18))
    await dai.connect(user0).transfer(vault.address, expandDecimals(50, 18))
    await vault.connect(user0).increasePosition(user0.address, dai.address, btc.address, toUsd(90), false)

    expect(await glpManager.getAumInUsdg(false)).eq("100697000000000000000") // 100.697
    expect(await glpManager.getAumInUsdg(true)).eq("100697000000000000000") // 100.697

    let position = await vault.getPosition(user0.address, dai.address, btc.address, false)
    expect(position[0]).eq(toUsd(90)) // size
    expect(position[1]).eq("49910000000000000000000000000000") // collateral, 50 - 90 * 0.1%
    expect(position[2]).eq(toNormalizedPrice(40000)) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(expandDecimals(90, 18))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(50000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(50000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(50000))

    expect(await glpManager.getAumInUsdg(false)).eq("123197000000000000000") // 123.197
    expect(await glpManager.getAumInUsdg(true)).eq("123197000000000000000") // 123.197

    let delta = await vault.getPositionDelta(user0.address, dai.address, btc.address, false)
    expect(delta[0]).eq(false)
    expect(delta[1]).eq("22500000000000000000000000000000") // 22.5

    await vault.connect(user0).increasePosition(user0.address, dai.address, btc.address, toUsd(10), false)

    expect(await glpManager.getAumInUsdg(false)).eq("123197000000000000000") // 123.197
    expect(await glpManager.getAumInUsdg(true)).eq("123197000000000000000") // 123.197

    position = await vault.getPosition(user0.address, dai.address, btc.address, false)
    expect(position[0]).eq(toUsd(100)) // size
    expect(position[1]).eq("49900000000000000000000000000000") // collateral
    expect(position[2]).eq("40816326530612244897959183673469387") // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(expandDecimals(100, 18)) // reserveAmount

    delta = await vault.getPositionDelta(user0.address, dai.address, btc.address, false)
    expect(delta[0]).eq(false)
    expect(delta[1]).eq("22500000000000000000000000000000") // 22.5
  })

  it("short position.averagePrice, buyPrice < averagePrice", async () => {
    await daiPriceFeed.setLatestAnswer(toChainlinkPrice(1))
    await vault.setTokenConfig(...getDaiConfig(dai, daiPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await vault.setTokenConfig(...getBtcConfig(btc, btcPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))

    await dai.mint(user1.address, expandDecimals(101, 18))
    await dai.connect(user1).transfer(vault.address, expandDecimals(101, 18))
    await vault.buyUSDG(dai.address, user1.address)

    await dai.mint(user0.address, expandDecimals(50, 18))
    await dai.connect(user0).transfer(vault.address, expandDecimals(50, 18))
    await vault.connect(user0).increasePosition(user0.address, dai.address, btc.address, toUsd(90), false)

    expect(await glpManager.getAumInUsdg(false)).eq("100697000000000000000") // 100.697
    expect(await glpManager.getAumInUsdg(true)).eq("100697000000000000000") // 100.697

    let position = await vault.getPosition(user0.address, dai.address, btc.address, false)
    expect(position[0]).eq(toUsd(90)) // size
    expect(position[1]).eq("49910000000000000000000000000000") // collateral, 50 - 90 * 0.1%
    expect(position[2]).eq(toNormalizedPrice(40000)) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(expandDecimals(90, 18))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(30000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(30000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(30000))

    expect(await glpManager.getAumInUsdg(false)).eq("78197000000000000000") // 78.197
    expect(await glpManager.getAumInUsdg(true)).eq("78197000000000000000") // 78.197

    let delta = await vault.getPositionDelta(user0.address, dai.address, btc.address, false)
    expect(delta[0]).eq(true)
    expect(delta[1]).eq("22500000000000000000000000000000") // 22.5

    await vault.connect(user0).increasePosition(user0.address, dai.address, btc.address, toUsd(10), false)

    expect(await glpManager.getAumInUsdg(false)).eq("78197000000000000000") // 78.197
    expect(await glpManager.getAumInUsdg(true)).eq("78197000000000000000") // 78.197

    position = await vault.getPosition(user0.address, dai.address, btc.address, false)
    expect(position[0]).eq(toUsd(100)) // size
    expect(position[1]).eq("49900000000000000000000000000000") // collateral
    expect(position[2]).eq("38709677419354838709677419354838709") // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(expandDecimals(100, 18)) // reserveAmount

    delta = await vault.getPositionDelta(user0.address, dai.address, btc.address, false)
    expect(delta[0]).eq(true)
    expect(delta[1]).eq("22499999999999999999999999999999") // ~22.5
  })

  it("short position.averagePrice, buyPrice < averagePrice - minProfitBasisPoints", async () => {
    await daiPriceFeed.setLatestAnswer(toChainlinkPrice(1))
    await vault.setTokenConfig(...getDaiConfig(dai, daiPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await vault.setTokenConfig(...getBtcConfig(btc, btcPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(40000))

    await dai.mint(user1.address, expandDecimals(101, 18))
    await dai.connect(user1).transfer(vault.address, expandDecimals(101, 18))
    await vault.buyUSDG(dai.address, user1.address)

    await dai.mint(user0.address, expandDecimals(50, 18))
    await dai.connect(user0).transfer(vault.address, expandDecimals(50, 18))
    await vault.connect(user0).increasePosition(user0.address, dai.address, btc.address, toUsd(90), false)

    expect(await glpManager.getAumInUsdg(false)).eq("100697000000000000000") // 100.697
    expect(await glpManager.getAumInUsdg(true)).eq("100697000000000000000") // 100.697

    let position = await vault.getPosition(user0.address, dai.address, btc.address, false)
    expect(position[0]).eq(toUsd(90)) // size
    expect(position[1]).eq("49910000000000000000000000000000") // collateral, 50 - 90 * 0.1%
    expect(position[2]).eq(toNormalizedPrice(40000)) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(expandDecimals(90, 18))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(39700))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(39700))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(39700))

    expect(await glpManager.getAumInUsdg(false)).eq("100022000000000000000") // 100.022
    expect(await glpManager.getAumInUsdg(true)).eq("100022000000000000000") // 100.022

    let delta = await vault.getPositionDelta(user0.address, dai.address, btc.address, false)
    expect(delta[0]).eq(true)
    expect(delta[1]).eq("0") // 22.5

    await vault.connect(user0).increasePosition(user0.address, dai.address, btc.address, toUsd(10), false)

    expect(await glpManager.getAumInUsdg(false)).eq("100022000000000000000") // 100.022
    expect(await glpManager.getAumInUsdg(true)).eq("100022000000000000000") // 100.022

    position = await vault.getPosition(user0.address, dai.address, btc.address, false)
    expect(position[0]).eq(toUsd(100)) // size
    expect(position[1]).eq("49900000000000000000000000000000") // collateral
    expect(position[2]).eq(toUsd(39700)) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(expandDecimals(100, 18)) // reserveAmount

    delta = await vault.getPositionDelta(user0.address, dai.address, btc.address, false)
    expect(delta[0]).eq(false)
    expect(delta[1]).eq("0") // ~22.5

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(39000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(39000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(39000))

    expect(await glpManager.getAumInUsdg(false)).eq("98270677581863979848") // 98.270677581863979848
    expect(await glpManager.getAumInUsdg(true)).eq("98270677581863979848") // 98.270677581863979848

    delta = await vault.getPositionDelta(user0.address, dai.address, btc.address, false)
    expect(delta[0]).eq(true)
    expect(delta[1]).eq("1763224181360201511335012594458") // (39700 - 39000) / 39700 * 100 => 1.7632
  })

  it("long position.averagePrice, buyPrice < averagePrice", async () => {
    await ethPriceFeed.setLatestAnswer("251382560787")
    await vault.setTokenConfig(...getEthConfig(eth, ethPriceFeed))

    await ethPriceFeed.setLatestAnswer("252145037536")
    await ethPriceFeed.setLatestAnswer("252145037536")

    await eth.mint(user1.address, expandDecimals(10, 18))
    await eth.connect(user1).transfer(vault.address, expandDecimals(10, 18))
    await vault.buyUSDG(eth.address, user1.address)

    await eth.mint(user0.address, expandDecimals(1, 18))
    await eth.connect(user0).transfer(vault.address, expandDecimals(1, 18))
    await vault.connect(user0).increasePosition(user0.address, eth.address, eth.address, "5050322181222357947081599665915068", true)

    let position = await vault.getPosition(user0.address, eth.address, eth.address, true)
    expect(position[0]).eq("5050322181222357947081599665915068") // size
    expect(position[1]).eq("2508775285688777642052918400334084") // averagePrice
    expect(position[2]).eq("2521450375360000000000000000000000") // averagePrice
    expect(position[3]).eq(0) // entryFundingRate

    await ethPriceFeed.setLatestAnswer("237323502539")
    await ethPriceFeed.setLatestAnswer("237323502539")
    await ethPriceFeed.setLatestAnswer("237323502539")

    let delta = await vault.getPositionDelta(user0.address, eth.address, eth.address, true)
    expect(delta[0]).eq(false)
    expect(delta[1]).eq("296866944860754376482796517102673")

    await eth.mint(user0.address, expandDecimals(1, 18))
    await eth.connect(user0).transfer(vault.address, expandDecimals(1, 18))
    await vault.connect(user0).increasePosition(user0.address, eth.address, eth.address, "4746470050780000000000000000000000", true)

    position = await vault.getPosition(user0.address, eth.address, eth.address, true)
    expect(position[0]).eq("9796792232002357947081599665915068") // size
    expect(position[2]).eq("2447397190894361457116367555285124") // averagePrice
  })
})
