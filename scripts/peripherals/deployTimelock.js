const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { signExternally } = require("../shared/signer")
const { expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

async function getArbValues() {
  const vault = await contractAt("Vault", "0x489ee077994B6658eAfA855C308275EAd8097C4A")
  const tokenManager = { address: "0xddDc546e07f1374A07b270b7d863371e575EA96A" }
  const glpManager = { address: "0x3963FfC9dff443c2A94f21b129D429891E32ec18" }
  const prevGlpManager = { address: "0x321F653eED006AD1C29D174e17d96351BDe22649" }
  const rewardRouter = { address: "0x159854e14A862Df9E39E1D128b8e5F70B4A3cE9B" }

  const positionRouter = { address: "0xb87a436B93fFE9D75c5cFA7bAcFff96430b09868" }
  const positionManager = { address: "0x75E42e6f01baf1D6022bEa862A28774a9f8a4A0C" }
  const gmx = { address: "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a" }

  const feeHandler = { address: "0x7cC506C8d711C2A17B61A75bd082d2514160baAd" }

  return {
    vault,
    tokenManager,
    glpManager,
    prevGlpManager,
    rewardRouter,
    positionRouter,
    positionManager,
    gmx,
    feeHandler
  }
}

async function getAvaxValues() {
  const vault = await contractAt("Vault", "0x9ab2De34A33fB459b538c43f251eB825645e8595")
  const tokenManager = { address: "0x8b25Ba1cAEAFaB8e9926fabCfB6123782e3B4BC2" }
  const glpManager = { address: "0xD152c7F25db7F4B95b7658323c5F33d176818EE4" }
  const prevGlpManager = { address: "0xe1ae4d4b06A5Fe1fc288f6B4CD72f9F8323B107F" }
  const rewardRouter = { address: "0x0000000000000000000000000000000000000000" }

  const positionRouter = { address: "0xffF6D276Bc37c61A23f06410Dce4A400f66420f8" }
  const positionManager = { address: "0xA21B83E579f4315951bA658654c371520BDcB866" }
  const gmx = { address: "0x62edc0692BD897D2295872a9FFCac5425011c661" }

  const feeHandler = { address: "0x775CaaA2cB635a56c6C3dFb9C65B5Fa6335F79E7" }

  return {
    vault,
    tokenManager,
    glpManager,
    prevGlpManager,
    rewardRouter,
    positionRouter,
    positionManager,
    gmx,
    feeHandler
  }
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
  const admin = "0x49B373D422BdA4C6BfCdd5eC1E48A9a26fdA2F8b"
  const buffer = 24 * 60 * 60
  // the GmxTimelock should have a cap of 13.25m tokens, for other tokens
  // like Multiplier Points, the supply may exceed 13.25m tokens
  const maxTokenSupply = expandDecimals(100_000_000, 18)

  const {
    vault,
    tokenManager,
    glpManager,
    prevGlpManager,
    rewardRouter,
    positionRouter,
    positionManager,
    gmx,
    feeHandler
  } = await getValues()

  const mintReceiver = tokenManager

  const timelock = await deployContract("Timelock", [
    admin, // admin
    buffer, // buffer
    tokenManager.address, // tokenManager
    mintReceiver.address, // mintReceiver
    glpManager.address, // glpManager
    prevGlpManager.address, // prevGlpManager
    rewardRouter.address, // rewardRouter
    maxTokenSupply, // maxTokenSupply
    10, // marginFeeBasisPoints 0.1%
    500 // maxMarginFeeBasisPoints 5%
  ], "Timelock")

  const deployedTimelock = await contractAt("Timelock", timelock.address)

  const multicallWriteParams = []

  multicallWriteParams.push(deployedTimelock.interface.encodeFunctionData("setShouldToggleIsLeverageEnabled", [true]));
  multicallWriteParams.push(deployedTimelock.interface.encodeFunctionData("setContractHandler", [positionRouter.address, true]));
  multicallWriteParams.push(deployedTimelock.interface.encodeFunctionData("setContractHandler", [positionManager.address, true]));
  multicallWriteParams.push(deployedTimelock.interface.encodeFunctionData("setFeeHandler", [feeHandler.address, true]));

  const handlers = [
    "0x82429089e7c86B7047b793A9E7E7311C93d2b7a6", // coinflipcanada
    "0xD7941C4Ca57a511F21853Bbc7FBF8149d5eCb398", // G
    "0xfb481D70f8d987c1AE3ADc90B7046e39eb6Ad64B", // kr
    "0x6091646D0354b03DD1e9697D33A7341d8C93a6F5" // xhiroz
  ]

  for (let i = 0; i < handlers.length; i++) {
    const handler = handlers[i]
    multicallWriteParams.push(deployedTimelock.interface.encodeFunctionData("setContractHandler", [handler, true]));
  }

  const keepers = [
    "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8" // X
  ]

  for (let i = 0; i < keepers.length; i++) {
    const keeper = keepers[i]
    multicallWriteParams.push(deployedTimelock.interface.encodeFunctionData("setContractHandler", [keeper, true]));
  }

  multicallWriteParams.push(deployedTimelock.interface.encodeFunctionData("signalApprove", [gmx.address, admin, "1000000000000000000"]));
  await signExternally(await deployedTimelock.populateTransaction.multicall(multicallWriteParams));

  // // update gov of vault
  const vaultGov = await contractAt("Timelock", await vault.gov())

  await signExternally(await vaultGov.populateTransaction.signalSetGov(vault.address, deployedTimelock.address));
  // to revert the gov change if needed
  await signExternally(await deployedTimelock.populateTransaction.signalSetGov(vault.address, vaultGov.address));
}

main().catch((ex) => {
  console.error(ex);
  process.exit(1);
});
