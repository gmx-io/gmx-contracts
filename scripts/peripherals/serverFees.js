const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const {
  ARBITRUM_SERVER_ADMIN_API_KEY,
  ARBITRUM_FEE_URL,
  AVAX_SERVER_ADMIN_API_KEY,
  AVAX_FEE_URL,
} = require("../../env.json")

const SECONDS_PER_DAY = 24 * 60 * 60

async function getArbValues() {
  const apiKey = ARBITRUM_SERVER_ADMIN_API_KEY
  const feeUrl = ARBITRUM_FEE_URL
  const feeUsd = "2,048,125.75"

  return { apiKey, feeUrl, feeUsd }
}

async function getAvaxValues() {
  const apiKey = AVAX_SERVER_ADMIN_API_KEY
  const feeUrl = AVAX_FEE_URL
  const feeUsd = "243,246.15"

  return { apiKey, feeUrl, feeUsd }
}

async function postFees({ apiKey, feeUrl, feeUsd, timestamp }) {
  timestamp = parseInt(timestamp)

  if (isNaN(timestamp)) {
    throw new Error("Invalid timestamp")
  }

  const id = (parseInt(timestamp / SECONDS_PER_DAY) * SECONDS_PER_DAY).toString()
  feeUsd = parseInt(feeUsd.replaceAll(",", ""))

  if (isNaN(feeUsd)) {
    throw new Error("Invalid feeUsd")
  }

  const body = JSON.stringify({
    key: apiKey,
    id,
    timestamp,
    feeUsd
  })

  console.log("sending update", { id, timestamp, feeUsd })
  const result = await fetch(feeUrl, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body
  })

  const resultContent = await result.text()
  console.log("result", result.status, resultContent)
}

module.exports = {
  getArbValues,
  getAvaxValues,
  postFees
}
