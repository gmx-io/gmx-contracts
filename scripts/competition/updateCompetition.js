const { contractAt, sendTxn } = require("../shared/helpers")

async function main() {
  const competition = await contractAt("Competition", "0x17fb5AEEF7221353B6B2D12EDDa0Dd5655Ec25b2");

  await sendTxn(competition.updateCompetition(
    0,
    1672527599,
    1704063599,
    10
  ), "competition.updateCompetition(index, start, end, maxTeamSize)")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
