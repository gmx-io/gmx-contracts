const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed } = require("../shared/utilities")
const { initVault } = require("../core/Vault/helpers")
const { toChainlinkPrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")

use(solidity)

const PRICE_PRECISION = ethers.BigNumber.from(10).pow(30);

describe("OrderBookReader", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let orderBook;
  let reader;
  let dai;
  let bnb;
  let vault;
  let usdg;
  let router;
  let vaultPriceFeed;

  beforeEach(async () => {
    dai = await deployContract("Token", [])

    btc = await deployContract("Token", [])
    btcPriceFeed = await deployContract("PriceFeed", [])
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(50000))

    bnb = await deployContract("Token", [])

    vault = await deployContract("Vault", [])
    usdg = await deployContract("USDG", [vault.address])
    router = await deployContract("Router", [vault.address, usdg.address, bnb.address])
    vaultPriceFeed = await deployContract("VaultPriceFeed", [])

    await initVault(vault, router, usdg, vaultPriceFeed);
    await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)

    orderBook = await deployContract("OrderBook", [])
    await router.addPlugin(orderBook.address);
    await router.connect(user0).approvePlugin(orderBook.address);
    await orderBook.initialize(
      router.address,
      vault.address,
      bnb.address,
      usdg.address,
      400000, 
      expandDecimals(5, 30) // minPurchseTokenAmountUsd
    );
    reader = await deployContract("OrderBookReader", [])

    await dai.mint(user0.address, expandDecimals(10000000, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(1000000, 18))

    await btc.mint(user0.address, expandDecimals(100, 8))
    await btc.connect(user0).approve(router.address, expandDecimals(100, 8))
  })

  function createSwapOrder(toToken = bnb.address) {
    const executionFee = 500000;

    return orderBook.connect(user0).createSwapOrder(
      [dai.address, toToken],
      expandDecimals(1000, 18),
      expandDecimals(990, 18),
      expandDecimals(1, 30),
      true,
      executionFee,
      false,
      true,
      {value: executionFee}
    );
  }

  function createIncreaseOrder(sizeDelta) {
    const executionFee = 500000;

    return orderBook.connect(user0).createIncreaseOrder(
      [btc.address],
      expandDecimals(1, 8),
      btc.address,
      0,
      sizeDelta,
      btc.address, // collateralToken
      true, // isLong
      toUsd(53000), // triggerPrice
      false, // triggerAboveThreshold
      executionFee,
      false, // shouldWrap
      { value: executionFee }
    );
  }

  function createDecreaseOrder(sizeDelta = toUsd(100000)) {
    const executionFee = 500000;
    return orderBook.connect(user0).createDecreaseOrder(
      btc.address, // indexToken
      sizeDelta, // sizeDelta
      btc.address, // collateralToken
      toUsd(35000), // collateralDelta
      true, // isLong
      toUsd(53000), // triggerPrice
      true, // triggetAboveThreshold
      { value: executionFee }
    );
  }

  function unflattenOrders([uintProps, addressProps], uintLength, addressLength) {
    const count = uintProps.length / uintLength;

    const ret = [];
    for (let i = 0; i < count; i++) {
      const order = addressProps
        .slice(addressLength * i, addressLength * (i + 1))
        .concat(
          uintProps.slice(uintLength * i, uintLength * (i + 1))
        );
      ret.push(order);
    }
    return ret;
  }

  it("getIncreaseOrders", async () => {
    await createIncreaseOrder(toUsd(100000));
    await createIncreaseOrder(toUsd(200000));

    const [order1, order2] = unflattenOrders(await reader.getIncreaseOrders(orderBook.address, user0.address, [0, 1]), 5, 3);

    expect(order1[2]).to.be.equal(btc.address)
    expect(order1[4]).to.be.equal(toUsd(100000))

    expect(order2[2]).to.be.equal(btc.address)
    expect(order2[4]).to.be.equal(toUsd(200000))
  });

  it("getDecreaseOrders", async () => {
    await createDecreaseOrder(toUsd(100000));
    await createDecreaseOrder(toUsd(200000));

    const [order1, order2] = unflattenOrders(await reader.getDecreaseOrders(orderBook.address, user0.address, [0, 1]), 5, 2);

    expect(order1[1]).to.be.equal(btc.address)
    expect(order1[3]).to.be.equal(toUsd(100000))

    expect(order2[1]).to.be.equal(btc.address)
    expect(order2[3]).to.be.equal(toUsd(200000))
  });

	it("getSwapOrders", async () => {
    await createSwapOrder(bnb.address);
    await createSwapOrder(btc.address);

    const [order1, order2] = unflattenOrders(await reader.getSwapOrders(orderBook.address, user0.address, [0, 1]), 4, 3);

    expect(order1[0]).to.be.equal(dai.address);
    expect(order1[1]).to.be.equal(bnb.address);

    expect(order2[0]).to.be.equal(dai.address);
    expect(order2[1]).to.be.equal(btc.address);
	})
});