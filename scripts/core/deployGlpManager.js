const {
  deployContract,
  contractAt,
  sendTxn,
  writeTmpAddresses,
  callWithRetries,
} = require("../shared/helpers");
const { expandDecimals } = require("../../test/shared/utilities");
const { toUsd } = require("../../test/shared/units");

const network = process.env.HARDHAT_NETWORK || "mainnet";
const tokens = require("./tokens")[network];

async function main() {
  const { nativeToken } = tokens;

  const vault = await contractAt(
    "Vault",
    "0xA57F00939D8597DeF1965FF4708921c56D9A36f3"
  );
  const usdg = await contractAt(
    "USDG",
    "0x3eE22225949541aaACCBd1B43289147fb3ad97f1"
  );
  const olp = await contractAt(
    "OAP",
    "0xC6012955CEF9137FE9B1C01361c41FBf7E8dFfD9"
  );
  const shortsTracker = "0x230a476D100Bba2f76edBDF1300df3f963d943Dd";

  const glpManager = await deployContract("GlpManager", [
    vault.address,
    usdg.address,
    olp.address,
    shortsTracker,
    15 * 60,
  ]);

  await sendTxn(
    glpManager.setInPrivateMode(true),
    "glpManager.setInPrivateMode"
  );

  await sendTxn(olp.setMinter(glpManager.address, true), "glp.setMinter");
  await sendTxn(usdg.addVault(glpManager.address), "usdg.addVault");
  await sendTxn(vault.setManager(glpManager.address, true), "vault.setManager");

  writeTmpAddresses({
    glpManager: glpManager.address,
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
