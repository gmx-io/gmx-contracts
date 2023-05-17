const { getFrameSigner, contractAt, sendTxn, updateTokensPerInterval } = require("../shared/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

const { getArbValues, getAvaxValues, updateRewards }

function getValues(signer) {
  if (network === "arbitrum") {
    return getArbValues(signer)
  }

  if (network === "avax") {
    return getAvaxValues(signer)
  }
}

async function main() {
  const signer = await getFrameSigner()
  const values = await getValues(signer)
  await updateRewards({ signer, values })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
