const {
  deployContract,
  contractAt,
  writeTmpAddresses,
} = require("../shared/helpers");

async function main() {
  await deployContract("EsOPEN", [])
  // const olp = await deployContract("OAP", []);
  // await deployContract("MintableBaseToken", ["esGMX IOU", "esGMX:IOU", 0])
  // writeTmpAddresses({ OAP: olp.address });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
