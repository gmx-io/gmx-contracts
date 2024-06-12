const { contractAt, sendTxn } = require("../shared/helpers")
const { bigNumberify, expandDecimals } = require("../../test/shared/utilities")
const { formatAmount } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function getArbValues() {
  const vault = await contractAt("Vault", "0x489ee077994B6658eAfA855C308275EAd8097C4A")
  const timelock = await contractAt("Timelock", await vault.gov())
  const reader = await contractAt("Reader", "0x2b43c90D1B727cEe1Df34925bcd5Ace52Ec37694")

  const glpManager = await contractAt("GlpManager", "0x3963FfC9dff443c2A94f21b129D429891E32ec18")
  const usdgTimelock = await contractAt("Timelock", "0xF3Cf3D73E00D3149BA25c55951617151C67b2350")

  const { btc, eth, usdce, usdc, link, uni, usdt, frax, dai } = tokens
  const tokenArr = [ btc, eth, usdce, usdc, link, uni, usdt, frax, dai ]
  // const tokenArr = [ usdt, frax, dai ]

  const vaultTokenInfo = await reader.getVaultTokenInfoV2(vault.address, eth.address, 1, tokenArr.map(t => t.address))

  return { vault, timelock, reader, glpManager, usdgTimelock, tokenArr, vaultTokenInfo }
}

async function getAvaxValues() {
  const vault = await contractAt("Vault", "0x9ab2De34A33fB459b538c43f251eB825645e8595")
  const timelock = await contractAt("Timelock", await vault.gov())
  const reader = await contractAt("Reader", "0x2eFEE1950ededC65De687b40Fd30a7B5f4544aBd")

  const glpManager = await contractAt("GlpManager", "0xD152c7F25db7F4B95b7658323c5F33d176818EE4")
  const usdgTimelock = await contractAt("Timelock", "0x60145eEd66E1917B4bDd4754c03b7998B616687A")

  const { avax, eth, btcb, btc, usdc, usdce } = tokens
  const tokenArr = [ avax, eth, btcb, btc, usdc, usdce ]

  const vaultTokenInfo = await reader.getVaultTokenInfoV2(vault.address, avax.address, 1, tokenArr.map(t => t.address))

  return { vault, timelock, reader, glpManager, usdgTimelock, tokenArr, vaultTokenInfo }
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
  const { vault, timelock, glpManager, usdgTimelock, tokenArr, vaultTokenInfo } = await getValues()

  console.log("vault", vault.address)
  console.log("timelock", timelock.address)

  const vaultPropsLength = 14;

  const shouldSendTxn = process.env.WRITE === "true"

  let totalUsdgAmount = bigNumberify(0)
  const totalTokenWeight = tokenArr.reduce((acc, tokenItem) => {
    return acc + tokenItem.tokenWeight
  }, 0)

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

    const tokenSymbol = tokenItem.name.toUpperCase()
    console.log("\n%s", tokenSymbol)

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
      console.warn(`usdgAmount was adjusted ${formatAmount(usdgAmount, 18, 0, true)} -> ${formatAmount(adjustedMaxUsdgAmount, 18, 0, true)}`)
      usdgAmount = adjustedMaxUsdgAmount
    }

    if (!token.maxUsdgAmount.eq(adjustedMaxUsdgAmount)) {
      console.warn(`maxUsdgAmount was changed ${formatAmount(token.maxUsdgAmount, 18, 0, true)} -> ${formatAmount(adjustedMaxUsdgAmount, 18, 0, true)}`)
    }

    const adjustedBufferAmount = expandDecimals(tokenItem.bufferAmount, tokenItem.decimals)
    if (!token.bufferAmount.eq(adjustedBufferAmount)) {
      console.warn(`bufferAmount was changed ${formatAmount(token.bufferAmount, tokenItem.decimals, 0, true)} -> ${formatAmount(adjustedBufferAmount, tokenItem.decimals, 0, true)}`)
    }
    if (!token.weight.eq(tokenItem.tokenWeight)) {
      console.warn(`tokenWeight was changed ${token.weight.toString()} -> ${tokenItem.tokenWeight.toString()}`)
    }

    console.log(
      "weight %s% usgdAmount %s / %s poolAmount %s bufferAmount %s",
      (tokenItem.tokenWeight / totalTokenWeight * 100).toFixed(2),
      formatAmount(usdgAmount, 18, 0, true),
      formatAmount(adjustedMaxUsdgAmount, 18, 0, true),
      formatAmount(token.poolAmount, tokenItem.decimals, 0, true),
      formatAmount(adjustedBufferAmount, tokenItem.decimals, 0, true)
    )

    if (shouldSendTxn) {
      console.info("sending set token config", {
        vault: vault.address,
        token: tokenItem.address, // _token
        tokenWeight: tokenItem.tokenWeight, // _tokenWeight
        minProfitBps: tokenItem.minProfitBps, // _minProfitBps
        adjustedMaxUsdgAmount: adjustedMaxUsdgAmount.toString(), // _maxUsdgAmount
        adjustedBufferAmount: adjustedBufferAmount.toString(), // _bufferAmount
        usgdAmount: usdgAmount.toString()
      })

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

  if (shouldSendTxn) {
    await sendTxn(usdgTimelock.updateUsdgSupply(glpManager.address, totalUsdgAmount), "timelock.updateUsdgSupply")
  }

  console.log("")
  console.log("totalUsdgAmount", totalUsdgAmount.toString())
  console.log("totalTokenWeight", totalTokenWeight.toString())
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
