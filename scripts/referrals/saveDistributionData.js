const { ArgumentParser } = require('argparse');
const { saveDistributionData } = require("./distributionData")

async function main() {
  const parser = new ArgumentParser({
    description: 'Get distribution data'
  });
  parser.add_argument('-n', '--network', {
    help: 'Network: arbitrum, avalanche',
    required: true
  });
  parser.add_argument('-f', '--from-date', {
    help: 'Date from. E.g. 2022-04-20',
    default: "2022-04-20"
  });
  parser.add_argument('-t', '--to-date', {
    help: 'Date to. Exclusive. E.g. 2022-04-27',
    default: "2022-04-27"
  });
  parser.add_argument('-a', '--account', { help: 'Account address' })
  parser.add_argument('-g', '--gmx-price', { help: 'GMX TWAP price' })
  parser.add_argument('-e', '--esgmx-rewards', {
    help: 'Amount of EsGMX to distribute to Tier 3',
    default: "5000"
  })

  const args = parser.parse_args()

  const fromDate = new Date(args.from_date)
  const fromTimestamp = parseInt(+fromDate / 1000)
  const toDate = new Date(args.to_date)
  const toTimestamp = parseInt(+toDate / 1000)

  console.log("Running script to get distribution data")
  console.log("Network: %s", args.network)
  console.log("From: %s (timestamp %s)", fromDate.toISOString().substring(0, 10), fromTimestamp)
  console.log("To (exclusively): %s (timestamp %s)", toDate.toISOString().substring(0, 10), toTimestamp)
  if (args.account) {
     console.log("Account: %s", args.account)
  }

  await saveDistributionData(
    args.network,
    fromTimestamp,
    toTimestamp,
    args.account,
    args.gmx_price,
    args.esgmx_rewards
  )
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
