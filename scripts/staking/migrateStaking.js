const path = require('path')
const { contractAt, sendTxn, readCsv, sleep } = require("../shared/helpers")

const {
  ARBITRUM_URL,
  AVAX_URL,
  REWARD_ROUTER_KEEPER_KEY
} = require("../../env.json");

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

const inputDir = path.resolve(__dirname, "../..") + "/data/staking/"

const providers = {
  arbitrum: new ethers.providers.JsonRpcProvider(ARBITRUM_URL),
  avax: new ethers.providers.JsonRpcProvider(AVAX_URL)
}

const keepers = {
  arbitrum: new ethers.Wallet(REWARD_ROUTER_KEEPER_KEY).connect(providers.arbitrum),
  avax: new ethers.Wallet(REWARD_ROUTER_KEEPER_KEY).connect(providers.avax)
}

async function getArbValues() {
  return {
    rewardRouter: await contractAt("RewardRouterV2", "0x5E4766F932ce00aA4a1A82d3Da85adf15C5694A1", keepers.arbitrum),
    accountListFile: inputDir + "2024-10-28-sbfgmx-holders-arbitrum.csv"
  }
}

async function getAvaxValues() {
  return {
    rewardRouter: await contractAt("RewardRouterV2", "0x091eD806490Cc58Fd514441499e58984cCce0630", keepers.avax),
    accountListFile: inputDir + "2024-10-28-sbfgmx-holders-avalanche.csv"
  }
}

async function getValues() {
  if (network === "arbitrum") {
    return await getArbValues()
  }

  if (network === "avax") {
    return await getAvaxValues()
  }
}

async function main() {
  const { accountListFile, rewardRouter } = await getValues()
  const accountList = await readCsv(accountListFile)

  const batchSize = parseInt(process.env.BATCH_SIZE)
  if (isNaN(batchSize)) {
    throw new Error("BATCH_SIZE not specified")
  }

  let startIndex = process.env.START_INDEX
  if (startIndex === undefined) {
    throw new Error("START_INDEX not specified")
  }

  startIndex = parseInt(startIndex)

  for (let i = startIndex; i < accountList.length; i += batchSize) {
    const from = i
    const to = i + batchSize
    const accounts = accountList.slice(from, to).map(i => i.HolderAddress)
    console.log(`processing accounts ${from} to ${to}`)

    for (let j = 0; j < 5; j++) {
      try {
        await sendTxn(rewardRouter.batchRestakeForAccounts(accounts), `batchRestakeForAccounts ${from} to ${to}`)
        break
      } catch (e) {
        console.log(e)
        console.log("retrying")
        sleep(2)
      }

      if (j == 4) {
        throw new Error("could not send txn")
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
