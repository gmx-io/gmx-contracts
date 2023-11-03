const { contractAt, sendTxn, getFrameSigner, sleep } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function approveTokens({ network }) {
  const signer = await getFrameSigner({ network })
  const timelock = await contractAt("Timelock", "0xfA7046e0a049ed8528f1c40d3bD66c1555f7Ec9C", signer)

  const method = process.env.METHOD
  if (!["signalApprove", "approve"].includes(method)) {
    throw new Error(`Invalid method ${method}`)
  }

  const token = "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E"
  const spender = "0xf66c5E4a91FF10466E78BD50F87449a802053112"
  const amount = expandDecimals(155_000, 6)

  await sendTxn(timelock[method](token, spender, amount), `timelock.${method}`)
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
