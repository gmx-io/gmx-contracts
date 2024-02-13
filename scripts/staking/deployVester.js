const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { signExternally } = require("../shared/signer")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

async function getArbValues() {
  const esGmx = { address: "0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA" }
  const gmx = { address: "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a" }
  const timelock = await contractAt("Timelock", "0x9Fd825166311545EaB45690Ab5dEF0D992Fdaa44")

  return { esGmx, gmx, timelock }
}

async function getAvaxValues() {
  const esGmx = { address: "0xFf1489227BbAAC61a9209A08929E4c2a526DdD17" }
  const gmx = { address: "0x62edc0692BD897D2295872a9FFCac5425011c661" }
  const timelock = await contractAt("Timelock", "0x6D03Fae9cC09EEe5C25Bff686f8878805ff29444")

  return { esGmx, gmx, timelock }
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
  const { esGmx, gmx, timelock } = await getValues()

  const vestingDuration = 365 * 24 * 60 * 60

  const vester = await deployContract("Vester", [
    "GMX Vester", // _name
    "vGMX", // _symbol
    vestingDuration, // _vestingDuration
    esGmx.address, // _esToken
    ethers.constants.AddressZero, // _pairToken
    gmx.address, // _claimableToken
    ethers.constants.AddressZero // _rewardTracker
  ])

  await sendTxn(vester.setGov(timelock.address), "vester.setGov")

  await signExternally(await timelock.populateTransaction.signalSetMinter(esGmx.address, vester.address, true));
  await signExternally(await timelock.populateTransaction.signalSetHandler(esGmx.address, vester.address, true));
}

main().catch((ex) => {
  console.error(ex);
  process.exit(1);
});
