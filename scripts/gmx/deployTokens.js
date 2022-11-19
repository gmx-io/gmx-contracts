const {
  deployContract,
  contractAt,
  writeTmpAddresses,
} = require("../shared/helpers");

async function main() {
  // await deployContract("EsGMX", [])
  const olp = await deployContract("OLP", []);
  // await deployContract("MintableBaseToken", ["esGMX IOU", "esGMX:IOU", 0])
  writeTmpAddresses({ OLP: olp.address });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
