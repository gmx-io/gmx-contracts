const { contractAt , sendTxn } = require("../shared/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

async function main() {
  let vault
  if (network === "avax") {
    vault = await contractAt("Vault", "0x9ab2De34A33fB459b538c43f251eB825645e8595")
  }
  if (network === "arbitrum") {
    vault = await contractAt("Vault", "0x489ee077994B6658eAfA855C308275EAd8097C4A")
  }

  const timelock = await contractAt("Timelock", await vault.gov())
  console.log("timelock", timelock.address)

  await sendTxn(timelock.setSwapFees(
    vault.address,
    60, // _taxBasisPoints
    5, // _stableTaxBasisPoints
    25, // _mintBurnFeeBasisPoints
    25, // _swapFeeBasisPoints
    1, // _stableSwapFeeBasisPoints
  ), "vault.setSwapFees")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
