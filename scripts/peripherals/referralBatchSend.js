const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

async function getArbValues() {
  const batchSender = await contractAt("BatchSender", "0x1070f775e8eb466154BBa8FA0076C4Adc7FE17e8")
  const token = await contractAt("Token", "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1")
  const tokenDecimals = 18

  return { batchSender, token, tokenDecimals }
}

async function getAvaxValues() {
  const batchSender = await contractAt("BatchSender", "0xF0f929162751DD723fBa5b86A9B3C88Dc1D4957b")
  const token = await contractAt("Token", "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7")
  const tokenDecimals = 18

  return { batchSender, token, tokenDecimals }
}

async function getValues() {
  if (network === "arbitrum") {
    return getArbValues()
  }

  if (network === "avax") {
    return getAvaxValues()
  }
}

async function main() {
  const wallet = { address: "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8" }
  const { batchSender, token, tokenDecimals } = await getValues()

  const totalAmount = "10000000000000000"
  const typeId = 1

  await sendTxn(token.approve(batchSender.address, totalAmount), "token.approve")
  await sendTxn(batchSender.sendAndEmit(token.address, [wallet.address], [totalAmount], typeId), "batchSender.sendAndEmit")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
