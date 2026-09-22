const bs58 = require('bs58')
const { hexZeroPad } = require('@ethersproject/bytes')
const { BigNumber } = require('ethers')

const { ChainType, endpointIdToChainType } = require('@layerzerolabs/lz-definitions')
const { waitForTxn } = require("./helpers")

const ERC20MinimalABI = require('../../abi/ERC20Minimal.json')
const IOFTArtifact = require('../../abi/IOFT.json')

const DEFAULT_EIGHTEEN_DECIMAL_CONVERSION_RATE = "1000000000000"

const makeBytes32 = (bytes) => hexZeroPad(bytes || '0x0', 32)

function roundAmount(amount, conversionRate = DEFAULT_EIGHTEEN_DECIMAL_CONVERSION_RATE) {
  const rate = BigNumber.from(conversionRate)
  const value = BigNumber.from(amount)
  if (rate.lte(1)) {
    return value
  }
  return value.div(rate).mul(rate)
}

async function getDecimalConversionRate(oft, decimals) {
  try {
    const rate = await oft.decimalConversionRate()
    if (rate && rate.gt(0)) {
      return rate
    }
  } catch (error) {
    // Fall through to sharedDecimals / default
  }

  try {
    const sharedDecimals = await oft.sharedDecimals()
    const dustDecimals = decimals - sharedDecimals
    if (dustDecimals <= 0) {
      return BigNumber.from(1)
    }
    return BigNumber.from(10).pow(dustDecimals)
  } catch (error) {
    // Fall through to decimal default
  }

  if (decimals === 18) {
    return BigNumber.from(DEFAULT_EIGHTEEN_DECIMAL_CONVERSION_RATE)
  }
  return BigNumber.from(1)
}

async function resolveMinAmount({ oft, sendParam, amount, minAmount, slippageBps = 0 }) {
  let quotedMin
  try {
    const [, , receipt] = await oft.quoteOFT(sendParam)
    quotedMin = receipt.amountReceivedLD
    console.info(`quoteOFT amountSentLD: ${receipt.amountSentLD.toString()}`)
    console.info(`quoteOFT amountReceivedLD: ${quotedMin.toString()}`)
  } catch (error) {
    console.info(`quoteOFT unavailable, using provided minAmount: ${error.message}`)
  }

  let minAmountLD = quotedMin || (minAmount != null ? BigNumber.from(minAmount) : BigNumber.from(amount))
  if (minAmount != null) {
    const providedMin = BigNumber.from(minAmount)
    if (providedMin.lt(minAmountLD)) {
      minAmountLD = providedMin
    }
  }

  if (slippageBps > 0) {
    minAmountLD = minAmountLD.mul(10000 - slippageBps).div(10000)
  }

  if (minAmountLD.lte(0)) {
    throw new Error("OFT minAmount is 0 after rounding/quote")
  }

  return minAmountLD
}

async function sendEvm(
  { rpcUrl, key, srcWrapperAddress, srcEid, dstEid, amount, to, minAmount, extraOptions, composeMsg, oftCmd, slippageBps },
  hre
) {
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl)
  const signer = new ethers.Wallet(key).connect(provider)
  const oft = new ethers.Contract(srcWrapperAddress, IOFTArtifact, signer)

  let tokenAddress
  let decimals
  let erc20Contract = null

  try {
    tokenAddress = await oft.token()
    erc20Contract = new ethers.Contract(tokenAddress, ERC20MinimalABI, signer)
    decimals = await erc20Contract.decimals()
    console.info(`Found underlying token: ${tokenAddress} with ${decimals} decimals`)
  } catch (error) {
    decimals = 18
    console.info(`Using fallback decimals: ${decimals}`)
  }

  const conversionRate = await getDecimalConversionRate(oft, decimals)
  amount = roundAmount(amount, conversionRate)
  if (minAmount != null) {
    minAmount = roundAmount(minAmount, conversionRate)
  }
  console.info(`decimalConversionRate: ${conversionRate.toString()}`)
  console.info(`amountLD: ${amount.toString()}`)

  if (amount.lte(0)) {
    throw new Error("OFT amount is 0 after dust rounding")
  }

  let approvalRequired = Boolean(erc20Contract && tokenAddress && tokenAddress.toLowerCase() !== srcWrapperAddress.toLowerCase())
  try {
    approvalRequired = await oft.approvalRequired()
  } catch (error) {
    // Native OFTs may not expose approvalRequired()
  }

  if (approvalRequired && erc20Contract && tokenAddress) {
    const allowance = await erc20Contract.allowance(signer.address, srcWrapperAddress)
    if (allowance.lt(amount)) {
      const approveTx = await erc20Contract.connect(signer).approve(srcWrapperAddress, amount)
      await waitForTxn(approveTx)
      console.info(`Approved ${amount} tokens for ${srcWrapperAddress}`)
    }
  }

  const dstChain = endpointIdToChainType(dstEid)
  let toBytes
  if (dstChain === ChainType.SOLANA) {
    toBytes = makeBytes32(bs58.decode(to))
  } else {
    toBytes = makeBytes32(to)
  }

  const sendParam = {
    dstEid,
    to: toBytes,
    amountLD: amount.toString(),
    minAmountLD: (minAmount != null ? minAmount : amount).toString(),
    extraOptions: extraOptions ? extraOptions.toString() : '0x',
    composeMsg: composeMsg ? composeMsg.toString() : '0x',
    oftCmd: oftCmd != null ? oftCmd.toString() : '0x',
  }

  sendParam.minAmountLD = (await resolveMinAmount({
    oft,
    sendParam,
    amount,
    minAmount,
    slippageBps,
  })).toString()

  console.info('Quoting the native gas cost for the send transaction...', sendParam)
  const msgFee = await oft.quoteSend(sendParam, false)

  console.info('Sending the transaction...')
  const tx = await oft.connect(signer).send(sendParam, msgFee, signer.address, {
    value: msgFee.nativeFee,
  })

  await waitForTxn(tx)
  console.log(`sent txn: ${tx.hash}`)

  return { txnHash: tx.hash }
}

module.exports = {
  sendEvm,
  roundAmount,
}
