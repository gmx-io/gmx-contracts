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

// async function getArbitrumTestnetValues() {
//   const positionRouter = await contractAt("PositionRouter", "0x195256074192170d1530527abC9943759c7167d8")

//   return { positionRouter }
// }

async function getValues() {
  if (network === "arbitrum") {
    return getArbValues()
  }

  if (network === "avax") {
    return getAvaxValues()
  }
}

async function main() {
  // const { positionRouter } = await getValues()
  const referralStorage = await contractAt("ReferralStorage", "0x902B74dAe2fff3BA564BDa930A7D687b84e0E9cC")

  await deployContract("Competition", [ referralStorage.address ]);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
