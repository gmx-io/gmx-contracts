const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const { getFrameSigner, contractAt } = require("./shared/helpers")
const { bigNumberify, expandDecimals } = require("../test/shared/utilities")

const {
  ARBITRUM_SERVER_ADMIN_API_KEY,
  AVAX_SERVER_ADMIN_API_KEY,
} = require('../env.json')

if (!ARBITRUM_SERVER_ADMIN_API_KEY) {
  console.warn("WARN: ARBITRUM_SERVER_ADMIN_API_KEY is not set in env.json")
}
if (!AVAX_SERVER_ADMIN_API_KEY) {
  console.warn("WARN: AVAX_SERVER_ADMIN_API_KEY is not set in env.json")
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getArbValues() {
  return {
    serverHost: "https://gmx-server-mainnet.uw.r.appspot.com",
    serverAdminApiKey: ARBITRUM_SERVER_ADMIN_API_KEY,
    vaultAddress: "0x489ee077994b6658eafa855c308275ead8097c4a",
    shortsTrackerAddress: "0xf58eEc83Ba28ddd79390B9e90C4d3EbfF1d434da",
    indexTokens: {
      "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1": "WETH",
      "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f": "BTC",
      "0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0": "UNI",
      "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4": "LINK"
    },
    allowedSizeDifference: expandDecimals(200, 30)
  }
}

async function getAvaxValues() {
  return {
    serverHost: "https://gmx-avax-server.uc.r.appspot.com",
    // serverHost: "http://localhost:8080",
    serverAdminApiKey: AVAX_SERVER_ADMIN_API_KEY,
    vaultAddress: "0x9ab2de34a33fb459b538c43f251eb825645e8595",
    shortsTrackerAddress: "0x9234252975484D75Fd05f3e4f7BdbEc61956D73a",
    indexTokens: {
      "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7": "WAVAX",
      "0x50b7545627a5162F82A992c33b87aDc75187B218": "BTC",
      "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB": "WETH"
    },
  }
}

async function getValues() {
  if (process.env.HARDHAT_NETWORK === "arbitrum") {
    return await getArbValues()
  } else if (process.env.HARDHAT_NETWORK === "avax") {
    return await getAvaxValues()
  }
  throw new Error("Unsupported network")
}

async function getGlobalShortDataFromServer(serverHost, serverAdminApiKey) {
  const url = `${serverHost}/positions/global_shorts_data?key=${encodeURIComponent(serverAdminApiKey)}`
  const serverRes = await fetch(url)
  if (serverRes.status === 404) {
    throw new Error(`Server ${url} returned 404. key might be invalid`)
  }
  return await serverRes.json()
}

async function getVaultData(vault, indexTokens, blockNumber) {
  const indexTokenAddresses = Object.keys(indexTokens)
  const sizesPromise = Promise.all(indexTokenAddresses.map(token => {
    return vault.globalShortSizes(token, { blockTag: Number(blockNumber) })
  }))
  const averagePricesPromise = Promise.all(indexTokenAddresses.map(token => {
    return vault.globalShortAveragePrices(token, { blockTag: Number(blockNumber) })
  }))
  const deltasPromise = Promise.all(indexTokenAddresses.map(token => {
    return vault.getGlobalShortDelta(token, { blockTag: Number(blockNumber) })
  }))

  const [
    sizes,
    averagePrices,
    deltas
  ] = await Promise.all([sizesPromise, averagePricesPromise, deltasPromise])

  const data = {}
  indexTokenAddresses.forEach((token, i) => {
    let [hasProfit, delta] = deltas[i]
    if (!hasProfit) {
      delta = delta.mul(-1)
    }
    data[token] = {
      size: sizes[i],
      averagePrice: averagePrices[i],
      delta
    }
  })
  return data
}

async function postRequest(serverHost, pathname, data) {
  const url = serverHost + pathname
  const res = await fetch(url, {
    method: "POST",
    body: JSON.stringify(data),
    headers: {
      "Content-Type": "application/json"
    }
  })
  if (res.status !== 200) {
    throw new Error("Server returned " + res.status + ": " + text)
  }
  return await res.text()
}

async function getRequest(serverHost, pathname) {
  const url = `${serverHost}${pathname}`
  console.log("Request %s", url)
  const res = await fetch(url)
  return await res.json()
}

async function toggleLiquidations(serverHost, serverAdminApiKey, enabled) {
  console.log("Toggling liquidations to", enabled)
  return await postRequest(serverHost, "/positions/info", { key: serverAdminApiKey, liquidationsDisabled: !enabled })
}

async function toggleOrdersExecution(serverHost, serverAdminApiKey, enabled) {
  console.log("Toggling orders execution to", enabled)
  return await postRequest(serverHost, "/orders/info", { key: serverAdminApiKey, executionDisabled: !enabled })
}

async function rollback() {
  console.warn("Rolling back")
  const {
    serverHost,
    serverAdminApiKey,
    shortsTrackerAddress
  } = await getValues()

  await toggleOrdersExecution(serverHost, serverAdminApiKey, true)
  await toggleLiquidations(serverHost, serverAdminApiKey, true)

  const signer = await getFrameSigner()
  const shortsTracker = await contractAt("ShortsTracker", shortsTrackerAddress, signer)
  if (await shortsTracker.isGlobalShortDataReady()) {
    // no need to send transaction if `isGlobalShortDataReady` is false
    await shortsTracker.setIsGlobalShortDataReady(false)
  }
}

async function initShortsTrackerData(shortsTracker, serverData) {
  const tokens = Object.keys(serverData.globalShortData)
  const averagePrices = tokens.map(token => serverData.globalShortData[token].averagePrice)
  console.log("Setting global shorts data %j %j", tokens, averagePrices)
  const tx = await shortsTracker.setInitData(tokens, averagePrices)
  console.log("Tx was sent. Waiting for receipt...")
  await tx.wait()
}

async function waitJobsAreFinished(serverHost, serverAdminApiKey) {
  for (let i = 0; i < 10; i++) {
    await sleep(2000)
    const [ordersInfo, positionsInfo] = await Promise.all([
      getRequest(serverHost, `/orders/info?key=${encodeURIComponent(serverAdminApiKey)}`),
      getRequest(serverHost, `/positions/info?key=${encodeURIComponent(serverAdminApiKey)}`)
    ])
    if (ordersInfo.executionStatus_0 === "idle"
      && ordersInfo.executionStatus_1 === "idle"
      && positionsInfo.liquidationsStatus === "idle"
    ) {
      return
    }
  }
  throw new Error("Jobs are not finished for too long")
}

async function waitForUpToDateData(vaultAddress, serverHost, serverAdminApiKey, indexTokens, allowedSizeDifference) {
  let vaultData
  let upToDate
  const vault = await contractAt("Vault", vaultAddress)
  for (let i = 0; i < 5; i++) {
    serverData = await getGlobalShortDataFromServer(serverHost, serverAdminApiKey)
    const serverBlockNumber = serverData.info.lastBlockVault // positions are updated from Vault events
    console.log("checking if data is up-to-date by comparing server and Vault global short sizes. block number: %s attempt: %s", serverBlockNumber, i)
    vaultData = await getVaultData(vault, indexTokens, serverBlockNumber)
    upToDate = true
    for (const token of Object.keys(indexTokens)) {
      const difference = vaultData[token].size.sub(serverData.globalShortData[token].size).abs()
      if (difference.gt(allowedSizeDifference)) {
        console.log("Difference is too big for token %s. Difference: %s (%s)",
          token, difference.toString() / 1e30, difference.toString()
        )
        upToDate = false
        break
      }
    }

    if (upToDate) {
      return serverData
    }
    await sleep(3000)
  }

  throw new Error("Data is not up-to-date for too long. Vault data: " + JSON.stringify(vaultData) + " server data: " + JSON.stringify(serverData))
}

async function validateServerIsUpToDate(serverHost, serverAdminApiKey) {
  let serverData = await getGlobalShortDataFromServer(serverHost, serverAdminApiKey)
  const serverBlockNumber = serverData.info.lastBlockVault // positions are updated from Vault events
  const latestBlockNumber = await ethers.provider.getBlockNumber()

  if (latestBlockNumber - serverBlockNumber > 100) {
    throw new Error(`Server block ${serverBlockNumber} is too far behind ${latestBlockNumber}. Skip migration`)
  }
}

async function migrate() {
  const {
    serverAdminApiKey,
    serverHost,
    vaultAddress,
    shortsTrackerAddress,
    allowedSizeDifference = 0,
    indexTokens
  } = await getValues()

  console.log("Validate server block is up-to-date...")
  await validateServerIsUpToDate(serverHost, serverAdminApiKey)

  console.log("Disable execution...")
  await Promise.all([
    toggleOrdersExecution(serverHost, serverAdminApiKey, false),
    toggleLiquidations(serverHost, serverAdminApiKey, false),
  ])
  console.log("Orders execution and liquidations are disabled")

  console.log("Wait for jobs to be finished...")
  await waitJobsAreFinished(serverHost, serverAdminApiKey);
  console.log("Jobs are finished")

  console.log("Wait 10s so execution/liquidation transactions are mined...") // in theory some stucked transaction can be mined after 10s
  await sleep(10000)

  console.log("Wait for up-to-date data...")
  serverData = await waitForUpToDateData(vaultAddress, serverHost, serverAdminApiKey, indexTokens, allowedSizeDifference)
  console.log("Data is up-to-date")

  const signer = await getFrameSigner()
  const shortsTracker = await contractAt("ShortsTracker", shortsTrackerAddress, signer)
  await initShortsTrackerData(shortsTracker, serverData)
  console.log("ShortTracker data is inited")

  console.log("Enable all operations back...")
  await Promise.all([
    toggleOrdersExecution(serverHost, serverAdminApiKey, true),
    toggleLiquidations(serverHost, serverAdminApiKey, true),
  ])
  console.log("Done. Everything should operate as usual")
}

async function runMigration() {
  try {
    await migrate()
  } catch (ex) {
    console.error("Migration failed")
    console.error(ex)
    try {
      await rollback()
    } catch (ex) {
      console.error("Rollback failed")
      console.error(ex)
    }
  }
}

async function main() {
  const action = process.env.ACTION
  const validActions = new Set(["info", "migrate", "rollback", "disable", "enable"])

  if (!validActions.has(action)) {
    throw new Error(
      `use env var ACTION to specify action: ${Array.from(validActions).join(", ")}. Provided: ${action}`
    )
  }

  let {
    serverAdminApiKey,
    serverHost,
    vaultAddress,
    indexTokens,
    serverData
  } = await getValues()

  console.log("Running with action: %s", action)
  if (action === "migrate") {
    await runMigration()
    return
  } else if (action === "rollback") {
    await rollback()
    return
  } else if (action === "disable") {
    await Promise.all([
      toggleOrdersExecution(serverHost, serverAdminApiKey, false),
      toggleLiquidations(serverHost, serverAdminApiKey, false),
    ])
    return
  } else if (action === "enable") {
    await Promise.all([
      toggleOrdersExecution(serverHost, serverAdminApiKey, true),
      toggleLiquidations(serverHost, serverAdminApiKey, true),
    ])
    return
  }

  console.log("retrieving global shorts data from server...")

  if (!serverData) {
    serverData = await getGlobalShortDataFromServer(serverHost, serverAdminApiKey)
  }

  console.log("serverData", serverData)

  const vault = await contractAt("Vault", vaultAddress)

  const blockNumber = serverData.info.lastBlockVault // positions are updated from Vault events
  console.log("Retrieving data from Vault at block %s", blockNumber)
  const vaultData = await getVaultData(vault, indexTokens, blockNumber)

  console.log("vaultData", vaultData)

  console.log("vault sizes vs server sizes")
  let totalServerDelta = bigNumberify(0)
  let totalVaultDelta = bigNumberify(0)

  console.log("Network: %s blockNumber: %s", process.env.HARDHAT_NETWORK, blockNumber)

  Object.entries(indexTokens).forEach(([token, symbol]) => {
    console.log("\ntoken %s %s", symbol, token)
    console.log("\tmarkPrice:    %s", (serverData.globalShortData[token].markPrice / 1e30).toFixed(2))
    console.log("\tsizes:        vault %s server %s (diff %s)",
      (vaultData[token].size.toString() / 1e30).toFixed(2),
      (serverData.globalShortData[token].size.toString() / 1e30).toFixed(2),
      vaultData[token].size.sub(serverData.globalShortData[token].size).toString() / 1e30
    )

    totalServerDelta = totalServerDelta.add(serverData.globalShortData[token].delta)
    totalVaultDelta = totalVaultDelta.add(vaultData[token].delta)
    const deltaDiff = vaultData[token].delta.sub(serverData.globalShortData[token].delta)

    console.log("\tdelta:        vault %s server %s (diff %s%s)",
      (vaultData[token].delta.toString() / 1e30).toFixed(2),
      (serverData.globalShortData[token].delta / 1e30).toFixed(2),
      deltaDiff.gt(0) ? "+" : "",
      (deltaDiff.toString() / 1e30).toFixed(2)
    )

    console.log("\taveragePrice: vault %s server %s",
      (vaultData[token].averagePrice.toString() / 1e30).toFixed(2),
      (serverData.globalShortData[token].averagePrice.toString() / 1e30).toFixed(2),
    )
  })

  const totalDiff = totalVaultDelta.sub(totalServerDelta)
  console.log(
    "\nTotal delta\n\tvault: %s\n\tserver: %s\n\tdelta diff (vault - server): %s%s",
    (totalVaultDelta.toString() / 1e30).toString(),
    (totalServerDelta.toString() / 1e30).toString(),
    totalDiff.gt(0) ? "+" : "",
    (totalDiff.toString() / 1e30).toString()
  )
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
