const {
  deployContract,
  contractAt,
  sendTxn,
  writeTmpAddresses,
} = require("../shared/helpers");
const { expandDecimals } = require("../../test/shared/utilities");

async function main() {
  // FIXME: Update Deployer address in mainnet BSC
  const wallet = { address: "0x2CC6D07871A1c0655d6A7c9b0Ad24bED8f940517" };
  const { AddressZero } = ethers.constants;

  const weth = { address: "0x612777Eea37a44F7a95E3B101C39e1E2695fa6C2" };
  const gmx = await contractAt(
    "GMX",
    "0xab1d62E6a2d4Db62DbB39Dc00544537b6b424659"
  );
  const esGmx = await deployContract("EsGMX", []);
  const bnGmx = await deployContract("MintableBaseToken", [
    "Bonus GMX",
    "bnGMX",
    0,
  ]);
  const bnAlp = { address: AddressZero };
  const alp = { address: AddressZero };

  const stakedGmxTracker = await deployContract("RewardTracker", [
    "Staked GMX",
    "sGMX",
  ]);
  const stakedGmxDistributor = await deployContract("RewardDistributor", [
    esGmx.address,
    stakedGmxTracker.address,
  ]);

  writeTmpAddresses({
    bnGmx: bnGmx.address,
    esGmx: esGmx.address,
    sGMX: stakedGmxTracker.address,
    stakedGmxDistributor: stakedGmxDistributor.address,
  });

  await sendTxn(
    stakedGmxTracker.initialize(
      [gmx.address, esGmx.address],
      stakedGmxDistributor.address
    ),
    "stakedGmxTracker.initialize"
  );
  await sendTxn(
    stakedGmxDistributor.updateLastDistributionTime(),
    "stakedGmxDistributor.updateLastDistributionTime"
  );

  const bonusGmxTracker = await deployContract("RewardTracker", [
    "Staked + Bonus GMX",
    "sbGMX",
  ]);
  const bonusGmxDistributor = await deployContract("BonusDistributor", [
    bnGmx.address,
    bonusGmxTracker.address,
  ]);
  writeTmpAddresses({
    sbGMX: bonusGmxTracker.address,
    bonusGmxDistributor: bonusGmxDistributor.address,
  });
  await sendTxn(
    bonusGmxTracker.initialize(
      [stakedGmxTracker.address],
      bonusGmxDistributor.address
    ),
    "bonusGmxTracker.initialize"
  );
  await sendTxn(
    bonusGmxDistributor.updateLastDistributionTime(),
    "bonusGmxDistributor.updateLastDistributionTime"
  );

  const feeGmxTracker = await deployContract("RewardTracker", [
    "Staked + Bonus + Fee GMX",
    "sbfGMX",
  ]);
  const feeGmxDistributor = await deployContract("RewardDistributor", [
    weth.address,
    feeGmxTracker.address,
  ]);

  writeTmpAddresses({
    feeGmxTracker: feeGmxTracker.address,
    feeGmxDistributor: feeGmxDistributor.address,
  });
  await sendTxn(
    feeGmxTracker.initialize(
      [bonusGmxTracker.address, bnGmx.address],
      feeGmxDistributor.address
    ),
    "feeGmxTracker.initialize"
  );
  await sendTxn(
    feeGmxDistributor.updateLastDistributionTime(),
    "feeGmxDistributor.updateLastDistributionTime"
  );

  const feeGlpTracker = { address: AddressZero };
  const stakedGlpTracker = { address: AddressZero };

  const stakedAlpTracker = { address: AddressZero };
  const bonusAlpTracker = { address: AddressZero };
  const feeAlpTracker = { address: AddressZero };

  const glpManager = { address: "0x5b7a04B9f5f88f215920fDcC704084349530Dcc7" };
  const glp = { address: "0xC6012955CEF9137FE9B1C01361c41FBf7E8dFfD9" };

  await sendTxn(
    stakedGmxTracker.setInPrivateTransferMode(true),
    "stakedGmxTracker.setInPrivateTransferMode"
  );
  await sendTxn(
    stakedGmxTracker.setInPrivateStakingMode(true),
    "stakedGmxTracker.setInPrivateStakingMode"
  );
  await sendTxn(
    bonusGmxTracker.setInPrivateTransferMode(true),
    "bonusGmxTracker.setInPrivateTransferMode"
  );
  await sendTxn(
    bonusGmxTracker.setInPrivateStakingMode(true),
    "bonusGmxTracker.setInPrivateStakingMode"
  );
  await sendTxn(
    bonusGmxTracker.setInPrivateClaimingMode(true),
    "bonusGmxTracker.setInPrivateClaimingMode"
  );
  await sendTxn(
    feeGmxTracker.setInPrivateTransferMode(true),
    "feeGmxTracker.setInPrivateTransferMode"
  );
  await sendTxn(
    feeGmxTracker.setInPrivateStakingMode(true),
    "feeGmxTracker.setInPrivateStakingMode"
  );

  // const rewardRouter = await deployContract("RewardRouter", []);
  // writeTmpAddresses({
  //   rewardRouter: rewardRouter.address,
  // });

  // await sendTxn(
  //   rewardRouter.initialize(
  //     gmx.address,
  //     esGmx.address,
  //     bnGmx.address,
  //     bnAlp.address,
  //     glp.address,
  //     alp.address,
  //     stakedGmxTracker.address,
  //     bonusGmxTracker.address,
  //     feeGmxTracker.address,
  //     feeGlpTracker.address,
  //     stakedGlpTracker.address,
  //     stakedAlpTracker.address,
  //     bonusAlpTracker.address,
  //     feeAlpTracker.address,
  //     glpManager.address
  //   ),
  //   "rewardRouter.initialize"
  // );

  // allow rewardRouter to stake in stakedGmxTracker
  // await sendTxn(
  //   stakedGmxTracker.setHandler(rewardRouter.address, true),
  //   "stakedGmxTracker.setHandler(rewardRouter)"
  // );
  // allow bonusGmxTracker to stake stakedGmxTracker
  // await sendTxn(
  //   stakedGmxTracker.setHandler(bonusGmxTracker.address, true),
  //   "stakedGmxTracker.setHandler(bonusGmxTracker)"
  // );
  // allow rewardRouter to stake in bonusGmxTracker
  // await sendTxn(
  //   bonusGmxTracker.setHandler(rewardRouter.address, true),
  //   "bonusGmxTracker.setHandler(rewardRouter)"
  // );
  // allow bonusGmxTracker to stake feeGmxTracker
  // await sendTxn(
  //   bonusGmxTracker.setHandler(feeGmxTracker.address, true),
  //   "bonusGmxTracker.setHandler(feeGmxTracker)"
  // );
  await sendTxn(
    bonusGmxDistributor.setBonusMultiplier(10000),
    "bonusGmxDistributor.setBonusMultiplier"
  );
  // allow rewardRouter to stake in feeGmxTracker
  // await sendTxn(
  //   feeGmxTracker.setHandler(rewardRouter.address, true),
  //   "feeGmxTracker.setHandler(rewardRouter)"
  // );
  // allow stakedGmxTracker to stake esGmx
  // await sendTxn(
  //   esGmx.setHandler(stakedGmxTracker.address, true),
  //   "esGmx.setHandler(stakedGmxTracker)"
  // );
  // allow feeGmxTracker to stake bnGmx
  // await sendTxn(
  //   bnGmx.setHandler(feeGmxTracker.address, true),
  //   "bnGmx.setHandler(feeGmxTracker"
  // );
  // allow rewardRouter to burn bnGmx
  // await sendTxn(
  //   bnGmx.setMinter(rewardRouter.address, true),
  //   "bnGmx.setMinter(rewardRouter"
  // );

  // mint esGmx for distributors
  await sendTxn(
    esGmx.setMinter(wallet.address, true),
    "esGmx.setMinter(wallet)"
  );
  await sendTxn(
    esGmx.mint(stakedGmxDistributor.address, expandDecimals(50000 * 12, 18)),
    "esGmx.mint(stakedGmxDistributor"
  ); // ~50,000 GMX per month
  await sendTxn(
    stakedGmxDistributor.setTokensPerInterval("20667989410000000"),
    "stakedGmxDistributor.setTokensPerInterval"
  ); // 0.02066798941 esGmx per second

  // mint bnGmx for distributor
  await sendTxn(bnGmx.setMinter(wallet.address, true), "bnGmx.setMinter");
  await sendTxn(
    bnGmx.mint(
      bonusGmxDistributor.address,
      expandDecimals(15 * 1000 * 1000, 18)
    ),
    "bnGmx.mint(bonusGmxDistributor)"
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
