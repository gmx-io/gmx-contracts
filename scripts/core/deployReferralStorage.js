const { deployContract, writeTmpAddresses } = require("../shared/helpers");
const { expandDecimals } = require("../../test/shared/utilities");
const { toUsd } = require("../../test/shared/units");

const network = process.env.HARDHAT_NETWORK || "mainnet";

async function main() {
  const ReferralStorage = await deployContract("ReferralStorage", []);
  writeTmpAddresses({ ReferralStorage: ReferralStorage.address });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
