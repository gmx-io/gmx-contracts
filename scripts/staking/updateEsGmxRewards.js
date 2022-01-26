const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

async function getArbValues(signer) {
  const rewardTracker = await contractAt("RewardTracker", "0x908C4D94D34924765f1eDc22A1DD098397c59dD4")
  const tokenDecimals = 18

  return { tokenDecimals, rewardTracker }
}

async function getAvaxValues(signer) {
  const rewardTracker = await contractAt("RewardTracker", "0x2bD10f8E93B3669b6d42E74eEedC65dd1B0a1342")
  const tokenDecimals = 18

  return { tokenDecimals, rewardTracker }
}

function toInt(value) {
  return parseInt(value.replaceAll(",", ""))
}

async function main() {
  let tokenDecimals, rewardTracker

  if (network === "arbitrum") {
    ;({ tokenDecimals, rewardTracker }  = await getArbValues());
  }

  if (network === "avax") {
    ;({ tokenDecimals, rewardTracker }  = await getAvaxValues());
  }

  const stakedAmounts = {
    arbitrum: {
      gmx: toInt("6,312,741"),
      esGmx: toInt("681,706")
    },
    avax: {
      gmx: toInt("244,903"),
      esGmx: toInt("29,274")
    }
  }

  let totalStaked = 0
  for (const net in stakedAmounts) {
    stakedAmounts[net].total = stakedAmounts[net].gmx + stakedAmounts[net].esGmx
    totalStaked += stakedAmounts[net].total
  }

  const totalEsGmxRewards = expandDecimals(100000, tokenDecimals)
  const secondsPerMonth = 28 * 24 * 60 * 60

  const rewardDistributorAddress = await rewardTracker.distributor()
  const rewardDistributor = await contractAt("RewardDistributor", rewardDistributorAddress)

  const currentTokensPerInterval = await rewardDistributor.tokensPerInterval()
  const nextTokensPerInterval = totalEsGmxRewards.mul(stakedAmounts[network].total).div(totalStaked).div(secondsPerMonth)
  const delta = nextTokensPerInterval.sub(currentTokensPerInterval).mul(10000).div(currentTokensPerInterval)

  console.log("currentTokensPerInterval", currentTokensPerInterval.toString())
  console.log("nextTokensPerInterval", nextTokensPerInterval.toString(), `${delta.toNumber() / 100.00}%`)

  const shouldUpdate = true

  if (shouldUpdate) {
    await sendTxn(rewardDistributor.setTokensPerInterval(nextTokensPerInterval), "rewardDistributor.setTokensPerInterval")
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
