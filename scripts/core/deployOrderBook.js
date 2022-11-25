const {
  deployContract,
  contractAt,
  sendTxn,
  writeTmpAddresses,
} = require("../shared/helpers");
const { expandDecimals } = require("../../test/shared/utilities");

const network = process.env.HARDHAT_NETWORK || "mainnet";
const tokens = require("./tokens")[network];

async function main() {
  const { nativeToken } = tokens;

  const orderBook = await deployContract("OrderBook", []);
  let router, vault, usdg;
  if (network === "testnet") {
    router = "0x3b0417cAbc434e58EBB9B3297D7f2AFa755851dD";
    vault = "0xA57F00939D8597DeF1965FF4708921c56D9A36f3";
    usdg = "0x3eE22225949541aaACCBd1B43289147fb3ad97f1";
  }
  if (network === "bsc") {
    router = "";
    vault = "";
    usdg = "";
  }
  // Arbitrum mainnet addresses
  await sendTxn(
    orderBook.initialize(
      router, // router
      vault, // vault
      nativeToken.address, // weth
      usdg, // usdg
      "10000000000000000", // 0.01 AVAX
      expandDecimals(10, 30) // min purchase token amount usd
    ),
    "orderBook.initialize"
  );

  writeTmpAddresses({
    orderBook: orderBook.address,
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
