const fs = require('fs')
const parse = require('csv-parse')
const { contractAt, sendTxn } = require("../shared/helpers")

const processFile = async (dir, file) => {
  records = []
  const parser = fs
  .createReadStream(dir + "/" + file)
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
  const token = await contractAt("SnapshotToken", "0xf3674f065301e0866715dd094bc7a51397e457f3")
  const snapshotFile = "snapshotBalance1.csv"
  const dir = "./data/snapshotBalance"

  const records = await processFile(dir, snapshotFile)
  console.log("records", records.length)

  const batchSize = 100
  let accounts = []
  let amounts = []

  for (let i = 0; i < records.length; i++) {
    const item = records[i]
    try {
      const amount = ethers.utils.parseEther(item.Balance)
      accounts.push(item.HolderAddress)
      amounts.push(amount.toString())
    } catch (e) {
      console.log(e)
      continue
    }

    if (accounts.length === batchSize) {
      console.log("accounts", accounts)
      console.log("amounts", amounts)
      console.log("sending batch", i, accounts.length, amounts.length)
      await sendTxn(token.batchMint(accounts, amounts), "token.batchMint")

      accounts = []
      amounts = []
    }
  }

  if (accounts.length > 0) {
    console.log("sending final batch", records.length, accounts.length, amounts.length)
    await sendTxn(token.batchMint(accounts, amounts), "token.batchMint")
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
