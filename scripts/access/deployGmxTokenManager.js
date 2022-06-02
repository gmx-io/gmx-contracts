const { deployContract, contractAt, writeTmpAddresses, sendTxn } = require("../shared/helpers")

async function main() {
  const tokenManager = await deployContract("TokenManager", [3], "TokenManager")

  const signers = [
    "0x3D850Acfaa18c58b383fCA69d4d867Dc5Bb697c5", // Ben Simon
    "0x45e48668F090a3eD1C7961421c60Df4E66f693BD", // Dovey
    "0x881690382102106b00a99E3dB86056D0fC71eee6", // Han Wen
    "0xd6D5a4070C7CFE0b42bE83934Cc21104AbeF1AD5" // Bybit Security Team
  ]

  await sendTxn(tokenManager.initialize(signers), "tokenManager.initialize")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
