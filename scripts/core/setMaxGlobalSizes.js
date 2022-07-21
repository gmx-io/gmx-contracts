const { getFrameSigner, deployContract, contractAt, sendTxn, readTmpAddresses, callWithRetries } = require("../shared/helpers")
const { bigNumberify, expandDecimals } = require("../../test/shared/utilities")
const { toChainlinkPrice } = require("../../test/shared/chainlink")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function getArbValues() {
  const positionRouter = await contractAt("PositionRouter", "0x3D6bA331e3D9702C5e8A8d254e5d8a285F223aba")
  const positionManager = await contractAt("PositionManager", "0x87a4088Bd721F83b6c2E5102e2FA47022Cb1c831")

  const { btc, eth, link, uni } = tokens
  const tokenArr = [btc, eth]

  return { positionRouter, positionManager, tokenArr }
}

async function getAvaxValues() {
  const positionRouter = await contractAt("PositionRouter", "0x195256074192170d1530527abC9943759c7167d8")
  const positionManager = await contractAt("PositionManager", "0xF2ec2e52c3b5F8b8bd5A3f93945d05628A233216")

  const { avax, eth, btc } = tokens
  const tokenArr = [avax, eth, btc]

  return { positionRouter, positionManager, tokenArr }
}

async function getValues() {
  if (network === "arbitrum") {
    return getArbValues()
  }

  if (network === "avax") {
    return getAvaxValues()
  }
}


async function main() {
  const { positionRouter, positionManager, tokenArr } = await getValues()

  const tokenAddresses = tokenArr.map(t => t.address)
  const longSizes = tokenArr.map((token) => {
    if (!token.maxGlobalLongSize) {
      return bigNumberify(0)
    }

    return expandDecimals(token.maxGlobalLongSize, 30)
  })

  const shortSizes = tokenArr.map((token) => {
    if (!token.maxGlobalShortSize) {
      return bigNumberify(0)
    }

    return expandDecimals(token.maxGlobalShortSize, 30)
  })

  await sendTxn(positionRouter.setMaxGlobalSizes(tokenAddresses, longSizes, shortSizes), "positionRouter.setMaxGlobalSizes")
  await sendTxn(positionManager.setMaxGlobalSizes(tokenAddresses, longSizes, shortSizes), "positionManager.setMaxGlobalSizes")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
