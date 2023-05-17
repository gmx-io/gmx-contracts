const { getArbValues, getAvaxValues, postFees } = require("./updateFees")

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function getNetworkValues() {
  return [
    await getArbValues(),
    await getAvaxValues()
  ]
}

async function main() {
  const networkValues = await getNetworkValues()
  for (let i = 0; i < networkValues.length; i++) {
    const { apiKey, feeUrl, feeUsd } = networkValues[i]
    await postFees({
      apiKey,
      feeUrl,
      feeUsd,
      timestamp: Date.now() / 1000
    })
  }
}

main()

module.exports = {
  postFees
}
