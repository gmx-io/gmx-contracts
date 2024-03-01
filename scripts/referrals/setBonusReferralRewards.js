const { setBonusReferralRewards } = require("./bonusReferralRewards")

async function main() {
  await setBonusReferralRewards({ from: 1648771200, to: 1709157600 })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
