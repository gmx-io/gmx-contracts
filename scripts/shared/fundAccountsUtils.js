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
      address: "0xadb277E967C360Da4D23e29116253cd76D12E186", // price sender 1
      targetFunds: "12.5"
    },
    {
      address: "0x8cF560ECC641248DcEc1D7A60403b7dD8aD37D07", // price sender 2
      targetFunds: "12.5"
    },
    {
      address: "0xDd763ED8Ce604E9a61F1e1aed433c1362e05700d", // positions keeper 1
      targetFunds: "12.5"
    },
    {
      address: "0x2BcD0d9Dde4bD69C516Af4eBd3fB7173e1FA12d0", // positions keeper 2
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
    },
    {
      address: "0x75f6250b9CeED446b2F25385832dF08DB45a90b0", // shorts tracker keeper
      targetFunds: "2"
    },
    {
      address: "0xB4d2603B2494103C90B2c607261DD85484b49eF0", // open interest cap keeper
      targetFunds: "2"
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
      address: "0x48F5f003559A239ff37cbFDCc6a6d936365bd4c4", // price sender 1
      targetFunds: "1250"
    },
    {
      address: "0xDc32caC19d77aD8f6b64094dd39b2E441D997e03", // price sender 2
      targetFunds: "1250"
    },
    {
      address: "0x74F6024CA6a03898F31e0d8E324f1a45f049eF03", // positions keeper 1
      targetFunds: "1250"
    },
    {
      address: "0x65910425E325910B1a67A320408E0d57b4E0Ca11", // positions keeper 2
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
      targetFunds: "50"
    },
    {
      address: "0xB4d2603B2494103C90B2c607261DD85484b49eF0", // open interest cap keeper
      targetFunds: "50"
    }
  ]

  const transfers = await getTransferItems(keepers, provider)
  const totalTransferAmount = await getTotalTransferAmount(transfers)

  return { sender, transfers, totalTransferAmount, tokens, gasToken: "AVAX" }
}

async function getValues() {
  if (network === "arbitrum") {
    return await getArbValues()
  }

  if (network === "avax") {
    return await getAvaxValues()
  }
}

module.exports = {
  getArbValues,
  getAvaxValues,
  getValues
}
