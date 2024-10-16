const { deployContract, contractAt, sendTxn } = require("../shared/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

const maxBoostBasisPoints = 0
const bnGmxToEsGmxConversionDivisor = 25

async function deployForAvax() {
  const gmxVester = { address: "0x472361d3cA5F49c8E633FB50385BfaD1e018b445" }
  const stakedGmxTracker = { address: "0x2bD10f8E93B3669b6d42E74eEedC65dd1B0a1342" }
  const bonusGmxTracker = { address: "0x908C4D94D34924765f1eDc22A1DD098397c59dD4" }
  const feeGmxTracker = { address: "0x4d268a7d4C16ceB5a606c173Bd974984343fea13" }
  const bnGmx = { address: "0x8087a341D32D445d9aC8aCc9c14F5781E04A26d2" }
  const esGmx = { address: "0xFf1489227BbAAC61a9209A08929E4c2a526DdD17" }

  await deployContract("VesterCap", [
    gmxVester.address,
    stakedGmxTracker.address,
    bonusGmxTracker.address,
    feeGmxTracker.address,
    bnGmx.address,
    esGmx.address,
    maxBoostBasisPoints,
    bnGmxToEsGmxConversionDivisor
  ])
}

async function deployForArb() {
  const gmxVester = { address: "0x199070DDfd1CFb69173aa2F7e20906F26B363004" }
  const stakedGmxTracker = { address: "0x908C4D94D34924765f1eDc22A1DD098397c59dD4" }
  const bonusGmxTracker = { address: "0x4d268a7d4C16ceB5a606c173Bd974984343fea13" }
  const feeGmxTracker = { address: "0xd2D1162512F927a7e282Ef43a362659E4F2a728F" }
  const bnGmx = { address: "0x35247165119B69A40edD5304969560D0ef486921" }
  const esGmx = { address: "0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA" }

  await deployContract("VesterCap", [
    gmxVester.address,
    stakedGmxTracker.address,
    bonusGmxTracker.address,
    feeGmxTracker.address,
    bnGmx.address,
    esGmx.address,
    maxBoostBasisPoints,
    bnGmxToEsGmxConversionDivisor
  ])
}

async function main() {
  if (network === "avax") {
    await deployForAvax()
  }

  if (network === "arbitrum") {
    await deployForArb()
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
