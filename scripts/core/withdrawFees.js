const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

// time check to avoid invalid fee withdrawals
const time = 1682216808

if (Date.now() / 1000 > time + 10 * 60) {
  throw new Error("invalid time")
}

async function withdrawFeesTestnet() {
  const receiver = { address: "0x2CC6D07871A1c0655d6A7c9b0Ad24bED8f940517" }
  const vault = await contractAt("Vault", "0xA57F00939D8597DeF1965FF4708921c56D9A36f3")
  const gov = await contractAt("Timelock", await vault.gov())
  const { btc, bnb, busd} = tokens

  const tokenArr = [btc, bnb, busd]

  for (let i = 0; i < tokenArr.length; i++) {
    const token = await contractAt("Token", tokenArr[i].address)
    const poolAmount = await vault.poolAmounts(token.address)
    const feeReserve = await vault.feeReserves(token.address)
    const balance = await token.balanceOf(vault.address)
    const vaultAmount = poolAmount.add(feeReserve)

    if (vaultAmount.gt(balance)) {
      throw new Error("vaultAmount > vault.balance", vaultAmount.toString(), balance.toString())
    }
  }

  await sendTxn(gov.batchWithdrawFees(vault.address, tokenArr.map(t => t.address)), `gov.batchWithdrawFees`)
}

async function withdrawFeesBsc() {
  const receiver = { address: "0x2CC6D07871A1c0655d6A7c9b0Ad24bED8f940517" }
  const vault = await contractAt("Vault", "0xA57F00939D8597DeF1965FF4708921c56D9A36f3")
  const gov = await contractAt("Timelock", await vault.gov())
  const { btc, bnb, busd} = tokens

  const tokenArr = [btc, bnb, busd]

  for (let i = 0; i < tokenArr.length; i++) {
    const token = await contractAt("Token", tokenArr[i].address)
    const poolAmount = await vault.poolAmounts(token.address)
    const feeReserve = await vault.feeReserves(token.address)
    const balance = await token.balanceOf(vault.address)
    const vaultAmount = poolAmount.add(feeReserve)

    if (vaultAmount.gt(balance)) {
      throw new Error("vaultAmount > vault.balance", vaultAmount.toString(), balance.toString())
    }
  }

  await sendTxn(gov.batchWithdrawFees(vault.address, tokenArr.map(t => t.address)), `gov.batchWithdrawFees`)
}

async function withdrawFeesArb() {
  const receiver = { address: "0x49B373D422BdA4C6BfCdd5eC1E48A9a26fdA2F8b" }
  const vault = await contractAt("Vault", "0x489ee077994B6658eAfA855C308275EAd8097C4A")
  const gov = await contractAt("Timelock", await vault.gov())
  const { btc, eth, usdc, link, uni, usdt, mim, frax, dai } = tokens

  const tokenArr = [btc, eth, usdc, link, uni, usdt, frax, dai]

  for (let i = 0; i < tokenArr.length; i++) {
    const token = await contractAt("Token", tokenArr[i].address)
    const poolAmount = await vault.poolAmounts(token.address)
    const feeReserve = await vault.feeReserves(token.address)
    const balance = await token.balanceOf(vault.address)
    const vaultAmount = poolAmount.add(feeReserve)

    if (vaultAmount.gt(balance)) {
      throw new Error("vaultAmount > vault.balance", vaultAmount.toString(), balance.toString())
    }
  }

  await sendTxn(gov.batchWithdrawFees(vault.address, tokenArr.map(t => t.address)), `gov.batchWithdrawFees`)
}

async function withdrawFeesAvax() {
  const receiver = { address: "0x49B373D422BdA4C6BfCdd5eC1E48A9a26fdA2F8b" }
  const vault = await contractAt("Vault", "0x9ab2De34A33fB459b538c43f251eB825645e8595")
  const gov = await contractAt("Timelock", await vault.gov())
  const { avax, btc, btcb, eth, mim, usdce, usdc } = tokens

  const tokenArr = [avax, btc, btcb, eth, usdce, usdc]

  for (let i = 0; i < tokenArr.length; i++) {
    const token = await contractAt("Token", tokenArr[i].address)
    const poolAmount = await vault.poolAmounts(token.address)
    const feeReserve = await vault.feeReserves(token.address)
    const balance = await token.balanceOf(vault.address)
    const vaultAmount = poolAmount.add(feeReserve)

    if (vaultAmount.gt(balance)) {
      throw new Error("vaultAmount > vault.balance", vaultAmount.toString(), balance.toString())
    }
  }

  await sendTxn(gov.batchWithdrawFees(vault.address, tokenArr.map(t => t.address)), `gov.batchWithdrawFees`)
}

async function main() {
  if (network === "bsc") {
    await withdrawFeesBsc()
    return
  }

  if (network === "avax") {
    await withdrawFeesAvax()
    return
  }

  if (network === "testnet") {
    await withdrawFeesTestnet()
    return
  }

  await withdrawFeesArb()
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
