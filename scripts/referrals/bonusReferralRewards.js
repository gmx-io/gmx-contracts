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

async function setBonusReferralRewards({ from, to }) {
  const values = {
    arbitrum: await getArbValues(),
    avalanche: await getAvaxValues(),
  }

  const remapBase = {
    "0x43e37ae780aac89aadd10097bd90d5a79e1192ed": "0x5fd4c8565f7711e04bff0e8b5c155ad891993b51"
  }

  const remap = {}

  for (const [account0, account1] of Object.entries(remapBase)) {
    remap[account0.toLowerCase()] = account1.toLowerCase()
  }

  for (let i = 0; i < networks.length; i++) {
    const network = networks[i]
    const { vester } = values[network]
    const timelock = await contractAt("Timelock", await vester.gov(), deployers[network])
    const list = await getEsGMXReferralRewardsData({ network, from, to })
    await processBatch([list], 10, async (currentBatch) => {
      const accounts = currentBatch.map(item => item[0].account)
      for (let j = 0; j < accounts.length; j++) {
        const account = accounts[j]
        if (remap[account]) {
          accounts[j] = remap[account]
        }
      }
      const amounts = currentBatch.map(item => item[0].amount)
      console.log("accounts", accounts)
      console.log("amounts", amounts)
      await sendTxn(timelock.batchSetBonusRewards(vester.address, accounts, amounts), "timelock.batchSetBonusRewards(vester.address, accounts, amounts)")
    })
  }

}

module.exports = { setBonusReferralRewards }
