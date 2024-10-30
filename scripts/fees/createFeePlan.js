const fs = require('fs')

const { Token: UniToken } = require("@uniswap/sdk-core")
const { Pool } = require("@uniswap/v3-sdk")

const { processPeriodV1, processPeriodV2, getPeriod } = require('../shared/stats');
const { getArbValues: getArbReferralRewardValues, getAvaxValues: getAvaxReferralRewardValues, getReferralRewardsInfo } = require("../referrals/getReferralRewards")
const { getArbValues: getArbKeeperValues, getAvaxValues: getAvaxKeeperValues } = require("../shared/fundAccountsUtils")
const { expandDecimals, formatAmount, parseValue, bigNumberify } = require("../../test/shared/utilities")
const { saveDistributionData } = require("../referrals/distributionData")
const { ARBITRUM, signers, contractAt } = require("../shared/helpers")
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

const DataStore = require("../../artifacts-v2/contracts/data/DataStore.sol/DataStore.json")

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000
const MILLISECONDS_PER_WEEK = 7 * MILLISECONDS_PER_DAY

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

const MULTIPLIER = process.env.MULTIPLIER || 10000

const SKIP_VALIDATIONS = process.env.SKIP_VALIDATIONS

const allTokens = require('../core/tokens')

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

function roundToNearestWeek(timestamp, dayOffset) {
  return parseInt(timestamp / MILLISECONDS_PER_WEEK) * MILLISECONDS_PER_WEEK + dayOffset * MILLISECONDS_PER_DAY
}

async function getInfoTokens(vault, reader, nativeToken, tokenArr) {
  const vaultTokenInfo = await reader.getVaultTokenInfo(
    vault.address,
    nativeToken.address,
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

    // console.log("vaultTokenInfo", i * vaultPropsLength)
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
    // console.log("token", token)

    infoTokens[token.address] = token
  }

  return infoTokens
}

async function getArbFeeValues() {
  const signer = signers.arbitrum
  const dataStore = new ethers.Contract("0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8", DataStore.abi, providers.arbitrum)
  const vault = await contractAt("Vault", "0x489ee077994B6658eAfA855C308275EAd8097C4A", signer)
  const reader = await contractAt("Reader", "0x2b43c90D1B727cEe1Df34925bcd5Ace52Ec37694", signer)
  const gmx = await contractAt("GMX", "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a", signer)

  const tokens = allTokens.arbitrum
  const nativeToken = await contractAt("Token", tokens.nativeToken.address, signer)
  const tokenInfo = await getInfoTokens(vault, reader, tokens.nativeToken, [tokens.nativeToken])
  const nativeTokenPrice = tokenInfo[tokens.nativeToken.address].maxPrice

  const withdrawableGmxAmountKey = keys.withdrawableBuybackTokenAmountKey(gmx.address)
  const withdrawableGmx = await dataStore.getUint(withdrawableGmxAmountKey)

  const withdrawableNativeTokenAmountKey = keys.withdrawableBuybackTokenAmountKey(tokens.nativeToken.address)
  const withdrawableNativeToken = await dataStore.getUint(withdrawableNativeTokenAmountKey)

  const feeKeeperGmxBalance = await gmx.balanceOf(FEE_KEEPER)
  const feeKeeperNativeTokenBalance = await nativeToken.balanceOf(FEE_KEEPER)

  const totalGmxBalance = withdrawableGmx.add(feeKeeperGmxBalance)
  const totalNativeTokenBalance = withdrawableNativeToken.add(feeKeeperNativeTokenBalance)

  const feesV1 = await processPeriodV1('prev', 'arbitrum')
  const feesV2 = await processPeriodV2('prev', 'arbitrum')
  console.log("feesV2", feesV2)

  const stakedGmx = await contractAt("Token", "0xd2D1162512F927a7e282Ef43a362659E4F2a728F", signer)
  const stakedGmxSupply = await stakedGmx.totalSupply()

  const { totalTransferAmount: keeperCosts } = await getArbKeeperValues()

  return {
    nativeTokenPrice,
    totalGmxBalance,
    totalNativeTokenBalance,
    feesV1,
    feesV2,
    stakedGmxSupply,
    keeperCosts
  }
}

async function getAvaxFeeValues() {
  const signer = signers.avax
  const dataStore = new ethers.Contract("0x2F0b22339414ADeD7D5F06f9D604c7fF5b2fe3f6", DataStore.abi, providers.avax)
  const vault = await contractAt("Vault", "0x9ab2De34A33fB459b538c43f251eB825645e8595", signer)
  const reader = await contractAt("Reader", "0x2eFEE1950ededC65De687b40Fd30a7B5f4544aBd", signer)
  const gmx = await contractAt("GMX", "0x62edc0692BD897D2295872a9FFCac5425011c661", signer)

  const tokens = allTokens.avax
  const nativeToken = await contractAt("Token", tokens.nativeToken.address, signer)
  const tokenInfo = await getInfoTokens(vault, reader, tokens.nativeToken, [tokens.nativeToken])
  const nativeTokenPrice = tokenInfo[tokens.nativeToken.address].maxPrice

  const withdrawableGmxAmountKey = keys.withdrawableBuybackTokenAmountKey(gmx.address)
  const withdrawableGmx = await dataStore.getUint(withdrawableGmxAmountKey)

  const withdrawableNativeTokenAmountKey = keys.withdrawableBuybackTokenAmountKey(tokens.nativeToken.address)
  const withdrawableNativeToken = await dataStore.getUint(withdrawableNativeTokenAmountKey)

  const feeKeeperGmxBalance = await gmx.balanceOf(FEE_KEEPER)
  const feeKeeperNativeTokenBalance = await nativeToken.balanceOf(FEE_KEEPER)

  const totalGmxBalance = withdrawableGmx.add(feeKeeperGmxBalance)
  const totalNativeTokenBalance = withdrawableNativeToken.add(feeKeeperNativeTokenBalance)

  const feesV1 = await processPeriodV1('prev', 'avalanche')
  const feesV2 = await processPeriodV2('prev', 'avalanche')

  const stakedGmx = await contractAt("Token", "0x4d268a7d4C16ceB5a606c173Bd974984343fea13", signer)
  const stakedGmxSupply = await stakedGmx.totalSupply()

  const { totalTransferAmount: keeperCosts } = await getAvaxKeeperValues()
  console.log("avax keeperCosts", keeperCosts.toString())

  return {
    nativeTokenPrice,
    totalGmxBalance,
    totalNativeTokenBalance,
    feesV1,
    feesV2,
    stakedGmxSupply,
    keeperCosts
  }
}

async function getFeeValues() {
  const values = {
      arbitrum: await getArbFeeValues(),
      avax: await getAvaxFeeValues()
  }

  const [start, end] = getPeriod('prev')

  const gmxPrice = await getGmxPrice(values.arbitrum.nativeTokenPrice)

  return {
    ...values,
    start,
    end,
    gmxPrice
  }
}

function getRefTime() {
  const refTimestamp = roundToNearestWeek(Date.now(), 6)
  const refDate = new Date(refTimestamp)
  const dayName = DAY_NAMES[refDate.getDay()]
  if (dayName !== "Wednesday") {
    throw new Error(`unexpected day: ${dayName}`)
  }

  if (SKIP_VALIDATIONS !== "true" && refTimestamp > Date.now()) {
    throw new Error(`refTimestamp is later than current time ${refTimestamp}`)
  }

  const allowedDelay = 6 * 60 * 60 * 1000
  if (refTimestamp < Date.now() - allowedDelay) {
    throw new Error(`refTimestamp is older than the allowed delay`)
  }

  return { refTimestamp, refDate }
}

async function saveFeePlan({ feeValues, referralValues, refTimestamp }) {
  const values = feeValues

  const totalWethAvailable = values.arbitrum.totalNativeTokenBalance
  const wethPrice = values.arbitrum.nativeTokenPrice

  const v1FeesUsdArb = values.arbitrum.feesV1
  const v2FeesUsdArb = values.arbitrum.feesV2.mul(10).div(100)
  console.log("v1FeesUsdArb", v1FeesUsdArb.toString())
  console.log("v2FeesUsdArb", v2FeesUsdArb.toString())

  const totalFeesUsdArb = v1FeesUsdArb.add(v2FeesUsdArb)

  const treasuryChainlinkWethAmount = totalWethAvailable.mul(v2FeesUsdArb).div(totalFeesUsdArb)

  const treasuryWethAmount = treasuryChainlinkWethAmount.mul(88).div(100).mul(MULTIPLIER).div(10000)
  const chainlinkWethAmount = treasuryChainlinkWethAmount.mul(12).div(100).mul(MULTIPLIER).div(10000)

  console.log("totalWethAvailable", totalWethAvailable.toString())
  console.log("treasuryWethAmount", treasuryWethAmount.toString())
  console.log("chainlinkWethAmount", chainlinkWethAmount.toString())

  let remainingWeth = totalWethAvailable.sub((treasuryWethAmount).add(chainlinkWethAmount))
  console.log("remainingWeth", remainingWeth.toString())

  const keeperCostsWeth = values.arbitrum.keeperCosts
  console.log("keeperCostsWeth", keeperCostsWeth.toString())
  remainingWeth = remainingWeth.sub(keeperCostsWeth)

  const referralRewardsUsdArb = referralValues.arbitrum.allAffiliateUsd.add(referralValues.arbitrum.allDiscountUsd)
  const referralRewardsWeth = referralRewardsUsdArb.mul(expandDecimals(1, 18)).div(wethPrice)
  console.log("referralRewardsUsdArb", referralRewardsUsdArb.toString())
  console.log("wethPrice", wethPrice.toString())
  console.log("referralRewardsWeth", referralRewardsWeth.toString())
  remainingWeth = remainingWeth.sub(referralRewardsWeth)

  console.log("totalWethAvailable", totalWethAvailable.toString(), treasuryChainlinkWethAmount.toString())
  const expectedGlpWethAmount = totalWethAvailable.sub(treasuryChainlinkWethAmount)
  console.log("expectedGlpWethAmount", expectedGlpWethAmount.toString())
  console.log("remainingWeth", remainingWeth.toString())

  const remainingPercentageWeth = remainingWeth.mul(100).div(expectedGlpWethAmount)
  console.log("remainingPercentageWeth", remainingPercentageWeth.toString())
  if (remainingPercentageWeth.lt(80)) {
    throw new Error('GLP fees are less than 80% of expected on Arbitrum. Adjust the multiplier.')
  }

  const totalWavaxAvailable = values.avax.totalNativeTokenBalance
  const wavaxPrice = values.avax.nativeTokenPrice
  const totalWavaxUsdValue = totalWavaxAvailable.mul(wavaxPrice)

  const v1FeesUsdAvax = values.avax.feesV1
  const v2FeesUsdAvax = values.avax.feesV2.mul(10).div(100)

  const totalFeesUsdAvax = v1FeesUsdAvax.add(v2FeesUsdAvax)

  const treasuryChainlinkWavaxAmount = totalWavaxAvailable.mul(v2FeesUsdAvax).div(totalFeesUsdAvax)

  const treasuryWavaxAmount = treasuryChainlinkWavaxAmount.mul(88).div(100).mul(MULTIPLIER).div(10000)
  const chainlinkWavaxAmount = treasuryChainlinkWavaxAmount.mul(12).div(100).mul(MULTIPLIER).div(10000)

  let remainingWavax = totalWavaxAvailable.sub((treasuryWavaxAmount).add(chainlinkWavaxAmount))

  const keeperCostsWavax = values.avax.keeperCosts
  remainingWavax = remainingWavax.sub(keeperCostsWavax)

  const referralRewardsUsdAvax = referralValues.avax.allAffiliateUsd.add(referralValues.avax.allDiscountUsd)
  const referralRewardsWavax = referralRewardsUsdAvax.mul(expandDecimals(1, 18)).div(wavaxPrice)
  remainingWavax = remainingWavax.sub(referralRewardsWavax)

  const expectedGlpWavaxAmount = totalWavaxAvailable.sub(treasuryChainlinkWavaxAmount)

  const remainingPercentageWavax = remainingWavax.mul(100).div(expectedGlpWavaxAmount)
  console.log("remainingPercentageWavax", remainingPercentageWavax.toString())

  if (remainingWavax.mul(100).div(expectedGlpWavaxAmount).lt(80)) {
    throw new Error('GLP fees are less than 80% of expected on Avalanche. Adjust the multiplier.')
  }

  const totalArbGmxAvailable = values.arbitrum.totalGmxBalance

  const totalAvaxGmxAvailable = values.avax.totalGmxBalance

  const arbStaked = values.arbitrum.stakedGmxSupply
  const avaxStaked = values.avax.stakedGmxSupply
  const totalStaked = arbStaked.add(avaxStaked)

  const totalGmxAvailable = totalArbGmxAvailable.add(totalAvaxGmxAvailable)
  const requiredAvaxGmxRewards = totalGmxAvailable.mul(avaxStaked).div(totalStaked)
  const requiredArbGmxRewards = totalGmxAvailable.sub(requiredAvaxGmxRewards)
  const deltaRewardsArb = totalArbGmxAvailable.sub(requiredArbGmxRewards)
  const amountToBridge = deltaRewardsArb.abs()

  const data = {
    nativeTokenBalance: {
      arbitrum: totalWethAvailable.toString(),
      avalanche: totalWavaxAvailable.toString(),
    },
    gmxTokenBalance: {
      arbitrum: values.arbitrum.totalGmxBalance.toString(),
      avalanche: values.avax.totalGmxBalance.toString(),
    },
    treasuryFees: {
      arbitrum: treasuryWethAmount.toString(),
      avalanche: treasuryWavaxAmount.toString()
    },
    chainlinkFees: {
      arbitrum: chainlinkWethAmount.toString(),
      avalanche: chainlinkWavaxAmount.toString()
    },
    keeperCosts: {
      arbitrum: keeperCostsWeth.toString(),
      avalanche: keeperCostsWavax.toString()
    },
    referralRewards: {
      arbitrum: referralRewardsWeth.toString(),
      avalanche: referralRewardsWavax.toString()
    },
    glpRewards: {
      arbitrum: remainingWeth.toString(),
      avalanche: remainingWavax.toString()
    },
    gmxRewards: {
      arbitrum: requiredArbGmxRewards.toString(),
      avalanche: requiredAvaxGmxRewards.toString()
    },
    nativeTokenPrice: {
      arbitrum: values.arbitrum.nativeTokenPrice.toString(),
      avax: values.avax.nativeTokenPrice.toString(),
    },
    gmxPrice: values.gmxPrice.toString(),
    refTimestamp: refTimestamp,
    deltaRewardArb: deltaRewardsArb.toString(),
    amountToBridge: amountToBridge.toString()
  }

  const expectedNativeTokenBalance = {
    arbitrum: bigNumberify(data.treasuryFees.arbitrum)
      .add(data.chainlinkFees.arbitrum)
      .add(data.keeperCosts.arbitrum)
      .add(data.referralRewards.arbitrum)
      .add(data.glpRewards.arbitrum),

    avalanche: bigNumberify(data.treasuryFees.avalanche)
      .add(data.chainlinkFees.avalanche)
      .add(data.keeperCosts.avalanche)
      .add(data.referralRewards.avalanche)
      .add(data.glpRewards.avalanche),
  }

  const expectedGmxTokenBalance = bigNumberify(data.gmxRewards.arbitrum).add(data.gmxRewards.avalanche)

  if (bigNumberify(data.nativeTokenBalance.arbitrum).lt(expectedNativeTokenBalance.arbitrum)) {
    throw new Error(`Insufficient nativeTokenBalance.arbitrum: ${data.nativeTokenBalance.arbitrum}, ${expectedNativeTokenBalance.arbitrum.toString()}`)
  }

  if (bigNumberify(data.nativeTokenBalance.avalanche).lt(expectedNativeTokenBalance.avalanche)) {
    throw new Error(`Insufficient nativeTokenBalance.avalanche: ${data.nativeTokenBalance.avalanche}, ${expectedNativeTokenBalance.avalanche.toString()}`)
  }

  if (bigNumberify(data.gmxTokenBalance.arbitrum).add(data.gmxTokenBalance.avalanche).lt(expectedGmxTokenBalance)) {
    throw new Error(`Insufficient gmxTokenBalance: ${bigNumberify(data.gmxTokenBalance.arbitrum).add(data.gmxTokenBalance.avalanche).toString()}, ${expectedGmxTokenBalance.toString()}`)
  }

  console.info("data", data)

  if (deltaRewardsArb.gt(0)) {
    console.info(`Bridge ${formatAmount(amountToBridge, 18, 4, true)} GMX from Arbitrum to Avalanche to equalize APRs`)
  } else if (deltaRewardsArb.lt(0)) {
    console.info(`Bridge ${formatAmount(amountToBridge, 18, 4, true)} GMX from Avalanche to Arbitrum to equalize APRs`)
  } else {
    console.info('No bridging needed. APRs are already equal')
  }

  console.info(`ETH price: $${formatAmount(data.nativeTokenPrice.arbitrum, 30, 2, true)}`)
  console.info(`AVAX price: $${formatAmount(data.nativeTokenPrice.avax, 30, 2, true)}`)

  // more console logs to be added

  const filename = `./fee-plan.json`
  fs.writeFileSync(filename, JSON.stringify(data, null, 4))
}

async function createReferralRewardsRef({ refTimestamp, gmxPrice }) {
  console.log("gmxPrice", gmxPrice.toString())
  const toTimestampMs = refTimestamp
  const fromTimestampMs = toTimestampMs - MILLISECONDS_PER_WEEK
  const toTimestamp = toTimestampMs / 1000
  const fromTimestamp = fromTimestampMs / 1000

  const account = undefined
  const esGmxRewards = "5000"

  await saveDistributionData(
    "arbitrum",
    fromTimestamp,
    toTimestamp,
    account,
    gmxPrice,
    esGmxRewards
  )

  await saveDistributionData(
    "avalanche",
    fromTimestamp,
    toTimestamp,
    account,
    gmxPrice,
    esGmxRewards
  )
}

async function main() {
  const { refTimestamp } = getRefTime()
  const feeValues = await getFeeValues()
  console.log("feeValues", feeValues)
  console.log("feeValues.gmxPrice", feeValues.gmxPrice.toString())

  await createReferralRewardsRef({
    refTimestamp,
    gmxPrice: Math.ceil(formatAmount(feeValues.gmxPrice, 30, 2)).toString()
  })

  const referralValues = {
    arbitrum: getReferralRewardsInfo((await getArbReferralRewardValues()).data),
    avax: getReferralRewardsInfo((await getAvaxReferralRewardValues()).data)
  }

  await saveFeePlan({ feeValues, referralValues, refTimestamp })
}

main()
