const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals, bigNumberify } = require("../../test/shared/utilities")

const arbitrumData = require("../../distribution-data-arbitrum.json")
const avaxData = require("../../distribution-data-avalanche.json")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('../core/tokens')[network];

const ethPrice = "2375"
const avaxPrice = "45"
const gmxPrice = "28"

const shouldSendTxn = false

const { AddressZero } = ethers.constants

async function getArbValues() {
  const batchSender = await contractAt("BatchSender", "0x1070f775e8eb466154BBa8FA0076C4Adc7FE17e8")
  const esGmx = await contractAt("Token", "0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA")
  const nativeTokenPrice = ethPrice
  const data = arbitrumData
  const gasLimit = "30000000"

  return { batchSender, esGmx, nativeTokenPrice, data, gasLimit }
}

async function getAvaxValues() {
  const batchSender = await contractAt("BatchSender", "0xF0f929162751DD723fBa5b86A9B3C88Dc1D4957b")
  const esGmx = await contractAt("Token", "0xFf1489227BbAAC61a9209A08929E4c2a526DdD17")
  const nativeTokenPrice = avaxPrice
  const data = avaxData
  const gasLimit = "5000000"

  return { batchSender, esGmx, nativeTokenPrice, data, gasLimit }
}

async function getValues() {
  if (network === "arbitrum") {
    return getArbValues()
  }

  if (network === "avax") {
    return getAvaxValues()
  }
}

async function main() {
  const wallet = { address: "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8" }
  const { batchSender, esGmx, nativeTokenPrice, data } = await getValues()
  const { nativeToken } = tokens
  const nativeTokenContract = await contractAt("Token", nativeToken.address)

  const rebatesData = data.referrers
  const discountsData = data.referrals

  console.log("rebates", rebatesData.length)
  console.log("discounts", discountsData.length)

  if (rebatesData.length > 150 || discountsData.length > 150) {
    throw new Error("Batching required")
  }

  const rebatesTypeId = 1
  const discountsTypeId = 2

  let totalRebateAmount = bigNumberify(0)
  let totalRebateUsd = bigNumberify(0)
  let totalDiscountAmount = bigNumberify(0)
  let totalDiscountUsd = bigNumberify(0)
  let totalEsGmxAmount = bigNumberify(0)
  const rebateAccounts = []
  const rebateAmounts = []
  const discountAccounts = []
  const discountAmounts = []
  const esGmxAccounts = []
  const esGmxAmounts = []

  for (let i = 0; i < rebatesData.length; i++) {
    const { account, rebateUsd, esgmxRewardsUsd } = rebatesData[i]
    if (account === AddressZero) { continue }

    const amount = bigNumberify(rebateUsd).mul(expandDecimals(1, 18)).div(expandDecimals(nativeTokenPrice, 30))
    rebateAccounts.push(account)
    rebateAmounts.push(amount)
    totalRebateAmount = totalRebateAmount.add(amount)
    totalRebateUsd = totalRebateUsd.add(rebateUsd)

    if (esgmxRewardsUsd) {
      const esGmxAmount = bigNumberify(esgmxRewardsUsd).mul(expandDecimals(1, 18)).div(expandDecimals(gmxPrice, 30))
      esGmxAccounts.push(account)
      esGmxAmounts.push(esGmxAmount)
      totalEsGmxAmount = totalEsGmxAmount.add(esGmxAmount)
    }
  }

  for (let i = 0; i < discountsData.length; i++) {
    const { account, discountUsd } = discountsData[i]
    if (account === AddressZero) { continue }

    const amount = bigNumberify(discountUsd).mul(expandDecimals(1, 18)).div(expandDecimals(nativeTokenPrice, 30))
    discountAccounts.push(account)
    discountAmounts.push(amount)
    totalDiscountAmount = totalDiscountAmount.add(amount)
    totalDiscountUsd = totalDiscountUsd.add(discountUsd)
  }

  rebatesData.sort((a, b) => {
    if (bigNumberify(a.rebateUsd).gt(b.rebateUsd)) {
      return -1;
    }
    if (bigNumberify(a.rebateUsd).lt(b.rebateUsd)) {
      return 1;
    }

    return 0;
  })

  console.log("top referrer", rebatesData[0].account, rebatesData[0].rebateUsd)

  const totalNativeAmount = totalRebateAmount.add(totalDiscountAmount)
  console.log(`total rebates (${nativeToken.name})`, ethers.utils.formatUnits(totalRebateAmount, 18))
  console.log("total rebates (USD)", ethers.utils.formatUnits(totalRebateUsd, 30))
  console.log(`total discounts (${nativeToken.name})`, ethers.utils.formatUnits(totalDiscountAmount, 18))
  console.log("total discounts (USD)", ethers.utils.formatUnits(totalDiscountUsd, 30))
  console.log(`total ${nativeToken.name}`, ethers.utils.formatUnits(totalNativeAmount, 18))
  console.log(`total USD`, ethers.utils.formatUnits(totalRebateUsd.add(totalDiscountUsd), 30))
  console.log(`total esGmx`, ethers.utils.formatUnits(totalEsGmxAmount, 18))

  if (shouldSendTxn) {
    await sendTxn(nativeTokenContract.approve(batchSender.address, totalNativeAmount), "nativeToken.approve")
    await sendTxn(batchSender.sendAndEmit(nativeToken.address, rebateAccounts, rebateAmounts, rebatesTypeId), "batchSender.sendAndEmit(nativeToken, rebates)")
    await sendTxn(batchSender.sendAndEmit(nativeToken.address, discountAccounts, discountAmounts, discountsTypeId), "batchSender.sendAndEmit(nativeToken, discounts)")

    await sendTxn(esGmx.approve(batchSender.address, totalEsGmxAmount), "esGmx.approve")
    await sendTxn(batchSender.sendAndEmit(esGmx.address, esGmxAccounts, esGmxAmounts, rebatesTypeId), "batchSender.sendAndEmit(nativeToken, esGmx)")
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
