const path = require('path')
const { contractAt, sendTxn, readCsv } = require("../shared/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

const inputDir = path.resolve(__dirname, "../..") + "/data/staking/"

async function getArbValues() {
  return {
    vesterCap: await contractAt("VesterCap", "0x57866d65ACbb7Ba3269807Bf7af4019366789b60"),
    accountListFile: inputDir + "arbitrum-sbfgmx-holders.csv"
  }

}

async function getAvaxValues() {
  return {
    vesterCap: await contractAt("VesterCap", "0xdEdbE191b001c96BE6B9C2B3c22910331C869901"),
    accountListFile: inputDir + "avalanche-sbfgmx-holders.csv"
  }
}

async function getValues() {
  if (network === "arbitrum") {
    return await getArbValues()
  }

  if (network === "avax") {
    return await getAvaxValues()
  }
}

async function main() {
  const { accountListFile, vesterCap } = await getValues()
  const accountList = await readCsv(accountListFile)

  const batchSize = 50

  let startIndex = process.env.START_INDEX
  if (startIndex === undefined) {
    throw new Error("START_INDEX not specified")
  }

  startIndex = parseInt(startIndex)

  for (let i = startIndex; i < accountList.length; i += batchSize) {
    const from = i
    const to = i + batchSize
    const accounts = accountList.slice(from, to).map(i => i.HolderAddress)
    console.log(`processing accounts ${from} to ${to}`)
    await sendTxn(vesterCap.updateBnGmxForAccounts(accounts), `updateBnGmxForAccounts ${from} to ${to}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
