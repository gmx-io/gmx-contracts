const {
  deployContract,
  contractAt,
  sendTxn,
  writeTmpAddresses,
} = require("../shared/helpers");
const { expandDecimals } = require("../../test/shared/utilities");
const { toUsd } = require("../../test/shared/units");
const { errors } = require("../../test/core/Vault/helpers");

const network = process.env.HARDHAT_NETWORK || "mainnet";
const tokens = require("./tokens")[network];

async function main() {
  let vaultAddr, orderBookAddr;
  if (network === "testnet") {
    vaultAddr = "0xA57F00939D8597DeF1965FF4708921c56D9A36f3";
    orderBookAddr = "0x38d0fc0aF9E757D70fA9B2C3b7816c6795afae6d";
  }

  if (network === "bsc") {
    vaultAddr = "";
    orderBookAddr = "";
  }
  console.log("D1");
  const vault = await contractAt("Vault", vaultAddr);
  console.log("D2");
  const orderBook = await contractAt("OrderBook", orderBookAddr);
  const orderExecutor = await deployContract("OrderExecutor", [
    vault.address,
    orderBook.address,
  ]);
  writeTmpAddresses({
    orderExecutor: orderExecutor.address,
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
