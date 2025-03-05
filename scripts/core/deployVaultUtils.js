const { deployContract, contractAt , sendTxn } = require("../shared/helpers")
const { signExternally } = require("../shared/signer")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")
const { errors } = require("../../test/core/Vault/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function main() {
  const vault = await contractAt("Vault", "0x9ab2De34A33fB459b538c43f251eB825645e8595")
  const timelock = await contractAt("Timelock", await vault.gov())
  const vaultUtils = await deployContract("VaultUtils", [vault.address])
  // await signExternally(await timelock.populateTransaction.setVaultUtils(vault.address, vaultUtils.address));
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
