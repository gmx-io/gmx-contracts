const { deployContract, contractAt } = require("../shared/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

async function getArbValues() {
  const positionRouter = await contractAt("PositionRouter", "0x3D6bA331e3D9702C5e8A8d254e5d8a285F223aba")

  return { positionRouter }
}

async function getAvaxValues() {
  const positionRouter = await contractAt("PositionRouter", "0x195256074192170d1530527abC9943759c7167d8")

  return { positionRouter }
}

async function getValues() {
  if (network === "arbitrum") {
    return getArbValues()
  }

  if (network === "avax") {
    return getAvaxValues()
  }

  if (network === "testnet") {
    return getTestnetValues()
  }
}

async function main() {
  const { positionRouter } = await getValues()
  const referralStorage = await contractAt("ReferralStorage", await positionRouter.referralStorage())

  const startTime = Math.round(Date.now() / 1000)
  const endTime = startTime + 100000000000

  await deployContract("Competition", [
    startTime,
    endTime,
    startTime,
    endTime,
    referralStorage.address,
  ]);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
