const { getFrameSigner, deployContract, contractAt, sendTxn, readTmpAddresses, callWithRetries } = require("../shared/helpers")
const { expandDecimals, bigNumberify } = require("../../test/shared/utilities")
const { toChainlinkPrice } = require("../../test/shared/chainlink")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function main() {
  let signer
  let vaultAddress = "0x489ee077994B6658eAfA855C308275EAd8097C4A"
  const { link, uni, usdc, usdt, btc, eth } = tokens
  let tokenArr = [link, uni]

  if (network === "arbitrumTestnet") {
    vaultAddress = "0xBc9BC47A7aB63db1E0030dC7B60DDcDe29CF4Ffb"
    tokenArr = [btc, usdc, usdt]
  } else {
    signer = await getFrameSigner()
  }

  const vault = await contractAt("Vault", vaultAddress)
  const vaultGov = await vault.gov()

  const vaultTimelock = await contractAt("Timelock", vaultGov, signer)

  console.log("vault", vault.address)
  console.log("vaultTimelock", vaultTimelock.address)

  for (const token of tokenArr) {
    const params = [
      vault.address,
      token.address, // _token
      token.decimals, // _tokenDecimals
      token.tokenWeight, // _tokenWeight
      token.minProfitBps, // _minProfitBps
      expandDecimals(token.maxUsdgAmount, 18), // _maxUsdgAmount
      token.isStable, // _isStable
      token.isShortable // _isShortable
    ]
    const action = ethers.utils.solidityKeccak256([
      "string",
      "address",
      "address",
      "uint256",
      "uint256",
      "uint256",
      "uint256",
      "bool",
      "bool"
    ], ["vaultSetTokenConfig", ...params])
    const actionTimestamp = await vaultTimelock.pendingActions(action)
    let vaultMethod = "signalVaultSetTokenConfig"
    if (actionTimestamp.gt(0)) { // action was already signalled
      console.log("Pending action exists timestamp: %s (%s)", actionTimestamp.toString(), new Date(actionTimestamp.toNumber() * 1000))
      vaultMethod = "vaultSetTokenConfig"
    }
    console.log("vaultMethod", vaultMethod)
    await sendTxn(vaultTimelock[vaultMethod](...params, {gasLimit: 1000000, gasPrice:1000000000}), `vault.${vaultMethod}(${token.name}) ${token.address}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
