const {
  deployContract,
  contractAt,
  getFrameSigner,
  writeTmpAddresses,
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
  const admin =
    network === "bsc" ? "" : "0x2CC6D07871A1c0655d6A7c9b0Ad24bED8f940517";
  const buffer = 24 * 60 * 60;
  const maxTokenSupply = expandDecimals("13250000", 18);

  const { tokenManager, glpManager } = await getValues();
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
  writeTmpAddresses({ Timelock: timelock.address });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
