const { contractAt , sendTxn, sleep } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")

const {
  ARBITRUM_URL,
  AVAX_URL,
} = require("../../env.json")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

async function getArbValues() {
  const provider = new ethers.providers.JsonRpcProvider(ARBITRUM_URL)
  const account = "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8"

  return { provider, account }
}

async function getAvaxValues() {
  const provider = new ethers.providers.JsonRpcProvider(AVAX_URL)
  const account = "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8"

  return { provider, account }
}

async function getValues() {
  if (network === "arbitrum") {
    return getArbValues()
  }

  if (network === "avax") {
    return getAvaxValues()
  }
}

async function main() {
  const { provider, account } = await getValues()
  const latestNonce = await provider.getTransactionCount(account)
  console.log("account", account)
  console.log("latestNonce", latestNonce)

  const potentialContracts = []
  for (let i = 0; i < latestNonce; i++) {
    const nonce = i
    const contractAddress = ethers.utils.getContractAddress({ from: account, nonce })
    potentialContracts.push({
      nonce,
      address: contractAddress
    })
  }

  let index = 0
  const batchSize = 10
  while (true) {
    const potentialContractsBatch = potentialContracts.slice(index, index + batchSize)
    if (potentialContractsBatch.length === 0) {
      break
    }

    try {
      const promises = potentialContractsBatch.map((contract) => provider.getCode(contract.address))
      const results = await Promise.all(promises)
      const isContract = results.map((r) => r !== "0x")
      for (let i = 0; i < potentialContractsBatch.length; i++) {
        const contract = potentialContractsBatch[i]
        contract.isContract = isContract[i]
        if (contract.isContract) {
          console.log([contract.nonce, contract.address, potentialContracts[index + i].isContract].join(","))
        }
      }

      index += batchSize
    } catch (e) {
      console.error("error", e)
    }
  }

  const contracts = potentialContracts.filter((contract) => contract.isContract)
  console.log(JSON.stringify(contracts))
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
