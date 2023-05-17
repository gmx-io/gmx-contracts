const { withdrawFeesArb, withdrawFeesAvax, withdrawFeesBsc } = require("./feeWithdrawal")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

// time check to avoid invalid fee withdrawals
const time = 1683679046

if (Date.now() / 1000 > time + 10 * 60) {
  throw new Error("invalid time")
}

async function main() {
  if (network === "bsc") {
    await withdrawFeesBsc()
    return
  }

  if (network === "avax") {
    await withdrawFeesAvax()
    return
  }

  await withdrawFeesArb()
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
