const { deployContract, contractAt, sendTxn } = require("../shared/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

async function main() {
  const vesterCap = await contractAt("VesterCap", "0x6C507B00Ef0266de345548974A3A05182Bf62696")

  const accounts = [
    "0x2d88636d67f23a7b6897ed120c4d0119875a5233",
    "0x0cb95613035913a4d957bd78328c71ce5e83f029"
  ]

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i]
    await sendTxn(vesterCap.unreservePairToken(account), `unreservePairToken for ${account}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
