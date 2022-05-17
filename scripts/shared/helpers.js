const fs = require('fs')
const path = require('path')
const parse = require('csv-parse')

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

const readCsv = async (file) => {
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

function getChainId(network) {
  if (network === "arbitrum") {
    return 42161
  }

  if (network === "avax") {
    return 43114
  }

  throw new Error("Unsupported network")
}

async function getFrameSigner() {
  try {
    const frame = new ethers.providers.JsonRpcProvider("http://127.0.0.1:1248")
    const signer = frame.getSigner()
    if (getChainId(network) !== await signer.getChainId()) {
      throw new Error("Incorrect frame network")
    }
    return signer
  } catch (e) {
    throw new Error(`getFrameSigner error: ${e.toString()}`)
  }
}

async function sendTxn(txnPromise, label) {
  const txn = await txnPromise
  console.info(`Sending ${label}...`)
  await txn.wait()
  console.info(`... Sent! ${txn.hash}`)
  return txn
}

async function callWithRetries(func, args, retriesCount = 3) {
  let i = 0
  while (true) {
    i++
    try {
      return await func(...args)
    } catch (ex) {
      if (i === retriesCount) {
        console.error("call failed %s times. throwing error", retriesCount)
        throw ex
      }
      console.error("call i=%s failed. retrying....", i)
      console.error(ex.message)
    }
  }
}

async function deployContract(name, args, label, options) {
  let info = name
  if (label) { info = name + ":" + label }
  const contractFactory = await ethers.getContractFactory(name)
  let contract
  if (options) {
    contract = await contractFactory.deploy(...args, options)
  } else {
    contract = await contractFactory.deploy(...args)
  }
  const argStr = args.map((i) => `"${i}"`).join(" ")
  console.info(`Deploying ${info} ${contract.address} ${argStr}`)
  await contract.deployTransaction.wait()
  console.info("... Completed!")
  return contract
}

async function contractAt(name, address, provider) {
  let contractFactory = await ethers.getContractFactory(name)
  if (provider) {
    contractFactory = contractFactory.connect(provider)
  }
  return await contractFactory.attach(address)
}

const tmpAddressesFilepath = path.join(__dirname, '..', '..', `.tmp-addresses-${process.env.HARDHAT_NETWORK}.json`)

function readTmpAddresses() {
  if (fs.existsSync(tmpAddressesFilepath)) {
    return JSON.parse(fs.readFileSync(tmpAddressesFilepath))
  }
  return {}
}

function writeTmpAddresses(json) {
  const tmpAddresses = Object.assign(readTmpAddresses(), json)
  fs.writeFileSync(tmpAddressesFilepath, JSON.stringify(tmpAddresses))
}

module.exports = {
  readCsv,
  getFrameSigner,
  sendTxn,
  deployContract,
  contractAt,
  writeTmpAddresses,
  readTmpAddresses,
  callWithRetries
}
