const {
  deployContract,
  contractAt,
  sendTxn,
  getFrameSigner,
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
    address: "0xb87a436B93fFE9D75c5cFA7bAcFff96430b09868",
  };
  const positionManager = {
    address: "0x75E42e6f01baf1D6022bEa862A28774a9f8a4A0C",
  };
  const gmx = { address: "0xab1d62E6a2d4Db62DbB39Dc00544537b6b424659" };

  return {
    vault,
    tokenManager,
    glpManager,
    positionRouter,
    positionManager,
    gmx,
  };
}

async function getArbValues() {
  const vault = await contractAt(
    "Vault",
    "0x489ee077994B6658eAfA855C308275EAd8097C4A"
  );
  const tokenManager = {
    address: "0xddDc546e07f1374A07b270b7d863371e575EA96A",
  };
  const glpManager = { address: "0x321F653eED006AD1C29D174e17d96351BDe22649" };

  const positionRouter = {
    address: "0xb87a436B93fFE9D75c5cFA7bAcFff96430b09868",
  };
  const positionManager = {
    address: "0x75E42e6f01baf1D6022bEa862A28774a9f8a4A0C",
  };
  const gmx = { address: "0xab1d62E6a2d4Db62DbB39Dc00544537b6b424659" };

  return {
    vault,
    tokenManager,
    glpManager,
    positionRouter,
    positionManager,
    gmx,
  };
}

async function getAvaxValues() {
  const vault = await contractAt(
    "Vault",
    "0x9ab2De34A33fB459b538c43f251eB825645e8595"
  );
  const tokenManager = {
    address: "0x8b25Ba1cAEAFaB8e9926fabCfB6123782e3B4BC2",
  };
  const glpManager = { address: "0xe1ae4d4b06A5Fe1fc288f6B4CD72f9F8323B107F" };

  const positionRouter = {
    address: "0xffF6D276Bc37c61A23f06410Dce4A400f66420f8",
  };
  const positionManager = {
    address: "0xA21B83E579f4315951bA658654c371520BDcB866",
  };
  const gmx = { address: "0x62edc0692BD897D2295872a9FFCac5425011c661" };

  return {
    vault,
    tokenManager,
    glpManager,
    positionRouter,
    positionManager,
    gmx,
  };
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
  const signer = await getFrameSigner();

  const admin =
    network === "bsc" ? "" : "0x49B373D422BdA4C6BfCdd5eC1E48A9a26fdA2F8b";
  const buffer = 24 * 60 * 60;
  const maxTokenSupply = expandDecimals("13250000", 18);

  const {
    vault,
    tokenManager,
    glpManager,
    positionRouter,
    positionManager,
    gmx,
  } = await getValues();
  const mintReceiver = tokenManager;

  const timelock = await deployContract(
    "Timelock",
    [
      admin,
      buffer,
      tokenManager.address,
      mintReceiver.address,
      glpManager.address,
      maxTokenSupply,
      10, // marginFeeBasisPoints 0.1%
      500, // maxMarginFeeBasisPoints 5%
    ],
    "Timelock"
  );

  const deployedTimelock = await contractAt(
    "Timelock",
    timelock.address,
    signer
  );

  await sendTxn(
    deployedTimelock.setShouldToggleIsLeverageEnabled(true),
    "deployedTimelock.setShouldToggleIsLeverageEnabled(true)"
  );
  await sendTxn(
    deployedTimelock.setContractHandler(positionRouter.address, true),
    "deployedTimelock.setContractHandler(positionRouter)"
  );
  await sendTxn(
    deployedTimelock.setContractHandler(positionManager.address, true),
    "deployedTimelock.setContractHandler(positionManager)"
  );

  // // update gov of vault
  // const vaultGov = await contractAt("Timelock", await vault.gov(), signer)

  // await sendTxn(vaultGov.signalSetGov(vault.address, deployedTimelock.address), "vaultGov.signalSetGov")
  // await sendTxn(deployedTimelock.signalSetGov(vault.address, vaultGov.address), "deployedTimelock.signalSetGov(vault)")

  const signers = [
    "0x82429089e7c86B7047b793A9E7E7311C93d2b7a6", // coinflipcanada
    "0xD7941C4Ca57a511F21853Bbc7FBF8149d5eCb398", // G
    "0xfb481D70f8d987c1AE3ADc90B7046e39eb6Ad64B", // kr
    "0x99Aa3D1b3259039E8cB4f0B33d0Cfd736e1Bf49E", // quat
    "0x6091646D0354b03DD1e9697D33A7341d8C93a6F5", // xhiroz
  ];

  for (let i = 0; i < signers.length; i++) {
    const signer = signers[i];
    await sendTxn(
      deployedTimelock.setContractHandler(signer, true),
      `deployedTimelock.setContractHandler(${signer})`
    );
  }

  const keepers = [
    "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8", // X
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
