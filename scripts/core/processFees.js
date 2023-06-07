const { contractAt, sendTxn, getFrameSigner } = require("../shared/helpers")
const { withdrawFeesArb, withdrawFeesAvax } = require("./feeWithdrawal")
const { getArbValues: getArbFundAccountValues, getAvaxValues: getAvaxFundAccountValues } = require("../shared/fundAccountsUtils")
const { getArbValues: getArbRewardValues, getAvaxValues: getAvaxRewardValues, updateRewards: updateStakingRewards } = require("../staking/rewards")
const { getArbValues: getArbReferralValues, getAvaxValues: getAvaxReferralValues, sendReferralRewards: _sendReferralRewards } = require("../referrals/referralRewards")
const { formatAmount, bigNumberify } = require("../../test/shared/utilities")
const { bridgeTokens } = require("./bridge")

const feeReference = require("../../fee-reference.json")

const SHOULD_SEND_SWAP_TXNS = true

const {
  ARBITRUM_URL,
  AVAX_URL,
  ARBITRUM_DEPLOY_KEY,
  AVAX_DEPLOY_KEY,
  HANDLER_KEY
} = require("../../env.json");

const ARBITRUM = "arbitrum"
const AVAX = "avax"
const networks = [ARBITRUM, AVAX]

const FEE_ACCOUNT = "0x49B373D422BdA4C6BfCdd5eC1E48A9a26fdA2F8b"

const providers = {
  arbitrum: new ethers.providers.JsonRpcProvider(ARBITRUM_URL),
  avax: new ethers.providers.JsonRpcProvider(AVAX_URL)
}

const handlers = {
  arbitrum: new ethers.Wallet(HANDLER_KEY).connect(providers.arbitrum),
  avax: new ethers.Wallet(HANDLER_KEY).connect(providers.avax)
}

const deployers = {
  arbitrum: new ethers.Wallet(ARBITRUM_DEPLOY_KEY).connect(providers.arbitrum),
  avax: new ethers.Wallet(AVAX_DEPLOY_KEY).connect(providers.avax)
}

const nativeTokens = {
  arbitrum: require('./tokens')["arbitrum"].nativeToken,
  avax: require('./tokens')["avax"].nativeToken
}

const tokensRef = {
  arbitrum: require('./tokens')["arbitrum"],
  avax: require('./tokens')["avax"]
}

function getArbTokens() {
  const { btc, eth, usdc, link, uni, usdt, mim, frax, dai } = tokensRef.arbitrum
  const tokenArr = [btc, eth, usdc, link, uni, usdt, frax, dai]

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

async function withdrawFees() {
  await withdrawFeesArb()
  await withdrawFeesAvax()
}

async function fundHandlerForNetwork({ network }) {
  const tokenArr = tokenArrRef[network]
  const handler = handlers[network]

  for (let i = 0; i < tokenArr.length; i++) {
    const token = await contractAt("Token", tokenArr[i].address, handler)
    const balance = await token.balanceOf(FEE_ACCOUNT)
    if (balance.eq(0)) {
      continue
    }

    const approvedAmount = await token.allowance(FEE_ACCOUNT, handler.address)

    if (approvedAmount.lt(balance)) {
      const signer = await getFrameSigner({ network })
      const tokenForSigner = await contractAt("Token", token.address, signer)
      await sendTxn(tokenForSigner.approve(handler.address, balance), `approve: ${tokenArr[i].name}, ${balance.toString()}`)
    }
  }

  for (let i = 0; i < tokenArr.length; i++) {
    const token = await contractAt("Token", tokenArr[i].address, handler)
    const balance = await token.balanceOf(FEE_ACCOUNT)
    if (balance.eq(0)) {
      continue
    }

    await sendTxn(token.transferFrom(FEE_ACCOUNT, handler.address, balance), `fund handler: ${tokenArr[i].name}, ${balance.toString()}`)
  }
}

async function fundHandler() {
  await fundHandlerForNetwork({ network: ARBITRUM })
  await fundHandlerForNetwork({ network: AVAX })
}

async function swapFeesForNetwork({ routers, network }) {
  const router = routers[network]
  const tokenArr = tokenArrRef[network]
  const nativeToken = nativeTokens[network]
  const handler = handlers[network]

  for (let i = 0; i < tokenArr.length; i++) {
    const token = await contractAt("Token", tokenArr[i].address, handler)
    if (token.address.toLowerCase() === nativeToken.address.toLowerCase()) {
      continue
    }

    const path = [token.address, nativeToken.address]
    const balance = await token.balanceOf(handler.address)
    if (balance.eq(0)) {
      continue
    }

    const approvedAmount = await token.allowance(handler.address, router.address)

    if (approvedAmount.lt(balance)) {
      await sendTxn(token.approve(router.address, ethers.constants.MaxUint256), `approve token ${tokenArr[i].name}`)
    }

    await sendTxn(router.swap(path, balance, 0, handler.address), `swap token ${tokenArr[i].name}`)

    if (!SHOULD_SEND_SWAP_TXNS) {
      break
    }
  }
}

async function swapFeesForAvax({ routers }) {
  await swapFeesForNetwork({ routers, network: AVAX })

  if (!SHOULD_SEND_SWAP_TXNS) {
    return
  }

  const requiredWavaxBalance = bigNumberify(feeReference.requiredWavaxBalance)

  // check how much wavax is needed, then swap excess wavax to usdce
  const wavax = await contractAt("Token", nativeTokens.avax.address, handlers.avax)
  const wavaxBalance = await wavax.balanceOf(handlers.avax.address)
  const excessWavax = wavaxBalance.sub(requiredWavaxBalance)
  console.info("excessWavax", excessWavax.toString())

  if (excessWavax.gt(0)) {
    // swap tokens to send to arbitrum
    const path = [wavax.address, tokensRef.avax.usdce.address]
    const usdce = await contractAt("Token", tokensRef.avax.usdce.address, handlers.avax)

    const approvedAmount = await wavax.allowance(handlers.avax.address, routers.avax.address)
    if (approvedAmount.lt(excessWavax)) {
      await sendTxn(wavax.approve(routers.avax.address, excessWavax), `approve wavax`)
    }
    await routers.avax.swap(path, excessWavax, 0, handlers.avax.address)
  }
}

async function bridgeTokensToArbitrum() {
  const usdce = await contractAt("Token", tokensRef.avax.usdce.address, handlers.avax)
  const bridgeAmount = await usdce.balanceOf(handlers.avax.address)

  if (bridgeAmount.eq(0)) {
    console.info("no tokens to bridge")
    return
  }

  // send tokens to arbitrum
  await bridgeTokens({ signer: handlers.avax, inputAmount: bridgeAmount })
}

async function fundAccountsForNetwork({ network, fundAccountValues }) {
  const handler = handlers[network]
  const { sender, transfers, totalTransferAmount, gasToken } = fundAccountValues[network]

  const nativeToken = await contractAt("WETH", nativeTokens[network].address, handler)
  await sendTxn(nativeToken.withdraw(totalTransferAmount), `nativeToken.withdraw(${formatAmount(totalTransferAmount, 18, 2)})`)

  for (let i = 0; i < transfers.length; i++) {
    const transferItem = transfers[i]

    await sendTxn(handler.sendTransaction({
      to: transferItem.address,
      value: transferItem.amount
    }), `${formatAmount(transferItem.amount, 18, 2)} ${gasToken} to ${transferItem.address}`)
  }
}

async function fundAccounts() {
  const fundAccountValues = {
    arbitrum: await getArbFundAccountValues(),
    avax: await getAvaxFundAccountValues()
  }

  await fundAccountsForNetwork({ network: ARBITRUM, fundAccountValues })
  await fundAccountsForNetwork({ network: AVAX, fundAccountValues })
}

async function updateRewards() {
  const rewardAmounts = {
    arbitrum: {
      gmx: bigNumberify(feeReference.gmxFees.arbitrum),
      glp: bigNumberify(feeReference.glpFees.arbitrum),
    },
    avax: {
      gmx: bigNumberify(feeReference.gmxFees.avax),
      glp: bigNumberify(feeReference.glpFees.avax),
    }
  }

  const expectedMinBalance = {
    arbitrum: rewardAmounts.arbitrum.gmx.add(rewardAmounts.arbitrum.glp),
    avax: rewardAmounts.avax.gmx.add(rewardAmounts.avax.glp),
  }

  const stakingValues = {
    arbitrum: await getArbRewardValues(handlers.arbitrum),
    avax: await getAvaxRewardValues(handlers.avax)
  }

  for (let i = 0; i < networks.length; i++) {
    const network = networks[i]
    const handler = handlers[network]
    const nativeToken = await contractAt("WETH", nativeTokens[network].address, handler)
    const balance = await nativeToken.balanceOf(handler.address)
    if (balance.lt(expectedMinBalance[network])) {
      throw new Error(`balance < expectedMinBalance: ${balance.toString()}, ${expectedMinBalance.toString()}`)
    }
  }

  for (let i = 0; i < networks.length; i++) {
    const network = networks[i]
    // send 99% to reduce the risk that swap fees, balancing tax, changes in prices
    // would result in the script failing
    // if significant fees are accumulated these should be included to be distributed
    // in the next distribution
    // the 1% kept in the fee distributor can also help to fund keepers in case
    // of spikes in gas prices that may lead to low keeper balances before the next
    // distribution
    const rewardAmount = rewardAmounts[network]
    const gmxRewardAmount = rewardAmount.gmx.mul(99).div(100)
    const glpRewardAmount = rewardAmount.glp.mul(99).div(100)

    stakingValues[network].rewardTrackerArr[0].transferAmount = gmxRewardAmount
    stakingValues[network].rewardTrackerArr[1].transferAmount = glpRewardAmount

    await updateStakingRewards({
      signer: handlers[network],
      values: stakingValues[network],
      intervalUpdater: deployers[network]
    })
  }
}

async function sendReferralRewards() {
  const referralValues = {
    arbitrum: await getArbReferralValues(deployers.arbitrum),
    avax: await getAvaxReferralValues(deployers.avax)
  }

  for (let i = 0; i < networks.length; i++) {
    const network = networks[i]

    await _sendReferralRewards({
      signer: handlers[network],
      referralSender: deployers[network],
      shouldSendTxn: true,
      nativeToken: nativeTokens[network],
      nativeTokenPrice: feeReference.nativeTokenPrice[network],
      gmxPrice: feeReference.gmxPrice,
      values: referralValues[network],
      network
    })
  }
}

async function processFees({ steps }) {
  const stepsToRun = steps.split(",")
  console.log("stepsToRun", stepsToRun)

  if (feeReference.refTimestamp > Date.now()) {
    throw new Error(`refTimestamp is later than current time ${feeReference.refTimestamp}`)
  }

  const allowedDelay = 6 * 60 * 60 * 1000
  if (feeReference.refTimestamp < Date.now() - allowedDelay) {
    throw new Error(`refTimestamp is older than the allowed delay`)
  }

  const routers = {
    arbitrum: await contractAt("Router", "0xaBBc5F99639c9B6bCb58544ddf04EFA6802F4064", handlers.arbitrum),
    avax: await contractAt("Router", "0x5F719c2F1095F7B9fc68a68e35B51194f4b6abe8", handlers.avax)
  }

  if (steps.includes(1)) {
    await withdrawFees()
  }

  if (steps.includes(2)) {
    await fundHandler()
  }

  if (steps.includes(3)) {
    await swapFeesForAvax({ routers })
  }

  if (steps.includes(4)) {
    await bridgeTokensToArbitrum()
  }

  if (steps.includes(5)) {
    await swapFeesForNetwork({ routers, network: ARBITRUM })
  }

  if (steps.includes(6)) {
    await fundAccounts()
  }

  if (steps.includes(7)) {
    await updateRewards()
  }

  if (steps.includes(8)) {
    await sendReferralRewards()
  }
}

module.exports = { processFees }
