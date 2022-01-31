const { getFrameSigner, deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

async function getArbValues(signer) {
  const rewardToken = await contractAt("Token", "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", signer)
  const tokenDecimals = 18

  const rewardTrackerArr = [
    {
      name: "feeGmxTracker",
      address: "0xd2D1162512F927a7e282Ef43a362659E4F2a728F",
      transferAmount: "410"
    },
    {
      name: "feeGlpTracker",
      address: "0x4e971a87900b931fF39d1Aad67697F49835400b6",
      transferAmount: "592"
    }
  ]

  return { rewardToken, tokenDecimals, rewardTrackerArr }
}

async function getAvaxValues(signer) {
  const rewardToken = await contractAt("Token", "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", signer)
  const tokenDecimals = 18

  const rewardTrackerArr = [
    {
      name: "feeGmxTracker",
      address: "0x4d268a7d4C16ceB5a606c173Bd974984343fea13",
      transferAmount: "470"
    },
    {
      name: "feeGlpTracker",
      address: "0xd2D1162512F927a7e282Ef43a362659E4F2a728F",
      transferAmount: "14245"
    }
  ]

  return { rewardToken, tokenDecimals, rewardTrackerArr }
}

async function main() {
  const signer = await getFrameSigner()
  let rewardToken, tokenDecimals, rewardTrackerArr

  if (network === "arbitrum") {
    ;({ rewardToken, tokenDecimals, rewardTrackerArr }  = await getArbValues(signer));
  }

  if (network === "avax") {
    ;({ rewardToken, tokenDecimals, rewardTrackerArr }  = await getAvaxValues(signer));
  }

  for (let i = 0; i < rewardTrackerArr.length; i++) {
    const rewardTrackerItem = rewardTrackerArr[i]
    const { transferAmount } = rewardTrackerItem
    const rewardTracker = await contractAt("RewardTracker", rewardTrackerItem.address)
    const rewardDistributorAddress = await rewardTracker.distributor()
    const rewardDistributor = await contractAt("RewardDistributor", rewardDistributorAddress)
    const convertedTransferAmount = ethers.utils.parseUnits(transferAmount, tokenDecimals)
    const rewardsPerInterval = convertedTransferAmount.div(7 * 24 * 60 * 60)
    console.log("rewardDistributorAddress", rewardDistributorAddress)
    console.log("convertedTransferAmount", convertedTransferAmount.toString())
    console.log("rewardsPerInterval", rewardsPerInterval.toString())

    await sendTxn(rewardToken.transfer(rewardDistributorAddress, convertedTransferAmount), `rewardToken.transfer ${i}`)
    await sendTxn(rewardDistributor.setTokensPerInterval(rewardsPerInterval), "rewardDistributor.setTokensPerInterval")
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
