const { deployContract, contractAt, writeTmpAddresses, sendTxn } = require("../shared/helpers")

async function main() {
  const tokenManager = await deployContract("TokenManager", [3], "TokenManager")

  const signers = [
    "0x3D850Acfaa18c58b383fCA69d4d867Dc5Bb697c5", // Ben Simon
    "0x881690382102106b00a99E3dB86056D0fC71eee6", // Han Wen
    "0x2e5d207a4c0f7e7c52f6622dcc6eb44bc0fe1a13", // Krunal Amin
    "0x45e48668F090a3eD1C7961421c60Df4E66f693BD", // Dovey
    "0xD7941C4Ca57a511F21853Bbc7FBF8149d5eCb398" // G
  ]

  await sendTxn(tokenManager.initialize(signers), "tokenManager.initialize")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
