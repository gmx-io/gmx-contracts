const { contractAt, sendTxn, getFrameSigner, sleep } = require("../shared/helpers")
const { tokenArrRef } = require("../peripherals/feeCalculations")

async function approveTokens({ network }) {
  const tokenArr = tokenArrRef[network]

  const spender = "0xA70C24C3a6Ac500D7e6B1280c6549F2428367d0B"

  for (let i = 0; i < tokenArr.length; i++) {
    const signer = await getFrameSigner({ network })
    const token = await contractAt("Token", tokenArr[i].address, signer)
    await sendTxn(token.approve(spender, ethers.constants.MaxUint256), `approve: ${tokenArr[i].name}, ${ethers.constants.MaxUint256.toString()}`)
  }
}

async function main() {
  await approveTokens({ network: process.env.HARDHAT_NETWORK })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
