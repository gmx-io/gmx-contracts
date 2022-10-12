const { deployContract, contractAt, sendTxn, getFrameSigner } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

async function getArbValues(signer) {
  const target = await contractAt("Vault", "0x489ee077994B6658eAfA855C308275EAd8097C4A")
  const nextTimelock = await contractAt("Timelock", "0x6A9215C9c148ca68E11aA8534A413B099fd6798f", signer)
  return { target, nextTimelock }
}

async function getAvaxValues(signer) {
  const target = await contractAt("Vault", "0x9ab2De34A33fB459b538c43f251eB825645e8595")
  const nextTimelock = await contractAt("Timelock", "0x5aeCDD22cDA7D2010631D71b268D5479e1d2B8f4", signer)
  return { target, nextTimelock }
}

async function getValues(signer) {
  if (network === "arbitrum") {
    return getArbValues(signer)
  }

  if (network === "avax") {
    return getAvaxValues(signer)
  }
}

async function main() {
  const signer = await getFrameSigner()

  const { target, nextTimelock } = await getValues(signer)
  const prevTimelock = await contractAt("Timelock", await target.gov(), signer)

  await sendTxn(prevTimelock.signalSetGov(target.address, nextTimelock.address), "prevTimelock.signalSetGov(nextTimelock)")
  await sendTxn(nextTimelock.signalSetGov(target.address, prevTimelock.address), "nextTimelock.signalSetGov(prevTimelock)")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
