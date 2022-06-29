const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

const shouldSendTxn = true

const monthlyEsGmxForGlpOnArb = expandDecimals(toInt("50,000"), 18)
const monthlyEsGmxForGlpOnAvax = expandDecimals(toInt("24,417"), 18)

const stakedGmxOnArb = toInt("6,238,739")
const stakedGmxOnAvax = toInt("448,243")

const stakedEsGmxOnArb = toInt("1,361,552")
const stakedEsGmxOnAvax = toInt("207,892")

async function getArbValues(signer) {
  const gmxRewardTracker = await contractAt("RewardTracker", "0x908C4D94D34924765f1eDc22A1DD098397c59dD4")
  const glpRewardTracker = await contractAt("RewardTracker", "0x1aDDD80E6039594eE970E5872D247bf0414C8903")
  const tokenDecimals = 18
  const monthlyEsGmxForGlp = monthlyEsGmxForGlpOnArb

  return { tokenDecimals, gmxRewardTracker, glpRewardTracker, monthlyEsGmxForGlp }
}

async function getAvaxValues(signer) {
  const gmxRewardTracker = await contractAt("RewardTracker", "0x2bD10f8E93B3669b6d42E74eEedC65dd1B0a1342")
  const glpRewardTracker = await contractAt("RewardTracker", "0x9e295B5B976a184B14aD8cd72413aD846C299660")
  const tokenDecimals = 18
  const monthlyEsGmxForGlp = monthlyEsGmxForGlpOnAvax

  return { tokenDecimals, gmxRewardTracker, glpRewardTracker, monthlyEsGmxForGlp }
}

function getValues() {
  if (network === "arbitrum") {
    return getArbValues()
  }

  if (network === "avax") {
    return getAvaxValues()
  }
}

function toInt(value) {
  return parseInt(value.replaceAll(",", ""))
}

async function main() {
  const { tokenDecimals, gmxRewardTracker, glpRewardTracker, monthlyEsGmxForGlp } = await getValues()

  const stakedAmounts = {
    arbitrum: {
      gmx: stakedGmxOnArb,
      esGmx: stakedEsGmxOnArb
    },
    avax: {
      gmx: stakedGmxOnAvax,
      esGmx: stakedEsGmxOnAvax
    }
  }

  let totalStaked = 0
  for (const net in stakedAmounts) {
    stakedAmounts[net].total = stakedAmounts[net].gmx + stakedAmounts[net].esGmx
    totalStaked += stakedAmounts[net].total
  }

  const totalEsGmxRewards = expandDecimals(100000, tokenDecimals)
  const secondsPerMonth = 28 * 24 * 60 * 60

  const gmxRewardDistributor = await contractAt("RewardDistributor", await gmxRewardTracker.distributor())

  const gmxCurrentTokensPerInterval = await gmxRewardDistributor.tokensPerInterval()
  const gmxNextTokensPerInterval = totalEsGmxRewards.mul(stakedAmounts[network].total).div(totalStaked).div(secondsPerMonth)
  const gmxDelta = gmxNextTokensPerInterval.sub(gmxCurrentTokensPerInterval).mul(10000).div(gmxCurrentTokensPerInterval)

  console.log("gmxCurrentTokensPerInterval", gmxCurrentTokensPerInterval.toString())
  console.log("gmxNextTokensPerInterval", gmxNextTokensPerInterval.toString(), `${gmxDelta.toNumber() / 100.00}%`)

  const glpRewardDistributor = await contractAt("RewardDistributor", await glpRewardTracker.distributor())

  const glpCurrentTokensPerInterval = await glpRewardDistributor.tokensPerInterval()
  const glpNextTokensPerInterval = monthlyEsGmxForGlp.div(secondsPerMonth)

  console.log("glpCurrentTokensPerInterval", glpCurrentTokensPerInterval.toString())
  console.log("glpNextTokensPerInterval", glpNextTokensPerInterval.toString())

  if (shouldSendTxn) {
    await sendTxn(gmxRewardDistributor.setTokensPerInterval(gmxNextTokensPerInterval, { gasLimit: 500000 }), "gmxRewardDistributor.setTokensPerInterval")
    await sendTxn(glpRewardDistributor.setTokensPerInterval(glpNextTokensPerInterval, { gasLimit: 500000 }), "glpRewardDistributor.setTokensPerInterval")
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
