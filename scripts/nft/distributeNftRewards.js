const { contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

const path = require('path')
const fs = require('fs')
const parse = require('csv-parse')

const inputDir = path.resolve(__dirname, "../..") + "/data/nft/input/"

const earliestTxn = 1669852800 // Tuesday, 1 November 2022 00:00:00
const shouldSendTokens = false

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

const distribute = async () => {
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
    nftHolders[from].count--
  }

  const stakedGmxBalances = await processFile(inputDir + "staked-gmx-balances.csv")
  const vestedBalances = await processFile(inputDir + "vested-balances.csv")

  const holders = {}

  for (let i = 0; i < stakedGmxBalances.length; i++) {
    const tokenHolder = stakedGmxBalances[i]
    const account = tokenHolder.HolderAddress.toLowerCase()

    if (holders[account] === undefined) { holders[account] = 0 }

    holders[account] = parseFloat(tokenHolder.Balance)
  }

  for (let i = 0; i < vestedBalances.length; i++) {
    const tokenHolder = vestedBalances[i]
    const account = tokenHolder.HolderAddress.toLowerCase()

    if (holders[account] === undefined) { holders[account] = 0 }

    holders[account] += parseFloat(tokenHolder.Balance)
  }

  const holdersList = []
  for (const [account, balance] of Object.entries(holders)) {
    if (balance <= 1) {
      continue
    }

    holdersList.push({
      HolderAddress: account,
      Balance: balance
    })
  }

  console.log("holdersList", holdersList.length)

  const tokenHolders = holdersList

  const balanceList = []
  let totalBalance = 0
  for (let i = 0; i < tokenHolders.length; i++) {
    const tokenHolder = tokenHolders[i]
    const account = tokenHolder.HolderAddress.toLowerCase()
    if (!nftHolders[account] || nftHolders[account].count <= 0 || nftHolders[account].earliestTxn > earliestTxn) {
      continue;
    }

    const balance =  parseFloat(tokenHolder.Balance)
    balanceList.push({ account, balance })
    totalBalance += balance
  }

  console.log("balanceList", balanceList.length, totalBalance)

  let accounts = []
  let amounts = []
  const totalEsGmx = 4000
  let totalEsGmxAmount = bigNumberify(0)

  const batchSender = await contractAt("BatchSender", "0x401Ab96410BcdCA81b79c68D0D664D478906C184")
  const esGmx = await contractAt("Token", "0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA")
  if (shouldSendTokens) {
    await sendTxn(esGmx.approve(batchSender.address, expandDecimals(totalEsGmx, 18)), "esGmx.approve")
  }

  const batchSize = 500

  for (let i = 0; i < balanceList.length; i++) {
    const { account, balance } = balanceList[i]
    const esGmxValue = (totalEsGmx - 1) * balance / totalBalance
    const esGmxAmount = ethers.utils.parseUnits(esGmxValue.toFixed(4), 18)

    accounts.push(account)
    amounts.push(esGmxAmount)
    totalEsGmxAmount = totalEsGmxAmount.add(esGmxAmount)

    console.log(`${i+1},${account},${esGmxValue},${esGmxAmount.toString()}`)

    if (accounts.length === batchSize && shouldSendTokens) {
      console.log("sending batch", i, accounts.length, amounts.length)
      await sendTxn(batchSender.send(esGmx.address,  accounts, amounts), "batchSender.send")

      accounts = []
      amounts = []
    }
  }

  if (accounts.length > 0 && shouldSendTokens) {
    console.log("sending final batch", balanceList.length, accounts.length, amounts.length)
    await sendTxn(batchSender.send(esGmx.address,  accounts, amounts), "batchSender.send")
  }

  console.log("totalEsGmxAmount", totalEsGmxAmount.toString())
}

const run = async () => {
  distribute()
}

run()
