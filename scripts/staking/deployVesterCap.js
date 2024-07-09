const { deployContract, contractAt, sendTxn } = require("../shared/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

async function main() {
  const gmxVester = { address: "0x199070DDfd1CFb69173aa2F7e20906F26B363004" }
  const stakedGmxTracker = { address: "0x908C4D94D34924765f1eDc22A1DD098397c59dD4" }
  const feeGmxTracker = { address: "0xd2D1162512F927a7e282Ef43a362659E4F2a728F" }
  const bnGmx = { address: "0x35247165119B69A40edD5304969560D0ef486921" }
  const maxBoostBasisPoints = 20_000

  await deployContract("VesterCap", [
    gmxVester.address,
    stakedGmxTracker.address,
    feeGmxTracker.address,
    bnGmx.address,
    maxBoostBasisPoints
  ])
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
