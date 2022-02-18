const { deployContract, contractAt , sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")
const { errors } = require("../../test/core/Vault/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function main() {
  const vault = await contractAt("Vault", "0x9ab2De34A33fB459b538c43f251eB825645e8595")
  const vaultUtils = await deployContract("VaultUtils", [vault.address])
  await sendTxn(vaultUtils.setWithdrawalCooldownDuration(7 * 24 * 60 * 60), "vault.setWithdrawalCooldownDuration")
  await sendTxn(vaultUtils.setMinLeverage(1000), "vault.setMinLeverage")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
