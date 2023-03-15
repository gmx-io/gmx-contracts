const { contractAt, sendTxn } = require("../shared/helpers")
const { bigNumberify, expandDecimals } = require("../../test/shared/utilities")
const { formatAmount } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function getArbValues() {
  const vault = await contractAt("Vault", "0x489ee077994B6658eAfA855C308275EAd8097C4A")
  const timelock = await contractAt("Timelock", await vault.gov())
  const reader = await contractAt("Reader", "0x2b43c90D1B727cEe1Df34925bcd5Ace52Ec37694")

  const { btc, eth, usdc, link, uni, usdt, frax, dai } = tokens
  const tokenArr = [ btc, eth, usdc, link, uni, usdt, frax, dai ]
  // const tokenArr = [ usdt, frax, dai ]

  const vaultTokenInfo = await reader.getVaultTokenInfoV2(vault.address, eth.address, 1, tokenArr.map(t => t.address))

  return { vault, timelock, reader, tokenArr, vaultTokenInfo }
}

async function getAvaxValues() {
  const vault = await contractAt("Vault", "0x9ab2De34A33fB459b538c43f251eB825645e8595")
  const timelock = await contractAt("Timelock", await vault.gov())
  const reader = await contractAt("Reader", "0x2eFEE1950ededC65De687b40Fd30a7B5f4544aBd")

  const { avax, eth, btcb, btc, usdc, usdce } = tokens
  const tokenArr = [ avax, eth, btcb, btc, usdc, usdce ]

  const vaultTokenInfo = await reader.getVaultTokenInfoV2(vault.address, avax.address, 1, tokenArr.map(t => t.address))

  return { vault, timelock, reader, tokenArr, vaultTokenInfo }
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
  const { vault, timelock, tokenArr, vaultTokenInfo } = await getValues()

  console.log("vault", vault.address)
  console.log("timelock", timelock.address)

  const vaultPropsLength = 14;

  const shouldSendTxn = true

  let totalUsdgAmount = bigNumberify(0)

  for (const [i, tokenItem] of tokenArr.entries()) {
    const token = {}
    token.poolAmount = vaultTokenInfo[i * vaultPropsLength]
    token.reservedAmount = vaultTokenInfo[i * vaultPropsLength + 1]
    token.availableAmount = token.poolAmount.sub(token.reservedAmount)
    token.usdgAmount = vaultTokenInfo[i * vaultPropsLength + 2]
    token.redemptionAmount = vaultTokenInfo[i * vaultPropsLength + 3]
    token.weight = vaultTokenInfo[i * vaultPropsLength + 4]
    token.bufferAmount = vaultTokenInfo[i * vaultPropsLength + 5]
    token.maxUsdgAmount = vaultTokenInfo[i * vaultPropsLength + 6]
    token.globalShortSize = vaultTokenInfo[i * vaultPropsLength + 7]
    token.maxGlobalShortSize = vaultTokenInfo[i * vaultPropsLength + 8]
    token.minPrice = vaultTokenInfo[i * vaultPropsLength + 9]
    token.maxPrice = vaultTokenInfo[i * vaultPropsLength + 10]
    token.guaranteedUsd = vaultTokenInfo[i * vaultPropsLength + 11]

    token.availableUsd = tokenItem.isStable
      ? token.poolAmount
          .mul(token.minPrice)
          .div(expandDecimals(1, tokenItem.decimals))
      : token.availableAmount
          .mul(token.minPrice)
          .div(expandDecimals(1, tokenItem.decimals));

    token.managedUsd = token.availableUsd.add(token.guaranteedUsd);
    token.managedAmount = token.managedUsd
      .mul(expandDecimals(1, tokenItem.decimals))
      .div(token.minPrice);

    let usdgAmount = token.managedUsd.div(expandDecimals(1, 30 - 18))
    totalUsdgAmount = totalUsdgAmount.add(usdgAmount)

    const adjustedMaxUsdgAmount = expandDecimals(tokenItem.maxUsdgAmount, 18)
    if (usdgAmount.gt(adjustedMaxUsdgAmount)) {
      console.warn(`usdgAmount for ${tokenItem.name.toUpperCase()} was adjusted from ${formatAmount(usdgAmount, 18, 0, true)} to ${formatAmount(adjustedMaxUsdgAmount, 18, 0, true)}`)
      usdgAmount = adjustedMaxUsdgAmount
    }

    if (!token.maxUsdgAmount.eq(adjustedMaxUsdgAmount)) {
      console.warn(`maxUsdgAmount for ${tokenItem.name.toUpperCase()} was changed from ${formatAmount(token.maxUsdgAmount, 18, 0, true)} to ${formatAmount(adjustedMaxUsdgAmount, 18, 0, true)}`)
    }

    const adjustedBufferAmount = expandDecimals(tokenItem.bufferAmount, tokenItem.decimals)
    if (!token.bufferAmount.eq(adjustedBufferAmount)) {
      console.warn(`bufferAmount for ${tokenItem.name.toUpperCase()} was changed from ${formatAmount(token.bufferAmount, tokenItem.decimals, 0, true)} to ${formatAmount(adjustedBufferAmount, tokenItem.decimals, 0, true)}`)
    }
    if (!token.weight.eq(tokenItem.tokenWeight)) {
      console.warn(`tokenWeight for ${tokenItem.name.toUpperCase()} was changed from ${token.weight.toString()} to ${tokenItem.tokenWeight.toString()}`)
    }

    if (shouldSendTxn) {
      await sendTxn(timelock.setTokenConfig(
        vault.address,
        tokenItem.address, // _token
        tokenItem.tokenWeight, // _tokenWeight
        tokenItem.minProfitBps, // _minProfitBps
        adjustedMaxUsdgAmount, // _maxUsdgAmount
        adjustedBufferAmount, // _bufferAmount
        usdgAmount
      ), `vault.setTokenConfig(${tokenItem.name}) ${tokenItem.address}`)
    }
  }

  console.log("totalUsdgAmount", totalUsdgAmount.toString())
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
