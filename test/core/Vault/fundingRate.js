const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed } = require("../../shared/utilities")
const { toChainlinkPrice } = require("../../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../../shared/units")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig, validateVaultBalance } = require("./helpers")

use(solidity)

describe("Vault.fundingRates", function () {
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

  beforeEach(async () => {
    bnb = await deployContract("Token", [])
    bnbPriceFeed = await deployContract("PriceFeed", [])

    btc = await deployContract("Token", [])
    btcPriceFeed = await deployContract("PriceFeed", [])

    dai = await deployContract("Token", [])
    daiPriceFeed = await deployContract("PriceFeed", [])

    vault = await deployContract("Vault", [])
    usdg = await deployContract("USDG", [vault.address])
    router = await deployContract("Router", [vault.address, usdg.address, bnb.address])
    vaultPriceFeed = await deployContract("VaultPriceFeed", [])

    await initVault(vault, router, usdg, vaultPriceFeed)

    distributor0 = await deployContract("TimeDistributor", [])
    yieldTracker0 = await deployContract("YieldTracker", [usdg.address])

    await yieldTracker0.setDistributor(distributor0.address)
    await distributor0.setDistribution([yieldTracker0.address], [1000], [bnb.address])

    await bnb.mint(distributor0.address, 5000)
    await usdg.setYieldTrackers([yieldTracker0.address])

    await vaultPriceFeed.setTokenConfig(bnb.address, bnbPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(dai.address, daiPriceFeed.address, 8, false)
  })

  it("funding rate", async () => {
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

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(45100))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(46100))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(47100))

    let leverage = await vault.getPositionLeverage(user0.address, btc.address, btc.address, true)
    expect(leverage).eq(90817) // ~9X leverage

    expect(await vault.feeReserves(btc.address)).eq(969)
    expect(await vault.reservedAmounts(btc.address)).eq(225000)
    expect(await vault.guaranteedUsd(btc.address)).eq(toUsd(80.09))
    expect(await vault.poolAmounts(btc.address)).eq(274250 - 219)
    expect(await btc.balanceOf(user2.address)).eq(0)

    const tx0 = await vault.connect(user0).decreasePosition(user0.address, btc.address, btc.address, toUsd(3), toUsd(50), true, user2.address)
    await reportGasUsed(provider, tx0, "decreasePosition gas used")

    leverage = await vault.getPositionLeverage(user0.address, btc.address, btc.address, true)
    expect(leverage).eq(57887) // ~5.8X leverage

    position = await vault.getPosition(user0.address, btc.address, btc.address, true)
    expect(position[0]).eq(toUsd(40)) // size
    expect(position[1]).eq(toUsd(9.91 - 3)) // collateral
    expect(position[2]).eq(toNormalizedPrice(41000)) // averagePrice
    expect(position[3]).eq(0) // entryFundingRate
    expect(position[4]).eq(225000 / 90 * 40) // reserveAmount, 0.00225 * 40,000 => 90
    expect(position[5]).eq(toUsd(5)) // pnl
    expect(position[6]).eq(true)

    expect(await vault.feeReserves(btc.address)).eq(969 + 106) // 0.00000106 * 45100 => ~0.05 USD
    expect(await vault.reservedAmounts(btc.address)).eq(225000 / 90 * 40)
    expect(await vault.guaranteedUsd(btc.address)).eq(toUsd(33.09))
    expect(await vault.poolAmounts(btc.address)).eq(274250 - 16878 - 106 - 1 - 219) // 257046
    expect(await btc.balanceOf(user2.address)).eq(16878) // 0.00016878 * 47100 => 7.949538 USD

    await increaseTime(provider, 8 * 60 * 60 + 10)
    await mineBlock(provider)

    await expect(vault.connect(user0).decreasePosition(user0.address, btc.address, btc.address, toUsd(3), 0, true, user2.address))
      .to.be.revertedWith("Vault: liquidation fees exceed collateral")

    const tx1 = await vault.connect(user0).decreasePosition(user0.address, btc.address, btc.address, toUsd(1), 0, true, user2.address)
    await reportGasUsed(provider, tx1, "withdraw collateral gas used")

    position = await vault.getPosition(user0.address, btc.address, btc.address, true)
    expect(position[0]).eq(toUsd(40)) // size
    expect(position[1]).eq(toUsd(9.91 - 3 - 1)) // collateral
    expect(position[2]).eq(toNormalizedPrice(41000)) // averagePrice
    expect(position[3]).eq(233) // entryFundingRate
    expect(position[4]).eq(225000 / 90 * 40) // reserveAmount, 0.00225 * 40,000 => 90
    expect(position[5]).eq(toUsd(5)) // pnl
    expect(position[6]).eq(true)

    expect(await vault.getUtilisation(btc.address)).eq(392275) // 100000 / 254923 => ~39.2%

    // funding rate factor => 600 / 1000000 (0.06%)
    // utilisation => ~39.1%
    // funding fee % => 0.02351628%
    // position size => 40 USD
    // funding fee  => 0.0094 USD
    // 0.00000019 BTC => 0.00000019 * 47100 => ~0.009 USD

    expect(await vault.feeReserves(btc.address)).eq(969 + 106 + 19)
    expect(await vault.reservedAmounts(btc.address)).eq(225000 / 90 * 40)
    expect(await vault.guaranteedUsd(btc.address)).eq(toUsd(34.09))
    expect(await vault.poolAmounts(btc.address)).eq(274250 - 16878 - 106 - 1 - 2123 - 219) // 0.00002123* 47100 => 1 USD
    expect(await btc.balanceOf(user2.address)).eq(16878 + 2123 - 20)

    await validateVaultBalance(expect, vault, btc, 2)
  })
})
