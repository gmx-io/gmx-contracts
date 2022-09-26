const { deployContract, contractAt, sendTxn, readCsv } = require("../shared/helpers")
const { expandDecimals, bigNumberify } = require("../../test/shared/utilities")

const path = require('path')
const fs = require('fs')
const parse = require('csv-parse')

const inputDir = path.resolve(__dirname, "../..") + "/data/bonds/"

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

const inputFile = inputDir + "2022-09-14_transfers.csv"
const shouldSendTxns = true

async function getArbValues() {
  const esGmx = await contractAt("EsGMX", "0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA")
  const esGmxBatchSender = await contractAt("EsGmxBatchSender", "0xc3828fa579996090Dc7767E051341338e60207eF")

  const vestWithGmxOption = "0x544a6ec142Aa9A7F75235fE111F61eF2EbdC250a"
  const vestWithGlpOption = "0x9d8f6f6eE45275A5Ca3C6f6269c5622b1F9ED515"

  const gmxVester = await contractAt("Vester", "0x199070DDfd1CFb69173aa2F7e20906F26B363004")
  const glpVester = await contractAt("Vester", "0xA75287d2f8b217273E7FCD7E86eF07D33972042E")

  return { esGmx, esGmxBatchSender, vestWithGmxOption, vestWithGlpOption, gmxVester, glpVester }
}

async function getAvaxValues() {
  const esGmx = await contractAt("EsGMX", "0xFf1489227BbAAC61a9209A08929E4c2a526DdD17")
  const esGmxBatchSender = await contractAt("EsGmxBatchSender", "0xc9baFef924159138697e72899a2753a3Dc8D1F4d")
  const vestWithGmxOption = "0x171a321A78dAE0CDC0Ba3409194df955DEEcA746"
  const vestWithGlpOption = "0x28863Dd19fb52DF38A9f2C6dfed40eeB996e3818"

  const gmxVester = await contractAt("Vester", "0x472361d3cA5F49c8E633FB50385BfaD1e018b445")
  const glpVester = await contractAt("Vester", "0x62331A7Bd1dfB3A7642B7db50B5509E57CA3154A")

  return { esGmx, esGmxBatchSender, vestWithGmxOption, vestWithGlpOption, gmxVester, glpVester }
}

async function main() {
  const wallet = { address: "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8" }

  const values = network === "arbitrum" ? await getArbValues() : await getAvaxValues()
  const { esGmx, esGmxBatchSender, vestWithGmxOption, vestWithGlpOption, gmxVester, glpVester } = values

  const txns = await readCsv(inputFile)
  console.log("processing list", txns.length)

  const vestWithGmxAccounts = []
  const vestWithGmxAmounts = []

  const vestWithGlpAccounts = []
  const vestWithGlpAmounts = []

  let totalEsGmx = bigNumberify(0)

  for (let i = 0; i < txns.length; i++) {
    const txn = txns[i]
    if (txn.Method !== "Transfer") {
      continue
    }

    const amount = ethers.utils.parseUnits(txn.Quantity, 18)

    if (txn.To.toLowerCase() === vestWithGmxOption.toLowerCase()) {
      vestWithGmxAccounts.push(txn.From)
      vestWithGmxAmounts.push(amount)
      totalEsGmx = totalEsGmx.add(amount)
    }

    if (txn.To.toLowerCase() === vestWithGlpOption.toLowerCase()) {
      vestWithGlpAccounts.push(txn.From)
      vestWithGlpAmounts.push(amount)
      totalEsGmx = totalEsGmx.add(amount)
    }
  }

  console.log("vestWithGmxAccounts", vestWithGmxAccounts.length)
  console.log("vestWithGlpAccounts", vestWithGlpAccounts.length)
  console.log("totalEsGmx", totalEsGmx.toString(), ethers.utils.formatUnits(totalEsGmx, 18))

  if (shouldSendTxns) {
    if (vestWithGmxAccounts.length > 0) {
      await sendTxn(esGmxBatchSender.send(gmxVester.address, 4, vestWithGmxAccounts, vestWithGmxAmounts), "esGmxBatchSender.send(gmxVester)")
    }
    if (vestWithGlpAccounts.length > 0) {
      await sendTxn(esGmxBatchSender.send(glpVester.address, 320, vestWithGlpAccounts, vestWithGlpAmounts), "esGmxBatchSender.send(glpVester)")
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
