const {
  getFrameSigner,
  deployContract,
  contractAt,
  sendTxn,
  readTmpAddresses,
  writeTmpAddresses,
} = require("../shared/helpers");
const { expandDecimals } = require("../../test/shared/utilities");
const { toUsd } = require("../../test/shared/units");

const network = process.env.HARDHAT_NETWORK || "mainnet";
const tokens = require("./tokens")[network];

async function getTestnetValues(signer) {
  const vault = await contractAt(
    "Vault",
    "0xA57F00939D8597DeF1965FF4708921c56D9A36f3"
  );

  const timelock = await contractAt(
    "Timelock",
    "0x8D0De55e339b8CC62eC98A05aA46b6F352dE4054"
  );
  const router = await contractAt("Router", await vault.router());
  const weth = await contractAt("WETH", tokens.nativeToken.address);

  const referralStorage = await contractAt(
    "ReferralStorage",
    "0xcFB491149F0a037EfcF5A0323cc460C8a83635Fa"
  );
  const shortsTracker = await contractAt(
    "ShortsTracker",
    "0x230a476D100Bba2f76edBDF1300df3f963d943Dd"
  );
  const depositFee = "30"; // 0.3%
  const minExecutionFee = "100000000000000"; // 0.0001 ETH
  return {
    vault,
    timelock,
    router,
    weth,
    referralStorage,
    shortsTracker,
    depositFee,
    minExecutionFee,
  };
}

async function getArbValues(signer) {
  const vault = await contractAt(
    "Vault",
    "0x489ee077994B6658eAfA855C308275EAd8097C4A"
  );
  const timelock = await contractAt("Timelock", await vault.gov(), signer);
  const router = await contractAt("Router", await vault.router(), signer);
  const weth = await contractAt("WETH", tokens.nativeToken.address);
  const referralStorage = await contractAt(
    "ReferralStorage",
    "0xe6fab3F0c7199b0d34d7FbE83394fc0e0D06e99d"
  );
  const shortsTracker = await contractAt(
    "ShortsTracker",
    "0xf58eEc83Ba28ddd79390B9e90C4d3EbfF1d434da",
    signer
  );
  const depositFee = "30"; // 0.3%
  const minExecutionFee = "100000000000000"; // 0.0001 ETH

  return {
    vault,
    timelock,
    router,
    weth,
    referralStorage,
    shortsTracker,
    depositFee,
    minExecutionFee,
    positionKeepers,
  };
}

async function getAvaxValues(signer) {
  const vault = await contractAt(
    "Vault",
    "0x9ab2De34A33fB459b538c43f251eB825645e8595"
  );
  const timelock = await contractAt("Timelock", await vault.gov(), signer);
  const router = await contractAt("Router", await vault.router(), signer);
  const weth = await contractAt("WETH", tokens.nativeToken.address);
  const referralStorage = await contractAt(
    "ReferralStorage",
    "0x827ED045002eCdAbEb6e2b0d1604cf5fC3d322F8"
  );
  const shortsTracker = await contractAt(
    "ShortsTracker",
    "0x9234252975484D75Fd05f3e4f7BdbEc61956D73a",
    signer
  );
  const depositFee = "30"; // 0.3%
  const minExecutionFee = "20000000000000000"; // 0.02 AVAX

  return {
    vault,
    timelock,
    router,
    weth,
    referralStorage,
    shortsTracker,
    depositFee,
    minExecutionFee,
  };
}

async function getValues(signer) {
  if (network === "arbitrum") {
    return getArbValues(signer);
  }

  if (network === "avax") {
    return getAvaxValues(signer);
  }

  if (network === "testnet") {
    return getTestnetValues(signer);
  }
}

async function main() {
  const signer = await getFrameSigner();
  const {
    vault,
    timelock,
    router,
    weth,
    shortsTracker,
    depositFee,
    minExecutionFee,
    referralStorage,
  } = await getValues(signer);

  const referralStorageGov = await contractAt(
    "Timelock",
    await referralStorage.gov()
  );

  const positionRouterArgs = [
    vault.address,
    router.address,
    weth.address,
    shortsTracker.address,
    depositFee,
    minExecutionFee,
  ];
  // const positionRouter = await deployContract(
  //   "PositionRouter",
  //   positionRouterArgs
  // );
  const positionRouter = await contractAt(
    "PositionRouter",
    "0x9B25fb7d0af7B36d9dF9b872d1e80D42F0278168"
  );

  // await sendTxn(
  //   positionRouter.setReferralStorage(referralStorage.address),
  //   "positionRouter.setReferralStorage"
  // );

  // await sendTxn(
  //   referralStorageGov.signalSetHandler(
  //     referralStorage.address,
  //     positionRouter.address,
  //     true
  //   ),
  //   "referralStorage.signalSetHandler(positionRouter)"
  // );

  // await sendTxn(
  //   shortsTracker.setHandler(positionRouter.address, true),
  //   "shortsTracker.setHandler(positionRouter)"
  // );

  // await sendTxn(router.addPlugin(positionRouter.address), "router.addPlugin");

  // await sendTxn(
  //   positionRouter.setDelayValues(1, 180, 30 * 60),
  //   "positionRouter.setDelayValues"
  // );
  // await sendTxn(
  //   timelock.setContractHandler(positionRouter.address, true),
  //   "timelock.setContractHandler(positionRouter)"
  // );

  await sendTxn(
    positionRouter.setGov(await vault.gov()),
    "positionRouter.setGov"
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
