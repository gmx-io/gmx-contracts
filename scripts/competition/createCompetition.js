const { ethers } = require("hardhat");
const { contractAt, sendTxn } = require("../shared/helpers")

async function main() {
  const competition = await contractAt("Competition", "0x271B8D7b97A07207BAd07dc577F6D29D6a368C56");

  await sendTxn(competition.createCompetition(
    1663884000,
    1664488800,
    5
  ), "competition.createCompetition(start, end, maxTeamSize)")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
