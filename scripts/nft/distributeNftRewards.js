const { contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

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

const printArchivedAmounts = async () => {
  const nftHolders = {}
  const nftTxns = await processFile(inputDir + "nft-transfers-archived.csv")

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

  const tokenHolders = await processFile(inputDir + "snapshot-archived.csv")
  const earliestTxn = 1639872000 // Sunday, 19 December 2021 00:00:00

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
  const totalEsGmx = 5000
  let totalEsGmxAmount = bigNumberify(0)

  const batchSender = await contractAt("BatchSender", "0x401Ab96410BcdCA81b79c68D0D664D478906C184")
  const esGmx = await contractAt("Token", "0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA")
  // await sendTxn(esGmx.approve(batchSender.address, expandDecimals(totalEsGmx, 18)), "esGmx.approve")

  const batchSize = 500

  for (let i = 0; i < balanceList.length; i++) {
    const { account, balance } = balanceList[i]
    const esGmxValue = totalEsGmx * balance / totalBalance
    const esGmxAmount = ethers.utils.parseUnits(esGmxValue.toFixed(4), 18)

    accounts.push(account)
    amounts.push(esGmxAmount)
    totalEsGmxAmount = totalEsGmxAmount.add(esGmxAmount)

    // console.log(`${i+1}:`, account, esGmxValue, esGmxAmount.toString())
    console.log(account, esGmxValue)

    if (accounts.length === batchSize) {
      // console.log("sending batch", i, accounts.length, amounts.length)
      // await sendTxn(batchSender.send(esGmx.address,  accounts, amounts), "batchSender.send")

      accounts = []
      amounts = []
    }
  }

  if (accounts.length > 0) {
    // console.log("sending final batch", balanceList.length, accounts.length, amounts.length)
    // await sendTxn(batchSender.send(esGmx.address,  accounts, amounts), "batchSender.send")
  }

  console.log("totalEsGmxAmount", totalEsGmxAmount.toString())
}

const printAmounts = async () => {
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

  const snapshot = await processFile(inputDir + "snapshot.csv")
  const vestedBalances = await processFile(inputDir + "vested-balances.csv")

  const holders = {}

  for (let i = 0; i < snapshot.length; i++) {
    const tokenHolder = snapshot[i]
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
    if (balance <= 10) {
      continue
    }

    holdersList.push({
      HolderAddress: account,
      Balance: balance
    })
  }

  console.log("holdersList", holdersList.length)

  // const tokenHolders = await processFile(inputDir + "snapshot.csv")
  const tokenHolders = holdersList
  const earliestTxn = 1639872000 // Sunday, 19 December 2021 00:00:00

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

    // console.log(account, balance)
  }

  console.log("balanceList", balanceList.length, totalBalance)

  totalBalance = 4140782.8785328493

  let accounts = []
  let amounts = []
  const totalEsGmx = 5000
  let totalEsGmxAmount = bigNumberify(0)

  const batchSender = await contractAt("BatchSender", "0x401Ab96410BcdCA81b79c68D0D664D478906C184")
  const esGmx = await contractAt("Token", "0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA")
  // await sendTxn(esGmx.approve(batchSender.address, expandDecimals(totalEsGmx, 18)), "esGmx.approve")

  const batchSize = 600

  for (let i = 0; i < balanceList.length; i++) {
    const { account, balance } = balanceList[i]
    const esGmxValue = totalEsGmx * balance / totalBalance
    const esGmxAmount = ethers.utils.parseUnits(esGmxValue.toFixed(4), 18)

    accounts.push(account)
    amounts.push(esGmxAmount)
    totalEsGmxAmount = totalEsGmxAmount.add(esGmxAmount)

    // console.log(`${i+1}:`, account, esGmxValue, esGmxAmount.toString())
    console.log(account, esGmxValue)

    if (accounts.length === batchSize) {
      // console.log("sending batch", i, accounts.length, amounts.length)

      // await sendTxn(batchSender.send(esGmx.address,  accounts, amounts), "batchSender.send")

      accounts = []
      amounts = []
    }
  }

  // if (accounts.length > 0) {
  //   console.log("sending final batch", balanceList.length, accounts.length, amounts.length)
  //   await sendTxn(batchSender.send(esGmx.address,  accounts, amounts), "batchSender.send")
  // }

  console.log("totalEsGmxAmount", totalEsGmxAmount.toString())
}

const distribute = async () => {
  const transfers1 = await processFile(inputDir + "es-gmx-transfers-1.csv")
  const transfers2 = await processFile(inputDir + "es-gmx-transfers-2.csv")

  const map1 = {}

  for (let i = 0; i < transfers1.length; i++) {
    const item = transfers1[i]
    map1[item.address] = parseFloat(item.balance)
  }

  let total = 0
  const distributionList = []
  for (let i = 0; i < transfers2.length; i++) {
    const item = transfers2[i]
    const address = item.address
    const balance = parseFloat(item.balance)

    if (map1[address] !== undefined && map1[address] > balance) {
      continue
    }

    let diff = balance
    if (map1[address] !== undefined) {
      diff = balance - map1[address]
    }

    if (diff < 0.03) {
      continue
    }

    // console.log(address, diff)
    distributionList.push({
      address,
      balance: diff
    })

    total += diff
  }

  console.log("total", total, distributionList.length)

  const batchSender = await contractAt("BatchSender", "0x401Ab96410BcdCA81b79c68D0D664D478906C184")
  const esGmx = await contractAt("Token", "0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA")
  await sendTxn(esGmx.approve(batchSender.address, expandDecimals(5000, 18)), "esGmx.approve")

  const batchSize = 600
  let accounts = []
  let amounts = []

  for (let i = 0; i < distributionList.length; i++) {
    const { address, balance } = distributionList[i]
    const amount = ethers.utils.parseUnits(balance.toFixed(4), 18)

    accounts.push(address)
    amounts.push(amount)

    console.log(`${i+1}:`, address, balance, amount.toString())

    if (accounts.length === batchSize) {
      console.log("sending batch", i, accounts.length, amounts.length)

      await sendTxn(batchSender.send(esGmx.address,  accounts, amounts), "batchSender.send")

      accounts = []
      amounts = []
    }
  }

  if (accounts.length > 0) {
    console.log("sending final batch", distributionList.length, accounts.length, amounts.length)
    await sendTxn(batchSender.send(esGmx.address,  accounts, amounts), "batchSender.send")
  }
}

const run = async () => {
  // printArchivedAmounts()
  // printAmounts()
  distribute()
}

run()
