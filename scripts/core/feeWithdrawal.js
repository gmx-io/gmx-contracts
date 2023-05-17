const { contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

const {
  ARBITRUM_URL,
  ARBITRUM_DEPLOY_KEY,
  AVAX_URL,
  AVAX_DEPLOY_KEY,
} = require("../../env.json");

async function withdrawFeesBsc() {
  const receiver = { address: "0x9f169c2189A2d975C18965DE985936361b4a9De9" }
  const vault = await contractAt("Vault", "0xc73A8DcAc88498FD4b4B1b2AaA37b0a2614Ff67B")
  const gov = await contractAt("Timelock", "0x58d6e1675232496226d074502d0c2df383fa0cbe")
  const balanceUpdater = await contractAt("BalanceUpdater", "0x912F4db2076079718D3b3A3Ab21F5Af22Bd1EDd3")
  const usdg = await contractAt("Token", "0x85E76cbf4893c1fbcB34dCF1239A91CE2A4CF5a7")

  const btc = { address: "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c" }
  const eth = { address: "0x2170ed0880ac9a755fd29b2688956bd959f933f8" }
  const bnb = { address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" }
  const busd = { address: "0xe9e7cea3dedca5984780bafc599bd69add087d56" }
  const usdc = { address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d" }
  const usdt = { address: "0x55d398326f99059fF775485246999027B3197955" }

  const tokens = [btc, eth, bnb, busd, usdc, usdt]

  for (let i = 0; i < tokens.length; i++) {
    const token = await contractAt("Token", tokens[i].address)
    const poolAmount = await vault.poolAmounts(token.address)
    const feeReserve = await vault.feeReserves(token.address)
    const balance = await token.balanceOf(vault.address)
    const vaultAmount = poolAmount.add(feeReserve)
    const acccountBalance = await token.balanceOf(receiver.address)

    if (vaultAmount.gt(balance)) {
      const diff = vaultAmount.sub(balance)
      console.log(`${token.address}: ${diff.toString()}, ${acccountBalance.toString()}`)
      await sendTxn(balanceUpdater.updateBalance(vault.address, token.address, usdg.address, expandDecimals(1, 18)), `updateBalance ${i}`)
    }

    await sendTxn(gov.withdrawFees(vault.address, token.address, receiver.address), `gov.withdrawFees ${i}`)
  }
}

async function withdrawFeesArb() {
  const provider = new ethers.providers.JsonRpcProvider(ARBITRUM_URL);
  const wallet = new ethers.Wallet(ARBITRUM_DEPLOY_KEY).connect(provider);

  const receiver = { address: "0x49B373D422BdA4C6BfCdd5eC1E48A9a26fdA2F8b" }
  const vault = await contractAt("Vault", "0x489ee077994B6658eAfA855C308275EAd8097C4A", wallet)
  const gov = await contractAt("Timelock", await vault.gov(), wallet)
  const tokens = require('./tokens')["arbitrum"];
  const { btc, eth, usdc, link, uni, usdt, mim, frax, dai } = tokens

  const tokenArr = [btc, eth, usdc, link, uni, usdt, frax, dai]

  for (let i = 0; i < tokenArr.length; i++) {
    const token = await contractAt("Token", tokenArr[i].address, wallet)
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
  const provider = new ethers.providers.JsonRpcProvider(AVAX_URL);
  const wallet = new ethers.Wallet(AVAX_DEPLOY_KEY).connect(provider);

  const receiver = { address: "0x49B373D422BdA4C6BfCdd5eC1E48A9a26fdA2F8b" }
  const vault = await contractAt("Vault", "0x9ab2De34A33fB459b538c43f251eB825645e8595", wallet)
  const gov = await contractAt("Timelock", await vault.gov(), wallet)
  const tokens = require('./tokens')["avax"];
  const { avax, btc, btcb, eth, mim, usdce, usdc } = tokens

  const tokenArr = [avax, btc, btcb, eth, usdce, usdc]

  for (let i = 0; i < tokenArr.length; i++) {
    const token = await contractAt("Token", tokenArr[i].address, wallet)
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

module.exports = {
  withdrawFeesArb,
  withdrawFeesAvax,
  withdrawFeesBsc
}
