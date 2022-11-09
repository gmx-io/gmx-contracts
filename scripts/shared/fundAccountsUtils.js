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
      address: "0x18eAc44875EC92Ed80EeFAa7fa7Ac957b312D366", // price sender 1
      targetFunds: "12.5"
    },
    {
      address: "0x2eD9829CFF68c7Bb40812f70c4Fc06A4938845de", // price sender 2
      targetFunds: "12.5"
    },
    {
      address: "0xbEe27BD52dB995D3c74Dc11FF32D93a1Aad747f7", // positions keeper 1
      targetFunds: "12.5"
    },
    {
      address: "0x94577665926885f47ddC1Feb322bc51470daA8E8", // positions keeper 2
      targetFunds: "12.5"
    },
    {
      address: "0xd4266F8F82F7405429EE18559e548979D49160F3", // order keeper 1
      targetFunds: "7.5"
    },
    {
      address: "0x2D1545d6deDCE867fca3091F49B29D16B230a6E4", // order keeper 2
      targetFunds: "7.5"
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
      address: "0x2b249Bec7c3A142431b67e63A1dF86F974FAF3aa", // price sender 1
      targetFunds: "1250"
    },
    {
      address: "0x63ff41E44d68216e716d236E2ECdd5272611D835", // price sender 2
      targetFunds: "1250"
    },
    {
      address: "0x5e0338CE6597FCB9404d69F4286194A60aD442b7", // positions keeper 1
      targetFunds: "1250"
    },
    {
      address: "0x8CD98FF48831aa8864314ae8f41337FaE9941C8D", // positions keeper 2
      targetFunds: "1250"
    },
    {
      address: "0x06f34388A7CFDcC68aC9167C5f1C23DD39783179", // order keeper 1
      targetFunds: "150"
    },
    {
      address: "0xf26f52d5985F6391E541A8d638e1EDaa522Ae56C", // order keeper 2
      targetFunds: "150"
    },
    {
      address: "0x7858A4C42C619a68df6E95DF7235a9Ec6F0308b9", // liquidator
      targetFunds: "300"
    },
    {
      address: "0x02270a816fcca45ce078c8b3de0346eebc90b227", // shorts tracker keeper
      targetFunds: "25"
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
