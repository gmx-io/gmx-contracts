const { getFrameSigner, deployContract, contractAt, sendTxn, readTmpAddresses, callWithRetries } = require("../shared/helpers")
const { bigNumberify, expandDecimals } = require("../../test/shared/utilities")
const { toChainlinkPrice } = require("../../test/shared/chainlink")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function getArbTestnetValues() {
  const vault = await contractAt("Vault", "0xBc9BC47A7aB63db1E0030dC7B60DDcDe29CF4Ffb")
  const timelock = await contractAt("Timelock", await vault.gov())
  const reader = await contractAt("Reader", "0x2E093c70E3A7E4919611d2555dFd8D697d2fC0a1")

  const { btc, eth, usdc, usdt } = tokens
  const tokenArr = [
    btc,
    eth,
    usdc,
    usdt,
  ]

  const vaultTokenInfo = await reader.getVaultTokenInfoV2(vault.address, eth.address, 1, tokenArr.map(t => t.address))

  return { vault, timelock, reader, tokenArr, vaultTokenInfo }
}

async function getArbValues() {
  console.log("get values for Arbitrum")
  const signer = await getFrameSigner()

  const vault = await contractAt("Vault", "0x489ee077994B6658eAfA855C308275EAd8097C4A")
  const timelock = await contractAt("Timelock", await vault.gov(), signer)
  const reader = await contractAt("Reader", "0x2b43c90D1B727cEe1Df34925bcd5Ace52Ec37694")

  const { btc, eth, usdc, link, uni, usdt, mim, frax, dai } = tokens
  const tokenArr = [usdt, dai]

  const vaultTokenInfo = await reader.getVaultTokenInfoV2(vault.address, eth.address, 1, tokenArr.map(t => t.address))

  return { vault, timelock, reader, tokenArr, vaultTokenInfo }
}

async function getAvaxValues() {
  console.log("get values for Avalanche")
  const signer = await getFrameSigner()

  const vault = await contractAt("Vault", "0x9ab2De34A33fB459b538c43f251eB825645e8595")
  const timelock = await contractAt("Timelock", await vault.gov(), signer)
  const reader = await contractAt("Reader", "0x2eFEE1950ededC65De687b40Fd30a7B5f4544aBd")

  const { avax, eth, btc, btcb, mim, usdce, usdc } = tokens
  const tokenArr = [eth, usdce, usdc]

  const vaultTokenInfo = await reader.getVaultTokenInfoV2(vault.address, avax.address, 1, tokenArr.map(t => t.address))

  return { vault, timelock, reader, tokenArr, vaultTokenInfo }
}

async function main() {
  let vault, timelock, reader, tokenArr, vaultTokenInfo

  if (network === "arbitrumTestnet") {
    ;({ vault, timelock, reader, tokenArr, vaultTokenInfo } = await getArbTestnetValues());
  } else if (network === "arbitrum") {
    ;({ vault, timelock, reader, tokenArr, vaultTokenInfo } = await getArbValues());
  } else if (network === "avax") {
    ;({ vault, timelock, reader, tokenArr, vaultTokenInfo } = await getAvaxValues());
  } else {
    throw new Error("Unsupported network " + network)
  }

  console.log("vault", vault.address)
  console.log("timelock", timelock.address)
  console.log("reader", reader.address)
  console.log("tokenArr", tokenArr)

  const vaultPropsLength = 14;

  const shouldSendTxn = false

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
    // if (usdgAmount.gt(adjustedMaxUsdgAmount)) {
    //   usdgAmount = adjustedMaxUsdgAmount
    // }

    if (shouldSendTxn) {
      await sendTxn(timelock.setTokenConfig(
        vault.address,
        tokenItem.address, // _token
        tokenItem.decimals,
        tokenItem.tokenWeight, // _tokenWeight
        tokenItem.minProfitBps, // _minProfitBps
        expandDecimals(tokenItem.maxUsdgAmount, 18), // _maxUsdgAmount
        tokenItem.isStable,
        tokenItem.isShortable
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
