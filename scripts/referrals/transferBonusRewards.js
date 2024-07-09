const { contractAt, sendTxn, processBatch } = require("../shared/helpers")
const { getEsGMXReferralRewardsData } = require("./distributionData")

const {
  ARBITRUM_URL,
  AVAX_URL,
  ARBITRUM_DEPLOY_KEY,
  AVAX_DEPLOY_KEY,
} = require("../../env.json");

const ARBITRUM = "arbitrum"
const AVALANCHE = "avalanche"
const networks = [ARBITRUM, AVALANCHE]

const providers = {
  arbitrum: new ethers.providers.JsonRpcProvider(ARBITRUM_URL),
  avalanche: new ethers.providers.JsonRpcProvider(AVAX_URL)
}

const deployers = {
  arbitrum: new ethers.Wallet(ARBITRUM_DEPLOY_KEY).connect(providers.arbitrum),
  avalanche: new ethers.Wallet(AVAX_DEPLOY_KEY).connect(providers.avalanche)
}

async function getArbValues() {
  const deployer = deployers.arbitrum
  const vester = await contractAt("Vester", "0x7c100c0F55A15221A4c1C5a25Db8C98A81df49B2", deployer)
  return { vester }
}

async function getAvaxValues() {
  const deployer = deployers.avalanche
  const vester = await contractAt("Vester", "0x754eC029EF9926184b4CFDeA7756FbBAE7f326f7", deployer)
  return { vester }
}

async function transferBonusRewards() {
  const values = {
    arbitrum: await getArbValues(),
    avalanche: await getAvaxValues(),
  }

  const transfers = [
    { from: "0xe7CE1c48C62412115f212DE69860B063765DE10a", to: "0x59c453476EfC41164614883eaa8aA54D9798fF76" }
  ]

  for (let i = 0; i < networks.length; i++) {
    const network = networks[i]
    const { vester } = values[network]
    const timelock = await contractAt("Timelock", await vester.gov(), deployers[network])

    for (let j = 0; j < transfers.length; j++) {
      const transfer = transfers[j]
      const fromAmount = await vester.bonusRewards(transfer.from)
      const toAmount = await vester.bonusRewards(transfer.to)
      if (fromAmount.eq(0)) {
        console.log(`skipping transfer for ${transfer.from} as fromAmount is zero`)
      }
      if (toAmount.gt(0)) {
        console.log(`skipping transfer for ${transfer.to} as toAmount is more than zero`)
      }

      console.log(`transferring from ${transfer.from} to ${transfer.to}: ${fromAmount.toString()}`)
      if (process.env.WRITE === "true") {
        await sendTxn(timelock.batchSetBonusRewards(vester.address, [transfer.from, transfer.to], [0, fromAmount]), "timelock.batchSetBonusRewards(vester.address, accounts, amounts)")
      }
    }
  }
}

async function main() {
  await transferBonusRewards()
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
