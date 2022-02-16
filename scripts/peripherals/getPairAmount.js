const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

const path = require('path')
const fs = require('fs')
const parse = require('csv-parse')

const inputFile = path.resolve(__dirname, "../..") + "/data/holders/vestedGmxHolders.csv"

const processFile = async (file) => {
  records = []
  const parser = fs
  .createReadStream(file)
  .pipe(parse({ columns: true, delimiter: ',' }))
  parser.on('error', function(err){
    console.error(err.message)
  })
  for await (const record of parser) {
    records.push(record)
  }
  return records
}

async function main() {
  const holderList = await processFile(inputFile)
  const gmxVester = await contractAt("Vester", "0x199070DDfd1CFb69173aa2F7e20906F26B363004")
  const data = []

  console.log("holderList", holderList.length)
  for (let i = 0; i < holderList.length; i++) {
    const account = holderList[i].HolderAddress
    const pairAmount = await gmxVester.pairAmounts(account)
    console.log(`${i+1},${account},${ethers.utils.formatUnits(pairAmount, 18)}`)
    data.push([account, ethers.utils.formatUnits(pairAmount, 18)])
  }

  console.log("final data:")
  console.log(data.map((i) => i.join(",")).join("\n"))
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
