const {
  deployContract,
  contractAt,
  sendTxn,
  writeTmpAddresses,
} = require("../shared/helpers");

const network = process.env.HARDHAT_NETWORK || "mainnet";
const tokens = require("../core/tokens")[network];
const { AddressZero } = ethers.constants

async function main() {
  const vestingDuration = 365 * 24 * 60 * 60;

  const oapVester = await deployContract("Vester", [
    "Vested OAP", // _name
    "vOAP", // _symbol
    vestingDuration, // _vestingDuration
    esGmx.address, // _esToken
    stakedGlpTracker.address, // _pairToken
    gmx.address, // _claimableToken
    stakedGlpTracker.address, // _rewardTracker
  ]);

  await sendTxn(
    esGmx.setHandler(oapVester.address, true),
    "esGmx.setHandler(glpVester)"
  );

  await sendTxn(
    esGmx.setMinter(oapVester.address, true),
    "esGmx.setMinter(glpVester)"
  );

  await sendTxn(
    oapVester.setHandler(rewardRouter.address, true),
    "glpVester.setHandler(rewardRouter)"
  );

  await sendTxn(
    stakedGlpTracker.setHandler(oapVester.address, true),
    "stakedGlpTracker.setHandler(glpVester)"
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
