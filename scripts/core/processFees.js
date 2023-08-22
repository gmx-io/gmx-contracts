const fs = require("fs");
const { contractAt, sendTxn, getFrameSigner, sleep } = require("../shared/helpers")
const { withdrawFeesArb, withdrawFeesAvax } = require("./feeWithdrawal")
const { getArbValues: getArbFundAccountValues, getAvaxValues: getAvaxFundAccountValues } = require("../shared/fundAccountsUtils")
const { getArbValues: getArbRewardValues, getAvaxValues: getAvaxRewardValues, updateRewards: updateStakingRewards } = require("../staking/rewards")
const { getArbValues: getArbReferralValues, getAvaxValues: getAvaxReferralValues, sendReferralRewards: _sendReferralRewards } = require("../referrals/referralRewards")
const { formatAmount, bigNumberify } = require("../../test/shared/utilities")
const { bridgeTokens } = require("./bridge")
const { tokenArrRef } = require("../peripherals/feeCalculations")

const ReaderV2 = require("../../artifacts-v2/contracts/reader/Reader.sol/Reader.json")
const DataStore = require("../../artifacts-v2/contracts/data/DataStore.sol/DataStore.json")
const Multicall3 = require("../../artifacts-v2/contracts/mock/Multicall3.sol/Multicall3.json")
const FeeHandler = require("../../artifacts-v2/contracts/fee/FeeHandler.sol/FeeHandler.json")

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

const { DEPLOYER_KEY_FILE } = process.env;

const getFeeKeeperKey = () => {
  const filepath = "./keys/fee-keeper.json";
  const data = JSON.parse(fs.readFileSync(filepath));
  if (!data || !data.mnemonic) {
    throw new Error("Invalid key file");
  }
  const wallet = ethers.Wallet.fromMnemonic(data.mnemonic);
  return wallet.privateKey;
}

const FEE_KEEPER_KEY = getFeeKeeperKey()

const FEE_ACCOUNT = "0x49B373D422BdA4C6BfCdd5eC1E48A9a26fdA2F8b"
const FEE_HELPER = "0x43CE1d475e06c65DD879f4ec644B8e0E10ff2b6D"

const providers = {
  arbitrum: new ethers.providers.JsonRpcProvider(ARBITRUM_URL),
  avax: new ethers.providers.JsonRpcProvider(AVAX_URL)
}

const handlers = {
  arbitrum: new ethers.Wallet(HANDLER_KEY).connect(providers.arbitrum),
  avax: new ethers.Wallet(HANDLER_KEY).connect(providers.avax)
}

const feeKeepers = {
  arbitrum: new ethers.Wallet(FEE_KEEPER_KEY).connect(providers.arbitrum),
  avax: new ethers.Wallet(FEE_KEEPER_KEY).connect(providers.avax)
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

const dataStores = {
  arbitrum: new ethers.Contract("0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8", DataStore.abi, handlers.arbitrum),
  avax: new ethers.Contract("0x2F0b22339414ADeD7D5F06f9D604c7fF5b2fe3f6", DataStore.abi, handlers.avax),
}

const readersV2 = {
  arbitrum: new ethers.Contract("0x38d91ED96283d62182Fc6d990C24097A918a4d9b", ReaderV2.abi, handlers.arbitrum),
  avax: new ethers.Contract("0x1D5d64d691FBcD8C80A2FD6A9382dF0fe544cBd8", ReaderV2.abi, handlers.avax),
}

const feeHandlers = {
  arbitrum: new ethers.Contract("0x8921e1B2FB2e2b95F1dF68A774BC523327E98E9f", FeeHandler.abi, handlers.arbitrum),
  avax: new ethers.Contract("0x6EDF06Cd12F48b2bf0Fa6e5F98C334810B142814", FeeHandler.abi, handlers.avax),
}

async function withdrawFeesV2({ network }) {
  const dataStore = dataStores[network]
  const reader = readersV2[network]
  const feeHandler = feeHandlers[network]

  const markets = await reader.getMarkets(dataStore.address, 0, 1000)
  const marketAddresses = []
  const tokenAddresses = []

  for (const market of markets) {
    marketAddresses.push(market.marketToken)
    tokenAddresses.push(market.longToken)

    marketAddresses.push(market.marketToken)
    tokenAddresses.push(market.shortToken)
  }

  console.log("marketAddresses", marketAddresses.length, marketAddresses)
  console.log("tokenAddresses", tokenAddresses.length, tokenAddresses)

  await sendTxn(feeHandler.claimFees(marketAddresses, tokenAddresses), "feeHandler.claimFees")
}

async function withdrawFees() {
  await withdrawFeesArb()
  await withdrawFeesAvax()
  await withdrawFeesV2({ network: "arbitrum" })
  await withdrawFeesV2({ network: "avax" })
}

async function fundHandlerForNetwork({ network }) {
  const tokenArr = tokenArrRef[network]
  const feeKeeper = feeKeepers[network]
  const handler = handlers[network]

  for (let i = 0; i < tokenArr.length; i++) {
    const token = await contractAt("Token", tokenArr[i].address, feeKeeper)
    const balance = await token.balanceOf(FEE_ACCOUNT)
    if (balance.eq(0)) {
      continue
    }

    const approvedAmount = await token.allowance(FEE_ACCOUNT, feeKeeper.address)

    if (approvedAmount.lt(balance)) {
      const signer = await getFrameSigner({ network })
      const tokenForSigner = await contractAt("Token", token.address, signer)
      await sendTxn(tokenForSigner.approve(handler.address, balance), `approve: ${tokenArr[i].name}, ${balance.toString()}`)
    }
  }

  for (let i = 0; i < tokenArr.length; i++) {
    const token = await contractAt("Token", tokenArr[i].address, feeKeeper)
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

    try {
      await sendTxn(router.swap(path, balance, 0, handler.address), `swap token ${tokenArr[i].name}`)
    } catch (e) {
      console.error(`swap error, ${e.toString()}`)
      if (["frax", "usdt"].includes(tokenArr[i].name)) {
        await sendTxn(token.transfer(FEE_HELPER, balance), `sending ${ethers.utils.formatUnits(balance, tokenArr[i].decimals)} ${tokenArr[i].name} to be swapped`)
      } else {
        throw new Error(e.toString())
      }
    }

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

  // check how much wavax is needed, then swap excess wavax to usdc
  const wavax = await contractAt("Token", nativeTokens.avax.address, handlers.avax)
  const wavaxBalance = await wavax.balanceOf(handlers.avax.address)
  const excessWavax = wavaxBalance.sub(requiredWavaxBalance)
  console.info("excessWavax", excessWavax.toString())

  if (excessWavax.gt(0)) {
    // swap tokens to send to arbitrum
    const path = [wavax.address, tokensRef.avax.usdc.address]
    const usdc = await contractAt("Token", tokensRef.avax.usdc.address, handlers.avax)

    console.info("getting approvedAmount")
    const approvedAmount = await wavax.allowance(handlers.avax.address, routers.avax.address)
    console.info("approvedAmount", approvedAmount.toString())
    if (approvedAmount.lt(excessWavax)) {
      await sendTxn(wavax.approve(routers.avax.address, excessWavax), `approve wavax`)
    }
    await sendTxn(routers.avax.swap(path, excessWavax, 0, handlers.avax.address), `swap ${excessWavax.toString()} wavax to usdc`)
  }
}

async function bridgeTokensToArbitrum() {
  const usdc = await contractAt("Token", tokensRef.avax.usdc.address, handlers.avax)
  const bridgeAmount = await usdc.balanceOf(handlers.avax.address)

  if (bridgeAmount.eq(0)) {
    console.info("no tokens to bridge")
    return
  }

  await sendTxn(usdc.transfer(FEE_HELPER, bridgeAmount), `sending ${ethers.utils.formatUnits(bridgeAmount, 6)} to be bridged`)

  // send tokens to arbitrum
  // await bridgeTokens({ signer: handlers.avax, inputAmount: bridgeAmount })
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
      throw new Error(`balance < expectedMinBalance: ${balance.toString()}, ${expectedMinBalance[network].toString()}`)
    }
  }

  for (let i = 0; i < networks.length; i++) {
    const network = networks[i]
    // send ~99% to reduce the risk that swap fees, balancing tax, changes in prices
    // would result in the script failing
    // if significant fees are accumulated these should be included to be distributed
    // in the next distribution
    // the fees kept in the fee distributor can also help to fund keepers in case
    // of spikes in gas prices that may lead to low keeper balances before the next
    // distribution
    const rewardAmount = rewardAmounts[network]
    const gmxRewardAmount = rewardAmount.gmx.mul(9950).div(10_000)
    const glpRewardAmount = rewardAmount.glp.mul(9950).div(10_000)

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

  // TODO: handle case where tokens need to be bridged from Arbitrum to Avalanche

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
