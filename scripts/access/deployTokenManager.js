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

  const signers = [
    "0x2CC6D07871A1c0655d6A7c9b0Ad24bED8f940517", // Testnet 1
    "0x0EaEA9558eFF1d4b76b347A39f54d8CDf01F990F", // Testnet 2
    "0x881690382102106b00a99E3dB86056D0fC71eee6", // Testnet 3
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
