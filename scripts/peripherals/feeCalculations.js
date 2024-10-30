const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { Token: UniToken } = require("@uniswap/sdk-core")
const { Pool } = require("@uniswap/v3-sdk")

const { ARBITRUM, signers, contractAt } = require("../shared/helpers")
const { expandDecimals, formatAmount, parseValue, bigNumberify } = require("../../test/shared/utilities")
const { getArbValues: getArbKeeperValues, getAvaxValues: getAvaxKeeperValues } = require("../shared/fundAccountsUtils")
const keys = require("../shared/keys")

const {
  ARBITRUM_URL,
  AVAX_URL,
} = require("../../env.json");

const providers = {
  arbitrum: new ethers.providers.JsonRpcProvider(ARBITRUM_URL),
  avax: new ethers.providers.JsonRpcProvider(AVAX_URL)
}

const FEE_KEEPER = "0x43CE1d475e06c65DD879f4ec644B8e0E10ff2b6D"

if (FEE_KEEPER === undefined) {
  throw new Error(`FEE_KEEPER is not defined`)
}

const ReaderV2 = require("../../artifacts-v2/contracts/reader/Reader.sol/Reader.json")
const DataStore = require("../../artifacts-v2/contracts/data/DataStore.sol/DataStore.json")
const Multicall3 = require("../../artifacts-v2/contracts/mock/Multicall3.sol/Multicall3.json")

const allTokens = require('../core/tokens')

const tokensRef = {
  arbitrum: allTokens.arbitrum,
  avax: allTokens.avax
}

function getArbTokens() {
  const { btc, eth, usdce, usdc, link, uni, usdt, mim, frax, dai } = tokensRef.arbitrum
  const tokenArr = [btc, eth, usdce, usdc, link, uni, usdt, frax, dai]

  return tokenArr
}

function getAvaxTokens() {
  const { avax, btc, btcb, eth, mim, usdce, usdc } = tokensRef.avax
  const tokenArr = [avax, btc, btcb, eth, usdce, usdc]

  return tokenArr
}

const tokenArrRef = {
  arbitrum: getArbTokens(),
  avax: getAvaxTokens()
}

async function getInfoTokens(vault, reader, tokens, tokenArr) {
  const vaultTokenInfo = await reader.getVaultTokenInfo(
    vault.address,
    tokens.nativeToken.address,
    expandDecimals(1, 18),
    tokenArr.map(t => t.address)
  )
  console.log("tokenArr.length", tokenArr.length)
  console.log("vaultTokenInfo.length", vaultTokenInfo.length)
  console.log("vaultTokenInfo", vaultTokenInfo)
  const infoTokens = {}
  const vaultPropsLength = 10

  for (let i = 0; i < tokenArr.length; i++) {
    const token = JSON.parse(JSON.stringify(tokenArr[i]))

    console.log("vaultTokenInfo", i * vaultPropsLength)
    token.poolAmount = vaultTokenInfo[i * vaultPropsLength]
    token.reservedAmount = vaultTokenInfo[i * vaultPropsLength + 1]
    token.usdgAmount = vaultTokenInfo[i * vaultPropsLength + 2]
    token.redemptionAmount = vaultTokenInfo[i * vaultPropsLength + 3]
    token.weight = vaultTokenInfo[i * vaultPropsLength + 4]
    token.minPrice = vaultTokenInfo[i * vaultPropsLength + 5]
    token.maxPrice = vaultTokenInfo[i * vaultPropsLength + 6]
    token.guaranteedUsd = vaultTokenInfo[i * vaultPropsLength + 7]
    token.maxPrimaryPrice = vaultTokenInfo[i * vaultPropsLength + 8]
    token.minPrimaryPrice = vaultTokenInfo[i * vaultPropsLength + 9]
    console.log("token", token)

    infoTokens[token.address] = token
  }

  return infoTokens
}

async function getFeesUsd(vault, reader, tokenInfo, tokenArr) {
  const feeAmounts = await reader.getFees(vault.address, tokenArr.map(t => t.address))
  let feesUsd = bigNumberify(0)

  for (let i = 0; i < tokenArr.length; i++) {
    const token = tokenInfo[tokenArr[i].address]
    const feeAmount = feeAmounts[i]
    console.log("getFeesUsd token", token)
    const feeInUsd = feeAmount.mul(token.minPrice).div(expandDecimals(1, token.decimals))
    feesUsd = feesUsd.add(feeInUsd)
  }

  return feesUsd
}

async function getFeesUsdV2({ reader, dataStore, multicall, tickersUrl }) {
  const markets = await reader.getMarkets(dataStore.address, 0, 1000)

  const tokenPricesResponse = await fetch(tickersUrl)
  const tokenPrices = await tokenPricesResponse.json()
  const pricesByTokenAddress = {}

  for (tokenPrice of tokenPrices) {
    pricesByTokenAddress[tokenPrice.tokenAddress.toLowerCase()] = bigNumberify(tokenPrice.minPrice)
  }

  const multicallReadParams = [];
  for (market of markets) {
    const longTokenKey = keys.claimableFeeAmountKey(market.marketToken, market.longToken)
    const shortTokenKey = keys.claimableFeeAmountKey(market.marketToken, market.shortToken)

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [longTokenKey]),
    });

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [shortTokenKey]),
    });
  }

  const stablecoinPrices = {
    ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831".toLowerCase()]: expandDecimals(1, 24), // USDC (Arbitrum)
    ["0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8".toLowerCase()]: expandDecimals(1, 24), // USDC.e (Arbitrum)
    ["0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9".toLowerCase()]: expandDecimals(1, 24), // USDT (Arbitrum)
    ["0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1".toLowerCase()]: expandDecimals(1, 12), // DAI (Arbitrum)

    ["0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e".toLowerCase()]: expandDecimals(1, 24), // USDC (Avalanche)
    ["0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664".toLowerCase()]: expandDecimals(1, 24), // USDC.e (Avalanche)
    ["0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7".toLowerCase()]: expandDecimals(1, 24), // USDT (Avalanche)
    ["0xc7198437980c041c805A1EDcbA50c1Ce5db95118".toLowerCase()]: expandDecimals(1, 24), // USDT.e (Avalanche)
    ["0xd586E7F844cEa2F87f50152665BCbc2C279D8d70".toLowerCase()]: expandDecimals(1, 12), // DAI.e (Avalanche)
  }

  const result = await multicall.callStatic.aggregate3(multicallReadParams);

  let feesUsd = bigNumberify(0)

  for (let i = 0; i < markets.length; i++) {
    const market = markets[i]
    const longTokenFeeAmount = bigNumberify(result[i * 2].returnData)
    const shortTokenFeeAmount = bigNumberify(result[i * 2 + 1].returnData)

    if (longTokenFeeAmount.eq(0) && shortTokenFeeAmount.eq(0)) {
      continue
    }

    let longTokenPrice = pricesByTokenAddress[market.longToken.toLowerCase()]
    let shortTokenPrice = pricesByTokenAddress[market.shortToken.toLowerCase()]

    if (!longTokenPrice) {
      longTokenPrice = stablecoinPrices[market.longToken.toLowerCase()]
    }

    if (!shortTokenPrice) {
      shortTokenPrice = stablecoinPrices[market.shortToken.toLowerCase()]
    }

    if (!longTokenPrice) {
      throw new Error(`missing longTokenPrice for ${market.longToken}`)
    }
    if (!shortTokenPrice) {
      throw new Error(`missing shortTokenPrice for ${market.shortToken}`)
    }

    const longTokenFeeUsd = longTokenFeeAmount.mul(longTokenPrice)
    const shortTokenFeeUsd = shortTokenFeeAmount.mul(shortTokenPrice)

    console.info(`v2 fee ${market.marketToken.toLowerCase()} ${market.longToken.toLowerCase()}: ${longTokenFeeAmount.toString()}, ${longTokenPrice.toString()}, ${longTokenFeeUsd.toString()}`)
    console.info(`v2 fee ${market.marketToken.toLowerCase()} ${market.shortToken.toLowerCase()}: ${shortTokenFeeAmount.toString()}, ${shortTokenPrice.toString()}, ${shortTokenFeeUsd.toString()}`)

    feesUsd = feesUsd.add(longTokenFeeUsd)

    // skip duplicate fees if longToken and shortToken are the same
    if (market.longToken.toLowerCase() === market.shortToken.toLowerCase()) {
      continue
    }

    feesUsd = feesUsd.add(shortTokenFeeUsd)
  }

  console.info("v2 feesUsd", formatAmount(feesUsd, 30))

  return feesUsd
}

async function getGmxPrice(ethPrice) {
  const uniPool = await contractAt("UniPool", "0x80A9ae39310abf666A87C743d6ebBD0E8C42158E", signers.arbitrum)
  const uniPoolSlot0 = await uniPool.slot0()

  const tokenA = new UniToken(ARBITRUM, "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", 18, "SYMBOL", "NAME");
  const tokenB = new UniToken(ARBITRUM, "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a", 18, "SYMBOL", "NAME");

  const pool = new Pool(
    tokenA, // tokenA
    tokenB, // tokenB
    10000, // fee
    uniPoolSlot0.sqrtPriceX96, // sqrtRatioX96
    1, // liquidity
    uniPoolSlot0.tick, // tickCurrent
    []
  );

  const poolTokenPrice = pool.priceOf(tokenB).toSignificant(6);
  const poolTokenPriceAmount = parseValue(poolTokenPrice, 18);
  return poolTokenPriceAmount.mul(ethPrice).div(expandDecimals(1, 18));
}

async function getArbValues() {
  const signer = signers.arbitrum
  const vault = await contractAt("Vault", "0x489ee077994B6658eAfA855C308275EAd8097C4A", signer)
  const reader = await contractAt("Reader", "0x2b43c90D1B727cEe1Df34925bcd5Ace52Ec37694", signer)

  const readerV2 = new ethers.Contract("0x38d91ED96283d62182Fc6d990C24097A918a4d9b", ReaderV2.abi, providers.arbitrum)
  const dataStore = new ethers.Contract("0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8", DataStore.abi, providers.arbitrum)
  const multicall = new ethers.Contract("0xe79118d6D92a4b23369ba356C90b9A7ABf1CB961", Multicall3.abi, providers.arbitrum)
  const tickersUrl = "https://arbitrum-api.gmxinfra.io/prices/tickers"

  const tokens = allTokens.arbitrum
  const tokenArr = tokenArrRef.arbitrum
  const tokenInfo = await getInfoTokens(vault, reader, tokens, tokenArr)
  const nativeTokenPrice = tokenInfo[tokens.nativeToken.address].maxPrice

  const gmx = await contractAt("GMX", "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a", signer)
  const nativeToken = await contractAt("Token", tokens.nativeToken.address, signer)

  const withdrawableGmxAmountKey = keys.withdrawableBuybackTokenAmountKey(gmx.address)
  const withdrawableGmx = await dataStore.getUint(withdrawableGmxAmountKey)

  const withdrawableNativeTokenAmountKey = keys.withdrawableBuybackTokenAmountKey(tokens.nativeToken.address)
  const withdrawableNativeToken = await dataStore.getUint(withdrawableNativeTokenAmountKey)

  const feeKeeperGmxBalance = await gmx.balanceOf(FEE_KEEPER)
  const feeKeeperNativeTokenBalance = await nativeToken.balanceOf(FEE_KEEPER)

  const totalGmxBalance = withdrawableGmx.add(feeKeeperGmxBalance)
  const totalNativeTokenBalance = withdrawableNativeToken.add(feeKeeperNativeTokenBalance)

  let feesUsd = await getFeesUsd(vault, reader, tokenInfo, tokenArr)
  const feesUsdV2 = await getFeesUsdV2({ reader: readerV2, dataStore, multicall, tickersUrl })
  const totalFeesUsdV2 = feesUsdV2.mul(100).div(37)

  const stakedGmx = await contractAt("Token", "0xd2D1162512F927a7e282Ef43a362659E4F2a728F", signer)
  const stakedGmxSupply = await stakedGmx.totalSupply()
  const { totalTransferAmount: keeperCosts } = await getArbKeeperValues()
  const glpManager = await contractAt("GlpManager", "0x321F653eED006AD1C29D174e17d96351BDe22649", signer)
  const glpAum = await glpManager.getAum(true)

  return { vault, reader, tokens, tokenInfo, nativeTokenPrice, feesUsd, feesUsdV2, totalFeesUsdV2, stakedGmx, stakedGmxSupply, keeperCosts, glpManager, glpAum, totalGmxBalance, totalNativeTokenBalance }
}

async function getAvaxValues() {
  const signer = signers.avax
  const vault = await contractAt("Vault", "0x9ab2De34A33fB459b538c43f251eB825645e8595", signer)
  const reader = await contractAt("Reader", "0x2eFEE1950ededC65De687b40Fd30a7B5f4544aBd", signer)

  const readerV2 = new ethers.Contract("0x1D5d64d691FBcD8C80A2FD6A9382dF0fe544cBd8", ReaderV2.abi, providers.avax)
  const dataStore = new ethers.Contract("0x2F0b22339414ADeD7D5F06f9D604c7fF5b2fe3f6", DataStore.abi, providers.avax)
  const multicall = new ethers.Contract("0x50474CAe810B316c294111807F94F9f48527e7F8", Multicall3.abi, providers.avax)
  const tickersUrl = "https://avalanche-api.gmxinfra2.io/prices/tickers"

  const tokens = allTokens.avax
  const tokenArr = tokenArrRef.avax
  const tokenInfo = await getInfoTokens(vault, reader, tokens, tokenArr)
  const nativeTokenPrice = tokenInfo[tokens.nativeToken.address].maxPrice

  const gmx = await contractAt("GMX", "0x62edc0692BD897D2295872a9FFCac5425011c661", signer)
  const nativeToken = await contractAt("Token", tokens.nativeToken.address, signer)

  const withdrawableGmxAmountKey = keys.withdrawableBuybackTokenAmountKey(gmx.address)
  const withdrawableGmx = await dataStore.getUint(arbWithdrawableGmxAmountKey)

  const withdrawableNativeTokenAmountKey = keys.withdrawableBuybackTokenAmountKey(tokens.nativeToken.address)
  const withdrawableNativeToken = await dataStore.getUint(withdrawableNativeTokenAmountKey)

  const feeKeeperGmxBalance = await gmx.balanceOf(FEE_KEEPER)
  const feeKeeperNativeTokenBalance = await nativeToken.balanceOf(FEE_KEEPER)

  const totalGmxBalance = withdrawableGmx.add(feeKeeperGmxBalance)
  const totalNativeTokenBalance = withdrawableNativeToken.add(feeKeeperNativeTokenBalance)

  const feesUsd = await getFeesUsd(vault, reader, tokenInfo, tokenArr)
  const feesUsdV2 = await getFeesUsdV2({ reader: readerV2, dataStore, multicall, tickersUrl })
  const totalFeesUsdV2 = feesUsdV2.mul(100).div(37)

  const stakedGmx = await contractAt("Token", "0x4d268a7d4C16ceB5a606c173Bd974984343fea13", signer)
  const stakedGmxSupply = await stakedGmx.totalSupply()
  const { totalTransferAmount: keeperCosts } = await getAvaxKeeperValues()
  const glpManager = await contractAt("GlpManager", "0xe1ae4d4b06A5Fe1fc288f6B4CD72f9F8323B107F", signer)
  const glpAum = await glpManager.getAum(true)

  return { vault, reader, tokens, tokenInfo, nativeTokenPrice, feesUsd, feesUsdV2, totalFeesUsdV2, stakedGmx, stakedGmxSupply, keeperCosts, glpManager, glpAum, totalGmxBalance, totalNativeTokenBalance }
}

module.exports = {
  tokenArrRef,
  getArbValues,
  getAvaxValues,
  getGmxPrice,
}
