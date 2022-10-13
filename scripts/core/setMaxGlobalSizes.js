const { getFrameSigner, deployContract, contractAt, sendTxn, readTmpAddresses, callWithRetries } = require("../shared/helpers")
const { bigNumberify, expandDecimals } = require("../../test/shared/utilities")
const { toChainlinkPrice } = require("../../test/shared/chainlink")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function getArbValues() {
  const positionContracts = [
    "0x3D6bA331e3D9702C5e8A8d254e5d8a285F223aba", // PositionRouter 1
    "0xb87a436B93fFE9D75c5cFA7bAcFff96430b09868", // PositionRouter 2
    "0x87a4088Bd721F83b6c2E5102e2FA47022Cb1c831", // PositionManager 1
    "0x956618e5B6996919eB6B943aBf36910DdabC9a0f", // PositionManager 2
    "0x75E42e6f01baf1D6022bEa862A28774a9f8a4A0C" // PositionManager 3
  ]

  const { btc, eth, link, uni } = tokens
  const tokenArr = [btc, eth, link, uni]

  return { positionContracts, tokenArr }
}

async function getAvaxValues() {
  const positionContracts = [
    "0x195256074192170d1530527abC9943759c7167d8", // PositionRouter 1
    "0xffF6D276Bc37c61A23f06410Dce4A400f66420f8", // PositionRouter 2
    "0xF2ec2e52c3b5F8b8bd5A3f93945d05628A233216", // PositionManager 1
    "0xAaf69ca8d44d74EAD76a86f25001cfC44515e94E", // PositionManager 2
    "0xA21B83E579f4315951bA658654c371520BDcB866" // PositionManager 3
  ]

  const { avax, eth, btc, btcb } = tokens
  const tokenArr = [avax, eth, btc, btcb]

  return { positionContracts, tokenArr }
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
  const { positionContracts, tokenArr } = await getValues()

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

  for (let i = 0; i < positionContracts.length; i++) {
    const positionContract = await contractAt("PositionManager", positionContracts[i])
    await sendTxn(positionContract.setMaxGlobalSizes(tokenAddresses, longSizes, shortSizes), "positionContract.setMaxGlobalSizes")
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
