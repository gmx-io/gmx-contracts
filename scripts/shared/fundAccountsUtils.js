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
      console.log("transferItem", keeper.address, amountToSend.toString())
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
      address: "0xF5d278923f4CB4fcfa36Af6F064B8b3d0A8eC7e3", // reward router keeper
      targetFunds: "2"
    },
    {
      address: "0xB4d2603B2494103C90B2c607261DD85484b49eF0", // open interest cap keeper
      targetFunds: "2"
    },
    {
      address: "0xDA1b841A21FEF1ad1fcd5E19C1a9D682FB675258", // relay keeper
      targetFunds: "1"
    },
    {
      address: "0x42939e82DF15afc586bb95f7dD69Afb6Dc24A6f9", // risk oracle keeper
      targetFunds: "2"
    },
    {
      address: "0xE47b36382DC50b90bCF6176Ddb159C4b9333A7AB", // v2 keeper 1
      targetFunds: "3.5"
    },
    {
      address: "0xC539cB358a58aC67185BaAD4d5E3f7fCfc903700", // v2 keeper 2
      targetFunds: "3.5"
    },
    {
      address: "0xf1e1B2F4796d984CCb8485d43db0c64B83C1FA6d", // v2 keeper 3
      targetFunds: "3.5"
    },
    {
      address: "0xdE10336a5C37Ab8FBfd6cd53bdECa5b0974737ba", // v2 keeper 4
      targetFunds: "3.5"
    },
    {
      address: "0x8808c5E5Bc9317Bf8cb5eE62339594b8d95f77df", // v2 keeper 5
      targetFunds: "3.5"
    },
    {
      address: "0x8E66ee36F2C7B9461F50aA0b53eF0E4e47F4ABBf", // v2 keeper 6
      targetFunds: "3.5"
    },
    {
      address: "0x6A2B3A13be0c723674BCfd722d4e133b3f356e05", // v2 keeper 7
      targetFunds: "3.5"
    },
    {
      address: "0xDd5c59B7C4e8faD38732caffbeBd20a61bf9F3FC", // v2 keeper 8
      targetFunds: "3.5"
    },
    {
      address: "0xEB2bB25dDd2B1872D5189Ae72fCeC9b160dD3FB2", // v2 keeper 9
      targetFunds: "3.5"
    },
    {
      address: "0xa17A86388BBcE9fd73a67F66D87FB0222A824c3f", // v2 keeper 10
      targetFunds: "3.5"
    },
    {
      address: "0x86fe53a6D47d9a0fDEA4C5Ac3D80E0E6CC3354cc", // v2 keeper 11
      targetFunds: "3.5"
    },
    {
      address: "0x8E2e2Dd583e7DB8437164A7F89A7288b999253CB", // v2 keeper 12
      targetFunds: "3.5"
    },
    {
      address: "0xC0a53a9Ee8E8ea0f585d8DcF26800EF2841f97fD", // v2 keeper 13
      targetFunds: "3.5"
    },
    {
      address: "0xd316a0043056fb787dE34ABA8cd5323f5C6f8c47", // v2 keeper 14
      targetFunds: "3.5"
    },
    {
      address: "0xB874e07336Edc0c278C276FfEb08818976099256", // v2 keeper 15
      targetFunds: "3.5"
    },
    {
      address: "0xa5E4a14CaB506bA102977648317E0622cA60BB64", // v2 keeper 16
      targetFunds: "3.5"
    },
    {
      address: "0xdAD787D5a86f37a5E480e35b3Ca615D46242Ce9B", // v2 keeper 17
      targetFunds: "3.5"
    },
    {
      address: "0x56a7CE61D8aB46A27De1837ceddd8522D52D2736", // v2 keeper 18
      targetFunds: "3.5"
    },
    {
      address: "0xC9A5775951F0ea25053fEe81D935FBBF4F0Fb273", // v2 keeper 19
      targetFunds: "3.5"
    },
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
      address: "0xd85A5c465824537eA2005590Da909447bca12525", // price sender pyth 1
      targetFunds: "100"
    },
    {
      address: "0x3FC8e4ED7695F44358B387d67940DF580d80bD5B", // price sender pyth 2
      targetFunds: "100"
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
      address: "0xF5d278923f4CB4fcfa36Af6F064B8b3d0A8eC7e3", // reward router keeper
      targetFunds: "50"
    },
    {
      address: "0xB4d2603B2494103C90B2c607261DD85484b49eF0", // open interest cap keeper
      targetFunds: "50"
    },
    {
      address: "0xDA1b841A21FEF1ad1fcd5E19C1a9D682FB675258", // relay keeper
      targetFunds: "100"
    },
    {
      address: "0xE47b36382DC50b90bCF6176Ddb159C4b9333A7AB", // v2 keeper 1
      targetFunds: "200"
    },
    {
      address: "0xC539cB358a58aC67185BaAD4d5E3f7fCfc903700", // v2 keeper 2
      targetFunds: "200"
    },
    {
      address: "0xf1e1B2F4796d984CCb8485d43db0c64B83C1FA6d", // v2 keeper 3
      targetFunds: "200"
    },
    {
      address: "0xdE10336a5C37Ab8FBfd6cd53bdECa5b0974737ba", // v2 keeper 4
      targetFunds: "200"
    },
    {
      address: "0x8808c5E5Bc9317Bf8cb5eE62339594b8d95f77df", // v2 keeper 5
      targetFunds: "200"
    },
    {
      address: "0x8E66ee36F2C7B9461F50aA0b53eF0E4e47F4ABBf", // v2 keeper 6
      targetFunds: "200"
    },
    {
      address: "0x6A2B3A13be0c723674BCfd722d4e133b3f356e05", // v2 keeper 7
      targetFunds: "200"
    },
    {
      address: "0xDd5c59B7C4e8faD38732caffbeBd20a61bf9F3FC", // v2 keeper 8
      targetFunds: "200"
    },
    {
      address: "0xEB2bB25dDd2B1872D5189Ae72fCeC9b160dD3FB2", // v2 keeper 9
      targetFunds: "200"
    },
    {
      address: "0xa17A86388BBcE9fd73a67F66D87FB0222A824c3f", // v2 keeper 10
      targetFunds: "200"
    },
    {
      address: "0x86fe53a6D47d9a0fDEA4C5Ac3D80E0E6CC3354cc", // v2 keeper 11
      targetFunds: "200"
    },
    {
      address: "0x8E2e2Dd583e7DB8437164A7F89A7288b999253CB", // v2 keeper 12
      targetFunds: "200"
    },
    {
      address: "0xC0a53a9Ee8E8ea0f585d8DcF26800EF2841f97fD", // v2 keeper 13
      targetFunds: "200"
    },
    {
      address: "0xd316a0043056fb787dE34ABA8cd5323f5C6f8c47", // v2 keeper 14
      targetFunds: "200"
    },
    {
      address: "0xB874e07336Edc0c278C276FfEb08818976099256", // v2 keeper 15
      targetFunds: "200"
    },
    {
      address: "0xa5E4a14CaB506bA102977648317E0622cA60BB64", // v2 keeper 16
      targetFunds: "200"
    },
    {
      address: "0xdAD787D5a86f37a5E480e35b3Ca615D46242Ce9B", // v2 keeper 17
      targetFunds: "200"
    },
    {
      address: "0x56a7CE61D8aB46A27De1837ceddd8522D52D2736", // v2 keeper 18
      targetFunds: "200"
    },
    {
      address: "0xC9A5775951F0ea25053fEe81D935FBBF4F0Fb273", // v2 keeper 19
      targetFunds: "200"
    },
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
