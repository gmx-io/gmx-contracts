const { getEsGMXReferralRewardsData } = require("./distributionData")


async function main() {
  const network = "arbitrum"
  await getEsGMXReferralRewardsData(network, 1711929600, 1709157600)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
