const { getFrameSigner } = require("../shared/helpers")
const network = (process.env.HARDHAT_NETWORK || 'mainnet');

function getArbTransfers() {
  return [
    {
      address: "0x67F1B9E91D7bB46556ba013c1B187C461e2a1Ffd", // price sender
      amount: "1.5"
    },
    {
      address: "0xEF9092d35Fda3e5b6E2Dd3Fac5b580aefc346FAf", // positions keeper
      amount: "7"
    },
    {
      address: "0xd4266F8F82F7405429EE18559e548979D49160F3", // order keeper
      amount: "0"
    },
    {
      address: "0x44311c91008DDE73dE521cd25136fD37d616802c", // liquidator
      amount: "0"
    }
  ]
}

function getAvaxTransfers() {
  return [
    {
      address: "0xB6A92Ae811B6A3530b4C01a78651ad295D9570d4", // price sender
      amount: "67"
    },
    {
      address: "0x864dB9152169D68299b599331c6bFc77e3F91070", // positions keeper
      amount: "200"
    },
    {
      address: "0x06f34388A7CFDcC68aC9167C5f1C23DD39783179", // order keeper
      amount: "17"
    },
    {
      address: "0x7858A4C42C619a68df6E95DF7235a9Ec6F0308b9", // liquidator
      amount: "8"
    }
  ]
}

async function main() {
  const signer = await getFrameSigner()

  let transfers

  if (network === "avax") {
    transfers = getAvaxTransfers()
  }
  if (network === "arbitrum") {
    transfers = getArbTransfers()
  }

  for (let i = 0; i < transfers.length; i++) {
    const transferItem = transfers[i]
    if (parseFloat(transferItem.amount) === 0) {
      continue
    }
    await signer.sendTransaction({
      to: transferItem.address,
      value: ethers.utils.parseEther(transferItem.amount)
    })
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
