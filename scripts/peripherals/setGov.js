const { deployContract, contractAt, sendTxn, getFrameSigner } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

async function getArbValues(signer) {
  const target = await contractAt("Vault", "0x489ee077994B6658eAfA855C308275EAd8097C4A")
  const nextTimelock = await contractAt("Timelock", "0x718507c37AA801A4b37aAE70dF8B2cB0bd4674b5")
  return { target, nextTimelock }
}

async function getAvaxValues(signer) {
  const target = await contractAt("Vault", "0x9ab2De34A33fB459b538c43f251eB825645e8595")
  const nextTimelock = await contractAt("Timelock", "0xe089F0eDc8efB1172Dae20CEa041eB4B9dc7d468", signer)
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
  const { target, nextTimelock } = await getValues(null)
  const prevTimelock = await contractAt("Timelock", await target.gov())

  // await sendTxn(prevTimelock.signalSetGov(target.address, nextTimelock.address), "prevTimelock.signalSetGov(nextTimelock)")
  // await sendTxn(nextTimelock.signalSetGov(target.address, prevTimelock.address), "nextTimelock.signalSetGov(prevTimelock)")
  const action = process.env.ACTION || "signal";
  let rawTx;
  if (action === 'signal') {
    rawTx = await prevTimelock.populateTransaction.signalSetGov(target.address, nextTimelock.address)
  } else if (action === 'finalize') {
    rawTx = await nextTimelock.populateTransaction.acceptGov(target.address)
  } else {
    throw new Error("Unknown action type")
  }

  console.log(rawTx);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
