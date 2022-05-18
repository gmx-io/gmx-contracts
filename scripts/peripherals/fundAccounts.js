const { getFrameSigner, sendTxn } = require("../shared/helpers")
const network = (process.env.HARDHAT_NETWORK || 'mainnet');

function getArbTransfers() {
  return [
    {
      address: "0x1E359EaE31F5815AC3D5B337B26771Bc8ADbDFA3", // price sender
      amount: "9.7"
    },
    {
      address: "0xEF9092d35Fda3e5b6E2Dd3Fac5b580aefc346FAf", // positions keeper
      amount: "0.7"
    },
    {
      address: "0xd4266F8F82F7405429EE18559e548979D49160F3", // order keeper
      amount: "0.4"
    },
    {
      address: "0x44311c91008DDE73dE521cd25136fD37d616802c", // liquidator
      amount: "0.7"
    }
  ]
}

function getAvaxTransfers() {
  return [
    {
      address: "0x89a072F18c7D0Bdf568e93553B715BBf5205690e", // price sender
      amount: "69"
    },
    {
      address: "0x864dB9152169D68299b599331c6bFc77e3F91070", // positions keeper
      amount: "53"
    },
    {
      address: "0x06f34388A7CFDcC68aC9167C5f1C23DD39783179", // order keeper
      amount: "8"
    },
    {
      address: "0x7858A4C42C619a68df6E95DF7235a9Ec6F0308b9", // liquidator
      amount: "7"
    }
  ]
}

async function main() {
  const signer = await getFrameSigner()

  let transfers
  let gasToken

  if (network === "avax") {
    transfers = getAvaxTransfers()
    gasToken = "AVAX"
  }
  if (network === "arbitrum") {
    transfers = getArbTransfers()
    gasToken = "ETH"
  }

  for (let i = 0; i < transfers.length; i++) {
    const transferItem = transfers[i]
    if (parseFloat(transferItem.amount) === 0) {
      continue
    }
    await sendTxn(signer.sendTransaction({
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
