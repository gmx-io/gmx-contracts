const { getFrameSigner, sendTxn, contractAt } = require("../shared/helpers")
const { bigNumberify, formatAmount } = require("../../test/shared/utilities")
const network = (process.env.HARDHAT_NETWORK || 'mainnet');

const tokens = require('../core/tokens')[network];

const {
  ARBITRUM_URL,
  ARBITRUM_DEPLOY_KEY,
  AVAX_URL,
  AVAX_DEPLOY_KEY,
} = require("../../env.json")

async function getTransferItems(keepers, provider) {
  const transferItems = []

  for (let i = 0; i < keepers.length; i++) {
    const keeper = keepers[i]
    const balance = await provider.getBalance(keeper.address)
    const targetAmount = ethers.utils.parseEther(keeper.targetFunds)

    if (balance.lt(targetAmount)) {
      const amountToSend = targetAmount.sub(balance)
      transferItems.push({ address: keeper.address, amount: amountToSend })
    }
  }

  return transferItems
}

async function getTotalTransferAmount(transferItems) {
  let totalTransferAmount = bigNumberify(0)
  for (let i = 0; i < transferItems.length; i++) {
    totalTransferAmount = totalTransferAmount.add(transferItems[i].amount)
  }

  return totalTransferAmount
}

async function getArbValues() {
  const provider = new ethers.providers.JsonRpcProvider(ARBITRUM_URL)
  const sender = new ethers.Wallet(ARBITRUM_DEPLOY_KEY).connect(provider)

  const keepers = [
    {
      address: "0x1E359EaE31F5815AC3D5B337B26771Bc8ADbDFA3", // price sender
      targetFunds: "25"
    },
    {
      address: "0xEF9092d35Fda3e5b6E2Dd3Fac5b580aefc346FAf", // positions keeper
      targetFunds: "25"
    },
    {
      address: "0xd4266F8F82F7405429EE18559e548979D49160F3", // order keeper
      targetFunds: "15"
    },
    {
      address: "0x44311c91008DDE73dE521cd25136fD37d616802c", // liquidator
      targetFunds: "15"
    }
  ]

  const transfers = await getTransferItems(keepers, provider)
  const totalTransferAmount = await getTotalTransferAmount(transfers)

  return { sender, transfers, totalTransferAmount, tokens, gasToken: "ETH" }
}

async function getAvaxValues() {
  const provider = new ethers.providers.JsonRpcProvider(AVAX_URL)
  const sender = new ethers.Wallet(AVAX_DEPLOY_KEY).connect(provider)

  const keepers = [
    {
      address: "0x6647B6f671E390Fe64c039dd7119E42E93Ccf957", // price sender 1
      targetFunds: "1250"
    },
    {
      address: "0xaC13E972B89001B45A8e07E5b040554096378810", // price sender 1
      targetFunds: "1250"
    },
    {
      address: "0xa0c6954b241f592a937D778Dc8b994F4518b82a5", // positions keeper 1
      targetFunds: "1250"
    },
    {
      address: "0x295f648f091074015d4C26725421b2E73768199F", // positions keeper 2
      targetFunds: "1250"
    },
    {
      address: "0x06f34388A7CFDcC68aC9167C5f1C23DD39783179", // order keeper
      targetFunds: "300"
    },
    {
      address: "0x7858A4C42C619a68df6E95DF7235a9Ec6F0308b9", // liquidator
      targetFunds: "300"
    }
  ]

  const transfers = await getTransferItems(keepers, provider)
  const totalTransferAmount = await getTotalTransferAmount(transfers)

  return { sender, transfers, totalTransferAmount, tokens, gasToken: "AVAX" }
}

async function getValues() {
  if (network === "arbitrum") {
    return getArbValues()
  }

  if (network === "avax") {
    return getAvaxValues()
  }
}

module.exports = {
  getArbValues,
  getAvaxValues,
  getValues
}
