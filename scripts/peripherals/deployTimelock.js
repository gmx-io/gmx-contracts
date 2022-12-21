const {
  deployContract,
  contractAt,
  getFrameSigner,
  writeTmpAddresses,
  sendTxn
} = require("../shared/helpers");
const { expandDecimals } = require("../../test/shared/utilities");

const network = process.env.HARDHAT_NETWORK || "mainnet";

async function getTestnetValues() {
  const vault = await contractAt(
    "Vault",
    "0xA57F00939D8597DeF1965FF4708921c56D9A36f3"
  );
  const tokenManager = {
    address: "0x15f54d599ADF24b809de9B9C917061Ce0cB7617f",
  };
  const glpManager = { address: "0x5b7a04B9f5f88f215920fDcC704084349530Dcc7" };

  const positionRouter = {
    address: "0x9B25fb7d0af7B36d9dF9b872d1e80D42F0278168",
  };
  const positionManager = {
    address: "0x32Ca0C28cCef0BC31991EE4Ac286C27679e57222",
  };
  const gmx = { address: "0xab1d62E6a2d4Db62DbB39Dc00544537b6b424659" };
  const rewardRouter = { address:"0x662634108dc549FE0d38291F5c4971a557525A5E" }

  return {
    vault,
    tokenManager,
    glpManager,
    positionRouter,
    positionManager,
    gmx,
    rewardRouter
  };
}

async function getArbValues() {
  const vault = await contractAt("Vault", "0x489ee077994B6658eAfA855C308275EAd8097C4A")
  const tokenManager = { address: "0xddDc546e07f1374A07b270b7d863371e575EA96A" }
  const glpManager = { address: "0x321F653eED006AD1C29D174e17d96351BDe22649" }
  const rewardRouter = { address: "0xB95DB5B167D75e6d04227CfFFA61069348d271F5" }

  const positionRouter = { address: "0xb87a436B93fFE9D75c5cFA7bAcFff96430b09868" }
  const positionManager = { address: "0x75E42e6f01baf1D6022bEa862A28774a9f8a4A0C" }
  const gmx = { address: "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a" }

  return { vault, tokenManager, glpManager, rewardRouter, positionRouter, positionManager, gmx }
}

async function getAvaxValues() {
  const vault = await contractAt("Vault", "0x9ab2De34A33fB459b538c43f251eB825645e8595")
  const tokenManager = { address: "0x8b25Ba1cAEAFaB8e9926fabCfB6123782e3B4BC2" }
  const glpManager = { address: "0xe1ae4d4b06A5Fe1fc288f6B4CD72f9F8323B107F" }
  const rewardRouter = { address: "0xB70B91CE0771d3f4c81D87660f71Da31d48eB3B3" }

  const positionRouter = { address: "0xffF6D276Bc37c61A23f06410Dce4A400f66420f8" }
  const positionManager = { address: "0xA21B83E579f4315951bA658654c371520BDcB866" }
  const gmx = { address: "0x62edc0692BD897D2295872a9FFCac5425011c661" }

  return { vault, tokenManager, glpManager, rewardRouter, positionRouter, positionManager, gmx }
}

async function getValues() {
  if (network === "arbitrum") {
    return getArbValues();
  }

  if (network === "avax") {
    return getAvaxValues();
  }

  if (network === "testnet") {
    return getTestnetValues();
  }
}

async function main() {
  const signer = await getFrameSigner()

  const admin = "0x2CC6D07871A1c0655d6A7c9b0Ad24bED8f940517"
  const buffer = network === "testnet"? 5 * 60 : 24 * 60 * 60
  const maxTokenSupply = expandDecimals("13250000", 18)

  const { vault, tokenManager, glpManager, rewardRouter, positionRouter, positionManager, gmx } = await getValues()
  const mintReceiver = tokenManager

  const timelock = await deployContract("Timelock", [
    admin,
    buffer,
    tokenManager.address,
    mintReceiver.address,
    glpManager.address,
    maxTokenSupply,
    10, // marginFeeBasisPoints 0.1%
    500 // maxMarginFeeBasisPoints 5%
  ], "Timelock")

  const deployedTimelock = await contractAt("Timelock", timelock.address)

  await sendTxn(deployedTimelock.setShouldToggleIsLeverageEnabled(true), "deployedTimelock.setShouldToggleIsLeverageEnabled(true)")
  await sendTxn(deployedTimelock.setContractHandler(positionRouter.address, true), "deployedTimelock.setContractHandler(positionRouter)")
  await sendTxn(deployedTimelock.setContractHandler(positionManager.address, true), "deployedTimelock.setContractHandler(positionManager)")

  // // update gov of vault
  // const vaultGov = await contractAt("Timelock", await vault.gov(), signer)

  // await sendTxn(vaultGov.signalSetGov(vault.address, deployedTimelock.address), "vaultGov.signalSetGov")
  // await sendTxn(deployedTimelock.signalSetGov(vault.address, vaultGov.address), "deployedTimelock.signalSetGov(vault)")

  const handlers = [
    "0x0EaEA9558eFF1d4b76b347A39f54d8CDf01F990F", // Tam
    "0xd6E095046868c48f9a194c2b9875e29DF7C44C85", // Phuong
  ];

  for (let i = 0; i < handlers.length; i++) {
    const handler = handlers[i]
    await sendTxn(deployedTimelock.setContractHandler(handler, true), `deployedTimelock.setContractHandler(${handler})`)
  }

  const keepers = [
    "0x2CC6D07871A1c0655d6A7c9b0Ad24bED8f940517", // Tam keeper
  ];

  for (let i = 0; i < keepers.length; i++) {
    const keeper = keepers[i];
    await sendTxn(
      deployedTimelock.setKeeper(keeper, true),
      `deployedTimelock.setKeeper(${keeper})`
    );
  }

  await sendTxn(
    deployedTimelock.signalApprove(gmx.address, admin, "1000000000000000000"),
    "deployedTimelock.signalApprove"
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
