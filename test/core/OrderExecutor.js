const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")

const { deployContract } = require("../shared/fixtures")
const { expandDecimals, reportGasUsed, gasUsed } = require("../shared/utilities")
const { toChainlinkPrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig } = require("./Vault/helpers")
const {
    getDefault,
    validateOrderFields,
    getTxFees,
    positionWrapper,
    defaultCreateIncreaseOrderFactory,
    defaultCreateDecreaseOrderFactory,
    defaultCreateSwapOrderFactory,
    getMinOut,
    getTriggerRatio
} = require('./OrderBook/helpers');

use(solidity);

const BTC_PRICE = 60000;
const BNB_PRICE = 300;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const PRICE_PRECISION = ethers.BigNumber.from(10).pow(30);
const BASIS_POINTS_DIVISOR = 10000;

describe("OrderExecutor", function () {
    const provider = waffle.provider
    const [wallet, user0, user1, user2, user3] = provider.getWallets()

    let vaultUtils
    let orderBook;
    let defaults;
    let tokenDecimals;
    let defaultCreateIncreaseOrder
    let defaultCreateDecreaseOrder
    let orderExecutor

    beforeEach(async () => {
        bnb = await deployContract("Token", [])
        bnbPriceFeed = await deployContract("PriceFeed", [])

        btc = await deployContract("Token", [])
        btcPriceFeed = await deployContract("PriceFeed", [])

        eth = await deployContract("Token", [])
        ethPriceFeed = await deployContract("PriceFeed", [])

        dai = await deployContract("Token", [])
        daiPriceFeed = await deployContract("PriceFeed", [])

        busd = await deployContract("Token", [])
        busdPriceFeed = await deployContract("PriceFeed", [])

        vault = await deployContract("Vault", [])
        usdg = await deployContract("USDG", [vault.address])
        router = await deployContract("Router", [vault.address, usdg.address, bnb.address])
        vaultPriceFeed = await deployContract("VaultPriceFeed", [])

        const initVaultResult = await initVault(vault, router, usdg, vaultPriceFeed)
        vaultUtils = initVaultResult.vaultUtils
        await vaultUtils.setMinLeverage(1000)

        distributor0 = await deployContract("TimeDistributor", [])
        yieldTracker0 = await deployContract("YieldTracker", [usdg.address])

        await yieldTracker0.setDistributor(distributor0.address)
        await distributor0.setDistribution([yieldTracker0.address], [1000], [bnb.address])

        await bnb.mint(distributor0.address, 5000)
        await usdg.setYieldTrackers([yieldTracker0.address])

        reader = await deployContract("Reader", [])

        await vaultPriceFeed.setTokenConfig(bnb.address, bnbPriceFeed.address, 8, false)
        await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)
        await vaultPriceFeed.setTokenConfig(eth.address, ethPriceFeed.address, 8, false)
        await vaultPriceFeed.setTokenConfig(dai.address, daiPriceFeed.address, 8, false)
        await vaultPriceFeed.setPriceSampleSpace(1);

        tokenDecimals = {
            [bnb.address]: 18,
            [dai.address]: 18,
            [btc.address]: 8
        };

        await daiPriceFeed.setLatestAnswer(toChainlinkPrice(1))
        await vault.setTokenConfig(...getDaiConfig(dai, daiPriceFeed))

        await btcPriceFeed.setLatestAnswer(toChainlinkPrice(BTC_PRICE))
        await vault.setTokenConfig(...getBtcConfig(btc, btcPriceFeed))

        await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(BNB_PRICE))
        await vault.setTokenConfig(...getBnbConfig(bnb, bnbPriceFeed))

        orderBook = await deployContract("OrderBook", [])
        const minExecutionFee = 500000;
        await orderBook.initialize(
            router.address,
            vault.address,
            bnb.address,
            usdg.address,
            minExecutionFee,
            expandDecimals(5, 30) // minPurchseTokenAmountUsd
        );

        orderExecutor = await deployContract("OrderExecutor", [vault.address, orderBook.address])

        await router.addPlugin(orderBook.address);
        await router.connect(user0).approvePlugin(orderBook.address);

        await btc.mint(user0.address, expandDecimals(1000, 8))
        await btc.connect(user0).approve(router.address, expandDecimals(100, 8))

        await dai.mint(user0.address, expandDecimals(10000000, 18))
        await dai.connect(user0).approve(router.address, expandDecimals(1000000, 18))

        await bnb.mint(user0.address, expandDecimals(10000000, 18))
        await bnb.connect(user0).approve(router.address, expandDecimals(1000000, 18))

        await dai.mint(user0.address, expandDecimals(20000000, 18))
        await dai.connect(user0).transfer(vault.address, expandDecimals(2000000, 18))
        await vault.directPoolDeposit(dai.address);

        await btc.mint(user0.address, expandDecimals(1000, 8))
        await btc.connect(user0).transfer(vault.address, expandDecimals(100, 8))
        await vault.directPoolDeposit(btc.address);

        await bnb.mint(user0.address, expandDecimals(50000, 18))
        await bnb.connect(user0).transfer(vault.address, expandDecimals(10000, 18))
        await vault.directPoolDeposit(bnb.address);


        defaultCreateIncreaseOrder = defaultCreateIncreaseOrderFactory(orderBook, {
            path: [btc.address],
            sizeDelta: toUsd(100000),
            amountIn: expandDecimals(1, 8),
            minOut: 0,
            triggerPrice: toUsd(53000),
            triggerAboveThreshold: true,
            executionFee: expandDecimals(1, 9).mul(1500000),
            collateralToken: btc.address,
            collateralDelta: toUsd(BTC_PRICE),
            user: user0,
            isLong: true,
            shouldWrap: false
        })

        defaultCreateDecreaseOrder = defaultCreateDecreaseOrderFactory(orderBook, {
            path: [btc.address],
            sizeDelta: toUsd(100000),
            amountIn: expandDecimals(1, 8),
            minOut: 0,
            triggerPrice: toUsd(53000),
            triggerAboveThreshold: true,
            executionFee: expandDecimals(1, 9).mul(1500000),
            collateralToken: btc.address,
            collateralDelta: toUsd(BTC_PRICE),
            user: user0,
            isLong: true
        })

        defaultCreateSwapOrder = defaultCreateSwapOrderFactory(orderBook, {
            path: [dai.address, btc.address],
            minOut: 0,
            amountIn: expandDecimals(1000, 18),
            triggerAboveThreshold: true,
            executionFee: expandDecimals(1, 9).mul(1500000),
            user: user0,
            shouldWrap: false,
            shouldUnwrap: true
        }, tokenDecimals)
    });

    it("OrderExecutor.executeSwapOrder", async () => {
        const amountIn = expandDecimals(100, 18);
        const executionFee = expandDecimals(1, 9).mul(1500000);
        const path = [dai.address, bnb.address];
        const minOut = await getMinOut(
            tokenDecimals,
            getTriggerRatio(toUsd(1), toUsd(BNB_PRICE + 50)),
            path,
            amountIn
        );
        await defaultCreateSwapOrder({
            path,
            triggerAboveThreshold: false,
            amountIn,
            minOut,
            value: executionFee
        });

        await bnb.deposit({value: expandDecimals(500, 18)});

        const balanceBefore = await user0.getBalance();
        await orderExecutor.connect(user1).executeSwapOrder(user0.address, 0, user1.address);
        const balanceAfter = await user0.getBalance();
        expect(balanceAfter).to.be.gte(balanceBefore.add(minOut));
    })

    it("OrderExecutor.executeIncreaseOrder", async () => {
        const timelock = await deployContract("Timelock", [
          wallet.address,
          5 * 24 * 60 * 60,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          expandDecimals(1000, 18)
        ])
        await vault.setIsLeverageEnabled(false)
        expect(await vault.isLeverageEnabled()).to.be.false
        await vault.setGov(timelock.address)
        await timelock.setContractHandler(orderExecutor.address, true)

        await defaultCreateIncreaseOrder();
        const orderBefore = await orderBook.increaseOrders(user0.address, 0)
        expect(orderBefore.sizeDelta).to.be.eq(toUsd(100000))
        await orderExecutor.executeIncreaseOrder(user0.address, 0, user1.address);
        const orderAfter = await orderBook.increaseOrders(user0.address, 0)
        expect(orderAfter.sizeDelta).to.be.eq(0)
        expect(await vault.isLeverageEnabled()).to.be.false
    })

    it("OrderExecutor.executeDecreaseOrder", async () => {
        const sizeDelta = toUsd(20000)
        await btc.connect(user0).transfer(vault.address, expandDecimals(10000, 8).div(BTC_PRICE));
        await vault.connect(user0).increasePosition(user0.address, btc.address, btc.address, sizeDelta, true);

        await defaultCreateDecreaseOrder({ sizeDelta, collateralDelta: 0 });
        const orderBefore = await orderBook.decreaseOrders(user0.address, 0)
        expect(orderBefore.sizeDelta).to.be.eq(sizeDelta)
        await orderExecutor.executeDecreaseOrder(user0.address, 0, user1.address);
        const orderAfter = await orderBook.decreaseOrders(user0.address, 0)
        expect(orderAfter.sizeDelta).to.be.eq(0)
    })
});
