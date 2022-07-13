const { getFrameSigner, sendTxn } = require("../shared/helpers")
const { bigNumberify } = require("../../test/shared/utilities")
const network = (process.env.HARDHAT_NETWORK || 'mainnet');

const {
  ARBITRUM_URL,
  ARBITRUM_DEPLOY_KEY,
  AVAX_URL,
  AVAX_DEPLOY_KEY,
} = require("../../env.json")

function getArbValues() {
  const provider = new ethers.providers.JsonRpcProvider(ARBITRUM_URL)
  const sender = new ethers.Wallet(ARBITRUM_DEPLOY_KEY).connect(provider)

  const transfers = [
    {
      address: "0x1E359EaE31F5815AC3D5B337B26771Bc8ADbDFA3", // price sender
      amount: "0.7"
    },
    {
      address: "0xEF9092d35Fda3e5b6E2Dd3Fac5b580aefc346FAf", // positions keeper
      amount: "0"
    },
    {
      address: "0xd4266F8F82F7405429EE18559e548979D49160F3", // order keeper
      amount: "0"
    },
    {
      address: "0x44311c91008DDE73dE521cd25136fD37d616802c", // liquidator
      amount: "0.2"
    }
  ]

  return { sender, transfers, gasToken: "ETH" }
}

function getAvaxValues() {
  const provider = new ethers.providers.JsonRpcProvider(AVAX_URL)
  const sender = new ethers.Wallet(AVAX_DEPLOY_KEY).connect(provider)

  const transfers = [
    {
      address: "0x89a072F18c7D0Bdf568e93553B715BBf5205690e", // price sender
      amount: "32"
    },
    {
      address: "0x864dB9152169D68299b599331c6bFc77e3F91070", // positions keeper
      amount: "141"
    },
    {
      address: "0x06f34388A7CFDcC68aC9167C5f1C23DD39783179", // order keeper
      amount: "8"
    },
    {
      address: "0x7858A4C42C619a68df6E95DF7235a9Ec6F0308b9", // liquidator
      amount: "8"
    }
  ]

  return { sender, transfers, gasToken: "AVAX" }
}

function getValues() {
  if (network === "arbitrum") {
    return getArbValues()
  }

  if (network === "avax") {
    return getAvaxValues()
  }
}

async function main() {
  const signer = await getFrameSigner()
  const { sender, transfers, gasToken } = getValues()

  let totalAmount = 0.0
  for (let i = 0; i < transfers.length; i++) {
    const transferItem = transfers[i]
    totalAmount += parseFloat(transferItem.amount)
  }

  await sendTxn(signer.sendTransaction({
    to: sender.address,
    value: ethers.utils.parseEther(totalAmount.toString())
  }), `${totalAmount} ${gasToken} to ${sender.address}`)

  for (let i = 0; i < transfers.length; i++) {
    const transferItem = transfers[i]

    if (parseFloat(transferItem.amount) === 0) {
      continue
    }

    await sendTxn(sender.sendTransaction({
      to: transferItem.address,
      value: ethers.utils.parseEther(transferItem.amount)
    }), `${transferItem.amount} ${gasToken} to ${transferItem.address}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
