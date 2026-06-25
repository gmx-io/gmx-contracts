const { getFrameSigner, deployContract, contractAt, sendTxn } = require("../shared/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

// Removes MIM from the GMX v1 Vault whitelist.
//
// Why: MIM is still iterated over by GlpManager.getAum, which calls VaultPriceFeed for
// each whitelisted token. If Chainlink shuts down the MIM feed, getPrimaryPrice reverts
// (require(_p > 0)), which makes getAum revert, which breaks GLP minting and redeeming.
// Clearing MIM from the whitelist makes getAum skip it (if (!isWhitelisted) continue).
//
// This must be done BEFORE the feed is shut down to avoid a window where GLP mint/redeem
// is bricked. clearTokenConfig itself does not read prices, so it would still execute even
// after the feed is dead - but every getAum call until then would revert.
//
// Vault.clearTokenConfig is onlyGov and the Vault gov is a Timelock with no passthrough
// for it, so this goes through the requestGov / IGovRequester flow via the
// VaultTokenConfigCleaner helper contract.

async function getArbValues() {
  const vault = await contractAt("Vault", "0x489ee077994B6658eAfA855C308275EAd8097C4A")
  const { mim } = tokens
  return { vault, tokenArr: [mim] }
}

async function getAvaxValues() {
  const vault = await contractAt("Vault", "0x9ab2De34A33fB459b538c43f251eB825645e8595")
  const { mim } = tokens
  return { vault, tokenArr: [mim] }
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
  const signer = await getFrameSigner()
  const admin = await signer.getAddress()

  const { vault, tokenArr } = await getValues()
  const vaultGov = await vault.gov()
  const timelock = await contractAt("Timelock", vaultGov, signer)

  console.log("vault", vault.address)
  console.log("vault gov (timelock)", timelock.address)
  console.log("admin", admin)

  // 1. Pre-state: confirm MIM is whitelisted and check its pool balance.
  //    A non-zero poolAmount means MIM still backs GLP - removing it from the whitelist
  //    will drop that value from AUM and move the GLP price. Drain/swap it out first if so.
  for (const token of tokenArr) {
    const whitelisted = await vault.whitelistedTokens(token.address)
    const poolAmount = await vault.poolAmounts(token.address)
    console.log(`pre: ${token.name} ${token.address} whitelisted=${whitelisted} poolAmount=${poolAmount.toString()}`)
  }

  // 2. Deploy the gov-requester helper that performs the clearTokenConfig calls.
  //    Deployment uses the default deployer; the privileged run() below is sent by the
  //    frame signer, so admin is set to the frame signer address.
  const cleaner = await deployContract("VaultTokenConfigCleaner", [
    admin,
    vault.address,
    tokenArr.map((t) => t.address)
  ], "VaultTokenConfigCleaner")

  // 3. Register the helper as a gov requester on the Timelock.
  //    This is a buffered Timelock action, so it is two steps with a wait in between:
  //
  //      await sendTxn(timelock.signalSetGovRequester(cleaner.address, true), "signalSetGovRequester")
  //      // ... wait for the Timelock buffer to elapse ...
  //      await sendTxn(timelock.setGovRequester(cleaner.address, true), "setGovRequester")
  //
  //    Left commented so this script can be run after the requester is enabled; uncomment
  //    the signal call for the first run, then the set call after the buffer.
  // await sendTxn(timelock.signalSetGovRequester(cleaner.address, true), "timelock.signalSetGovRequester")
  // await sendTxn(timelock.setGovRequester(cleaner.address, true), "timelock.setGovRequester")

  // 4. Execute: pulls Vault gov, clears the tokens, hands gov back - all atomic.
  await sendTxn(cleaner.connect(signer).run(), "cleaner.run()")

  // 5. Post-state: gov is back with the Timelock and the tokens are no longer whitelisted.
  console.log("vault gov after", await vault.gov())
  for (const token of tokenArr) {
    const whitelisted = await vault.whitelistedTokens(token.address)
    console.log(`post: ${token.name} ${token.address} whitelisted=${whitelisted} (expected false)`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
