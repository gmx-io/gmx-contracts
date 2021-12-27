const path = require('path')
const fs = require('fs')
const parse = require('csv-parse')

const util = require('util')
const readdir = util.promisify(fs.readdir)

const inputDir = path.resolve(__dirname, "../..") + "/data/nft/input/"
const outputFile = path.resolve(__dirname, "../..") + "/data/nft/output/2021-12-27.json"

function bigNumberify(n) {
  return ethers.BigNumber.from(n)
}

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

const run = async () => {
  const nftHolders = {}
  const nftTxns = await processFile(inputDir + "nft-transfers.csv")

  for (let i = 0; i < nftTxns.length; i++) {
    const txn = nftTxns[i]
    const to = txn.To.toLowerCase()
    const from = txn.From.toLowerCase()
    const time = parseInt(txn.UnixTimestamp)
    if (nftHolders[to] === undefined) {
      nftHolders[to] = {
        earliestTxn: time,
        count: 0
      }
    }
    if (nftHolders[from] === undefined) {
      nftHolders[from] = {
        earliestTxn: time,
        count: 0
      }
    }
    nftHolders[to].count++
    nftHolders[from].count++
  }

  const tokenHolders = await processFile(inputDir + "snapshot.csv")
  const earliestTxn = 1639872000 // Sunday, 19 December 2021 00:00:00

  const balanceList = []
  let total = 0
  for (let i = 0; i < tokenHolders.length; i++) {
    const tokenHolder = tokenHolders[i]
    const account = tokenHolder.HolderAddress.toLowerCase()
    if (!nftHolders[account] || nftHolders[account].count <= 0 || nftHolders[account].earliestTxn > earliestTxn) {
      continue;
    }

    const balance =  parseFloat(tokenHolder.Balance)
    balanceList.push({ account, balance })
    console.log("list", account, balance)
    total += balance
  }

  console.log("balanceList", balanceList.length, total)

  // const distributionList = {}
  // const totalEsGmx = 5000
  //
  // for (let i = 0; i < balanceList; i++) {
  //
  // }
}

run()
