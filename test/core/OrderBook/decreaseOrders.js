const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../../shared/fixtures")
const { expandDecimals, reportGasUsed, gasUsed } = require("../../shared/utilities")
const { toChainlinkPrice } = require("../../shared/chainlink")
const { toUsd } = require("../../shared/units")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig } = require("../Vault/helpers")
const { getDefault, validateOrderFields, getTxFees, positionWrapper, defaultCreateDecreaseOrderFactory } = require('./helpers');

use(solidity);

const BTC_PRICE = 60000;
const BNB_PRICE = 300;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

describe("OrderBook, decrease position orders", () => {
    const provider = waffle.provider
    const [wallet, user0, user1, user2, user3] = provider.getWallets()

    let vault;
    let orderBook;
    let defaults;
    let tokenDecimals;
    let defaultCreateDecreaseOrder

    let usdg
    let router
    let bnb
    let bnbPriceFeed
    let btc
    let btcPriceFeed
    let dai
    let daiPriceFeed
    let vaultPriceFeed

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

        await router.addPlugin(orderBook.address);
        await router.connect(user0).approvePlugin(orderBook.address);

        await btc.mint(user0.address, expandDecimals(1000, 8))
        await btc.connect(user0).approve(router.address, expandDecimals(100, 8))

        await dai.mint(user0.address, expandDecimals(10000000, 18))
        await dai.connect(user0).approve(router.address, expandDecimals(1000000, 18))

        await dai.mint(user0.address, expandDecimals(20000000, 18))
        await dai.connect(user0).transfer(vault.address, expandDecimals(2000000, 18))
        await vault.directPoolDeposit(dai.address);

        await btc.mint(user0.address, expandDecimals(1000, 8))
        await btc.connect(user0).transfer(vault.address, expandDecimals(100, 8))
        await vault.directPoolDeposit(btc.address);

        await bnb.mint(user0.address, expandDecimals(50000, 18))
        await bnb.connect(user0).transfer(vault.address, expandDecimals(10000, 18))
        await vault.directPoolDeposit(bnb.address);

        defaults = {
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
        };

        defaultCreateDecreaseOrder = defaultCreateDecreaseOrderFactory(orderBook, defaults)
    });

    async function getCreatedDecreaseOrder(address, orderIndex = 0) {
        const order = await orderBook.decreaseOrders(address, orderIndex);
        return order;
    }

    /*
    checklist:
    [x] create order, low execution fee => revert
    [x] create order, transferred ETH != execution fee => revert
    [x] create order, order is retrievable
    [x] executionFee transferred to OrderBook
    [x] cancel order, delete order
    [x] and user got back execution fee
    [x] if cancelling order doesnt not exist => revert
    [x] update order, all fields are new
    [x] if user doesn't have such order => revert
    [x] two orders retreivable
    [x] execute order, if doesnt exist => revert
    [x] if price is not valid => revert
    [x] delete order
    [x] position was decreased
    [x] if collateral is weth => transfer BNB funds
    [x] otherwise transfer token
    [x] and transfer executionFee
    [x] partial decrease
    */

    it("Create decrase order, bad fee", async() => {
    	await expect(defaultCreateDecreaseOrder({
    		executionFee: 100
    	})).to.be.revertedWith("OrderBook: insufficient execution fee");
    })

    it("Create decrease order, long", async () => {
        const tx = await defaultCreateDecreaseOrder();
        reportGasUsed(provider, tx, 'createDecreaseOrder gas used');
        let order = await getCreatedDecreaseOrder(defaults.user.address);
        const btcBalanceAfter = await btc.balanceOf(orderBook.address);

        expect(await bnb.balanceOf(orderBook.address), 'BNB balance').to.be.equal(defaults.executionFee);

        validateOrderFields(order, {
            account: defaults.user.address,
            indexToken: btc.address,
            sizeDelta: defaults.sizeDelta,
            collateralToken: defaults.collateralToken,
            collateralDelta: defaults.collateralDelta,
            isLong: true,
            triggerPrice: defaults.triggerPrice,
            triggerAboveThreshold: true,
            executionFee: defaults.executionFee
        });
    });

    it("updateDecreaseOrder", async () => {
        await defaultCreateDecreaseOrder();

        const newSizeDelta = defaults.sizeDelta.add(100);
        const newTriggerPrice = defaults.triggerPrice.add(100);
        const newTriggerAboveThreshold = !defaults.triggerAboveThreshold;
        const newCollateralDelta = defaults.collateralDelta.add(100);

        await expect(orderBook.connect(user1).updateDecreaseOrder(
            0, newCollateralDelta, newSizeDelta, newTriggerPrice, newTriggerAboveThreshold
        )).to.be.revertedWith("OrderBook: non-existent order");

        const tx2 = await orderBook.connect(defaults.user).updateDecreaseOrder(
            0, newCollateralDelta, newSizeDelta, newTriggerPrice, newTriggerAboveThreshold
        );
        reportGasUsed(provider, tx2, 'updateDecreaseOrder gas used');

        order = await getCreatedDecreaseOrder(user0.address);

        validateOrderFields(order, {
            sizeDelta: newSizeDelta,
            collateralDelta: newCollateralDelta,
            triggerPrice: newTriggerPrice,
            triggerAboveThreshold: newTriggerAboveThreshold
        });
    });

    it("Create decrease order, short", async () => {
        const tx = await defaultCreateDecreaseOrder({
            isLong: false
        });
        reportGasUsed(provider, tx, 'createDecreaseOrder gas used');
        const order = await getCreatedDecreaseOrder(defaults.user.address);
        const btcBalanceAfter = await btc.balanceOf(orderBook.address);

        expect(await bnb.balanceOf(orderBook.address), 'BNB balance').to.be.equal(defaults.executionFee);

        validateOrderFields(order, {
            account: defaults.user.address,
            indexToken: btc.address,
            sizeDelta: defaults.sizeDelta,
            collateralToken: defaults.collateralToken,
            collateralDelta: defaults.collateralDelta,
            isLong: false,
            triggerPrice: defaults.triggerPrice,
            triggerAboveThreshold: true,
            executionFee: defaults.executionFee
        });
    });

    it("Create two orders", async () => {
        await defaultCreateDecreaseOrder({
            sizeDelta: toUsd(1)
        });
        await defaultCreateDecreaseOrder({
            sizeDelta: toUsd(2)
        });

        const order1 = await getCreatedDecreaseOrder(defaults.user.address, 0);
        const order2 = await getCreatedDecreaseOrder(defaults.user.address, 1);

        expect(order1.sizeDelta).to.be.equal(toUsd(1));
        expect(order2.sizeDelta).to.be.equal(toUsd(2));
    });

    it("Execute decrease order, invalid price", async () => {
        await vaultPriceFeed.setPriceSampleSpace(2);
        let triggerPrice, isLong, triggerAboveThreshold, newBtcPrice;
        let orderIndex = 0;

        // decrease long should use min price
        // decrease short should use max price
        for ([triggerPrice, isLong, triggerAboveThreshold, newBtcPrice, setPriceTwice] of [
            [expandDecimals(BTC_PRICE - 1000, 30), true, false, BTC_PRICE - 1050, false],
            [expandDecimals(BTC_PRICE + 1000, 30), true, true, BTC_PRICE + 1050, true],
            [expandDecimals(BTC_PRICE - 1000, 30), false, false, BTC_PRICE - 1050, true],
            [expandDecimals(BTC_PRICE + 1000, 30), false, true, BTC_PRICE + 1050, false]
        ]) {
            // "reset" BTC price
            await btcPriceFeed.setLatestAnswer(toChainlinkPrice(BTC_PRICE));
            await btcPriceFeed.setLatestAnswer(toChainlinkPrice(BTC_PRICE));

            await defaultCreateDecreaseOrder({
                triggerPrice,
                triggerAboveThreshold,
                isLong
            });

            const order = await orderBook.decreaseOrders(defaults.user.address, orderIndex);
            await expect(orderBook.executeDecreaseOrder(order.account, orderIndex, user1.address), 1)
                .to.be.revertedWith("OrderBook: invalid price for execution");

            if (setPriceTwice) {
                // on first price update all limit orders are still invalid
                btcPriceFeed.setLatestAnswer(toChainlinkPrice(newBtcPrice));
                await expect(orderBook.executeDecreaseOrder(order.account, orderIndex, user1.address), 2)
                    .to.be.revertedWith("OrderBook: invalid price for execution");
            }

            // now both min and max prices satisfies requirement
            btcPriceFeed.setLatestAnswer(toChainlinkPrice(newBtcPrice));
            await expect(orderBook.executeDecreaseOrder(order.account, orderIndex, user1.address), 3)
                .to.not.be.revertedWith("OrderBook: invalid price for execution");
            // so we are sure we passed price validations inside OrderBook

            orderIndex++;
        }
    })

    it("Execute decrease order, non-existent", async () => {
        await defaultCreateDecreaseOrder({
            triggerPrice: toUsd(BTC_PRICE - 1000),
            triggerAboveThreshold: false
        });

        await expect(orderBook.executeDecreaseOrder(defaults.user.address, 1, user1.address))
            .to.be.revertedWith("OrderBook: non-existent order");
    });

    it("Execute decrease order, long", async () => {
        await btc.connect(defaults.user).transfer(vault.address, expandDecimals(10000, 8).div(BTC_PRICE));
        await vault.connect(defaults.user).increasePosition(defaults.user.address, btc.address, btc.address, toUsd(20000), true);

        const btcBalanceBefore = await btc.balanceOf(defaults.user.address);
        let position = positionWrapper(await vault.getPosition(defaults.user.address, btc.address, btc.address, true));

        await defaultCreateDecreaseOrder({
            collateralDelta: position.collateral,
            sizeDelta: position.size,
            triggerAboveThreshold: true,
            triggerPrice: toUsd(BTC_PRICE + 5000),
            isLong: true
        });

        const order = await orderBook.decreaseOrders(defaults.user.address, 0);

        await btcPriceFeed.setLatestAnswer(toChainlinkPrice(BTC_PRICE + 5050));

        const executorBalanceBefore = await user1.getBalance();
        const tx = await orderBook.executeDecreaseOrder(defaults.user.address, 0, user1.address);
        reportGasUsed(provider, tx, 'executeDecreaseOrder gas used');

        const executorBalanceAfter = await user1.getBalance();
        expect(executorBalanceAfter).to.be.equal(executorBalanceBefore.add(defaults.executionFee));

        const btcBalanceAfter = await btc.balanceOf(defaults.user.address);
        expect(btcBalanceAfter.sub(btcBalanceBefore)).to.be.equal('17899051');

        position = positionWrapper(await vault.getPosition(defaults.user.address, btc.address, btc.address, defaults.isLong));

        expect(position.size).to.be.equal(0);
        expect(position.collateral).to.be.equal(0);

        const orderAfter = await orderBook.increaseOrders(defaults.user.address, 0);
        expect(orderAfter.account).to.be.equal(ZERO_ADDRESS);
    });

    it("Execute decrease order, short, BTC", async () => {
        await dai.connect(defaults.user).transfer(vault.address, expandDecimals(10000, 18));
        await vault.connect(defaults.user).increasePosition(defaults.user.address, dai.address, btc.address, toUsd(20000), false);

        let position = positionWrapper(await vault.getPosition(defaults.user.address, dai.address, btc.address, false));
        const daiBalanceBefore = await dai.balanceOf(defaults.user.address);

        await defaultCreateDecreaseOrder({
            collateralDelta: position.collateral,
            collateralToken: dai.address,
            sizeDelta: position.size,
            triggerAboveThreshold: false,
            triggerPrice: toUsd(BTC_PRICE - 1000),
            isLong: false
        });
        const executor = user1;

        const order = await orderBook.decreaseOrders(defaults.user.address, 0);

        await btcPriceFeed.setLatestAnswer(toChainlinkPrice(BTC_PRICE - 1500));

        const executorBalanceBefore = await executor.getBalance();

        const tx = await orderBook.executeDecreaseOrder(defaults.user.address, 0, executor.address);
        reportGasUsed(provider, tx, 'executeDecreaseOrder gas used');

        const executorBalanceAfter = await executor.getBalance();
        expect(executorBalanceAfter).to.be.equal(executorBalanceBefore.add(defaults.executionFee));

        const daiBalanceAfter = await dai.balanceOf(defaults.user.address);
        expect(daiBalanceAfter.sub(daiBalanceBefore)).to.be.equal("10460000000000000000000");

        position = positionWrapper(await vault.getPosition(defaults.user.address, btc.address, btc.address, defaults.isLong));

        expect(position.size).to.be.equal(0);
        expect(position.collateral).to.be.equal(0);

        const orderAfter = await orderBook.increaseOrders(defaults.user.address, 0);
        expect(orderAfter.account).to.be.equal(ZERO_ADDRESS);
    });

    it("Execute decrease order, long, BNB", async () => {
        await router.connect(defaults.user).increasePositionETH(
            [bnb.address],
            bnb.address,
            0,
            toUsd(3000),
            true,
            toUsd(301),
            {value: expandDecimals(5, 18)}
        );

        let position = positionWrapper(await vault.getPosition(defaults.user.address, bnb.address, bnb.address, true));

        const userTx = await defaultCreateDecreaseOrder({
            collateralDelta: position.collateral.div(2),
            collateralToken: bnb.address,
            indexToken: bnb.address,
            sizeDelta: position.size.div(2),
            triggerAboveThreshold: false,
            triggerPrice: toUsd(BTC_PRICE - 1000),
            isLong: true
        });

        reportGasUsed(provider, userTx, 'createSwapOrder');
        const userTxFee = await getTxFees(provider, userTx);
        const order = await orderBook.decreaseOrders(defaults.user.address, 0);

        await btcPriceFeed.setLatestAnswer(toChainlinkPrice(BTC_PRICE - 1500));

        const executor = user1;

        const balanceBefore = await defaults.user.getBalance();
        const executorBalanceBefore = await executor.getBalance();
        const tx = await orderBook.executeDecreaseOrder(defaults.user.address, 0, executor.address);
        reportGasUsed(provider, tx, 'executeDecreaseOrder gas used');

        const executorBalanceAfter = await executor.getBalance();
        expect(executorBalanceAfter).to.be.equal(executorBalanceBefore.add(defaults.executionFee));

        const balanceAfter = await defaults.user.getBalance();
        const amountOut = '2490000000000000000';
        expect(balanceAfter, 'balanceAfter').to.be.equal(balanceBefore.add(amountOut));

        position = positionWrapper(await vault.getPosition(defaults.user.address, bnb.address, bnb.address, true));

        expect(position.size, 'position.size').to.be.equal('1500000000000000000000000000000000');
        expect(position.collateral, 'position.collateral').to.be.equal('748500000000000000000000000000000');

        const orderAfter = await orderBook.increaseOrders(defaults.user.address, 0);
        expect(orderAfter.account).to.be.equal(ZERO_ADDRESS);
    });

    it("Cancel decrease order", async () => {
        await defaultCreateDecreaseOrder();
        let order = await getCreatedDecreaseOrder(defaults.user.address);
        expect(order.account).to.not.be.equal(ZERO_ADDRESS);

        await expect(orderBook.connect(defaults.user).cancelDecreaseOrder(1))
            .to.be.revertedWith("OrderBook: non-existent order");

        const balanceBefore = await defaults.user.getBalance();
        const tx = await orderBook.connect(defaults.user).cancelDecreaseOrder(0);
        reportGasUsed(provider, tx, 'cancelDecreaseOrder gas used');

        order = await getCreatedDecreaseOrder(defaults.user.address);
        expect(order.account).to.be.equal(ZERO_ADDRESS);

        const txFees = await getTxFees(provider, tx);
        const balanceAfter = await defaults.user.getBalance();
        expect(balanceAfter).to.be.equal(balanceBefore.add(defaults.executionFee).sub(txFees));
    });
});
