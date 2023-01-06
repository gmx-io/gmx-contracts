const {
  deployContract,
  contractAt,
  writeTmpAddresses,
  sendTxn,
} = require("../shared/helpers");

async function main() {
  const tokenManager = await deployContract(
    "TokenManager",
    [4],
    "TokenManager"
  );

  // Signer from treasury
  const signers = [
    "0xee73ccf048bD7aEa4090F06a8bE6C5263bbFF969",
    "0x88888818a99982CB08673f0E1e377C3AF066A840",
    "0xD8df3942Ab5218beeA2F9Df3E71f56C9bac44026",
    "0xAAfcBD2D5D4281bD32cfCdb4b5D1626124878194",
    "0xd2e80D60aff5377587E49FF32c9bad639d6f68Bc",
    "0xE8f0d5BAC383a9e0A2C43D236513F62B6151bDeA"
  ];

  await sendTxn(tokenManager.initialize(signers), "tokenManager.initialize");
  writeTmpAddresses({ tokenManager: tokenManager.address });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
