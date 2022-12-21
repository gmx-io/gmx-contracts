const { deployContract, contractAt, sendTxn } = require("../shared/helpers");
const { expandDecimals } = require("../../test/shared/utilities");

async function main() {
  const admin = { address: "0x2CC6D07871A1c0655d6A7c9b0Ad24bED8f940517" };
  const buffer = 60 * 60;
  const tokenManager = {
    address: "0x15f54d599ADF24b809de9B9C917061Ce0cB7617f",
  };
  const rewardManager = tokenManager;
  const maxTokenSupply = expandDecimals("13250000", 18);
  const marginFeeBasisPoints = 10;
  const maxMarginFeeBasisPoints = 500;

  const weth = await contractAt(
    "Token",
    "0x612777Eea37a44F7a95E3B101C39e1E2695fa6C2"
  );

  const gmx = { address: "0xab1d62E6a2d4Db62DbB39Dc00544537b6b424659" };
  const esGmx = { address: "0x8A4271871980a31a3Ee87E3727057e68B43DcC59" };
  const bnGmx = { address: "0xcD7a09723E1FF43facbC3aE804A97165c5450C89" };
  const glp = { address: "0xC6012955CEF9137FE9B1C01361c41FBf7E8dFfD9" };
  const stakedGmxTracker = {
    address: "0xd2254Cde748E4ABf53dF5B82e87C0C0ee366C8C5",
  };
  const bonusGmxTracker = {
    address: "0x4e30C59431681800A23CD0E4dcdA651A92ef247e",
  };
  const feeGmxTracker = {
    address: "0x710F155CCA8df2DC653356272d8186b5fAF406cc",
  };
  const feeGlpTracker = {
    address: "0x7f6f651B06effdd643b88f52fb2A829E49C21498",
  };
  const stakedGlpTracker = {
    address: "0xE3eEC80bE8A4fa19F880aD0057fB3C9E55e337b8",
  };
  const glpManager = { address: "0xD3ce791f179C7e6DCF641F98417fC10f47Fc986b" };
  const stakedGmxDistributor = {
    address: "0x4980dF9955868fBB580b6c2D7D68Cbf61E00850c",
  };
  const stakedGlpDistributor = {
    address: "0xf9063fBC9481C13EB23883473E8B435857039d88",
  };

  const timelock = await deployContract("Timelock", [
    admin.address,
    buffer,
    rewardManager.address,
    tokenManager.address,
    glpManager.address,
    maxTokenSupply,
    marginFeeBasisPoints,
    maxMarginFeeBasisPoints,
  ]);

  const vestingDuration = 365 * 24 * 60 * 60;

  const gmxVester = { address: "0xa03ef7935189001e8f6134b230dcfa7b419cf915" };

  const glpVester = { address: "0x5e45a3359499701cafba0e1af161c7d7b386129b" };

  const rewardRouter = {
    address: "0x662634108dc549FE0d38291F5c4971a557525A5E",
  };

  // await rewardRouter.initialize(
  //   weth.address,
  //   gmx.address,
  //   esGmx.address,
  //   bnGmx.address,
  //   glp.address,
  //   stakedGmxTracker.address,
  //   bonusGmxTracker.address,
  //   feeGmxTracker.address,
  //   feeGlpTracker.address,
  //   stakedGlpTracker.address,
  //   glpManager.address,
  //   gmxVester.address,
  //   glpVester.address
  // );

  await rewardManager.initialize(
    timelock.address,
    rewardRouter.address,
    glpManager.address,
    stakedGmxTracker.address,
    bonusGmxTracker.address,
    feeGmxTracker.address,
    feeGlpTracker.address,
    stakedGlpTracker.address,
    stakedGmxDistributor.address,
    stakedGlpDistributor.address,
    esGmx.address,
    bnGmx.address,
    gmxVester.address,
    glpVester.address
  );

  // await rewardManager.updateEsGmxHandlers()
  // await rewardManager.enableRewardRouter()
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
