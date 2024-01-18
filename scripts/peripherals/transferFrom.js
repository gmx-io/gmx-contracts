const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

const {
  ARBITRUM_URL,
  ARBITRUM_PAYMENTS_KEY,
  AVAX_URL,
  AVAX_PAYMENTS_KEY,
} = require("../../env.json")

async function main() {
  const avaxProvider = new ethers.providers.JsonRpcProvider(AVAX_URL)
  const avaxWallet = new ethers.Wallet(AVAX_PAYMENTS_KEY).connect(avaxProvider)

  const sender = "0xfA7046e0a049ed8528f1c40d3bD66c1555f7Ec9C"
  const receiver = "0xf66c5E4a91FF10466E78BD50F87449a802053112"

  const tokenAddress = "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E"
  const tokenAmount = "138000000000"

  const token = await contractAt("Token", tokenAddress, avaxWallet)
  await sendTxn(token.transferFrom(sender, receiver, tokenAmount), "token.transferFrom")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
