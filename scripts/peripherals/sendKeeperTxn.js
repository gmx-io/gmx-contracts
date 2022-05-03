const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { contractAt } = require("../shared/helpers")
const BaseToken = require("../../artifacts/contracts/tokens/BaseToken.sol/BaseToken.json")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

const {
  ARBITRUM_URL,
  ARBITRUM_DEPLOY_KEY,
  ARBITRUM_PRICE_TXN_URL,
  ARBITRUM_PRICE_KEY,
  AVAX_URL,
  AVAX_DEPLOY_KEY,
  AVAX_PRICE_TXN_URL,
  AVAX_PRICE_KEY,
} = require("../../env.json")

async function getArbValues() {
  const provider = new ethers.providers.JsonRpcProvider(ARBITRUM_URL)
  const wallet = new ethers.Wallet(ARBITRUM_DEPLOY_KEY).connect(provider)
  const priceTxnUrl = ARBITRUM_PRICE_TXN_URL
  const priceKey = ARBITRUM_PRICE_KEY
  const gmx = new ethers.Contract("0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a", BaseToken.abi, wallet)

  return { wallet, priceTxnUrl, priceKey, gmx }
}

async function getAvaxValues() {
  const provider = new ethers.providers.JsonRpcProvider(AVAX_URL)
  const wallet = new ethers.Wallet(AVAX_DEPLOY_KEY).connect(provider)
  const priceTxnUrl = AVAX_PRICE_TXN_URL
  const priceKey = AVAX_PRICE_KEY
  const gmx = new ethers.Contract("0x62edc0692BD897D2295872a9FFCac5425011c661", BaseToken.abi, wallet)

  return { wallet, priceTxnUrl, priceKey, gmx }
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
  const { wallet, priceTxnUrl, priceKey, gmx } = await getValues()

  let unsignedTxn = await gmx.populateTransaction.approve("0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8", 100)
  unsignedTxn = await wallet.populateTransaction(unsignedTxn)
  console.log("unsignedTxn", unsignedTxn)
  const rawTxn = await wallet.signTransaction(unsignedTxn)
  console.log("priceTxnUrl", priceTxnUrl)

  const startTime = Date.now()

  const body = JSON.stringify({
    key: priceKey,
    content: rawTxn
  })

  console.log("post", body)
  const result = await fetch(priceTxnUrl, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body
  })

  console.log('post price txn time taken:', Date.now() - startTime)
  console.log("rawTxn", rawTxn)

  const resultContent = await result.text()

  console.log("result", result.status, resultContent)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
