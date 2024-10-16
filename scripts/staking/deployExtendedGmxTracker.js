const { deployContract, contractAt, sendTxn } = require("../shared/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

async function deployForArb() {
  const gmx = await contractAt("GMX", "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a");
  const bnGmx = await contractAt("MintableBaseToken", "0x35247165119B69A40edD5304969560D0ef486921");
  const bonusGmxTracker = await contractAt("RewardTracker", "0x4d268a7d4C16ceB5a606c173Bd974984343fea13");
  const timelock = await contractAt("Timelock", "0x460e1A727c9CAE785314994D54bde0804582bc6e");

  const extendedGmxTracker = await deployContract("RewardTracker", ["Staked + Bonus + Extended GMX", "sbeGMX"])
  const extendedGmxDistributor = await deployContract("RewardDistributor", [gmx.address, extendedGmxTracker.address])

  await sendTxn(extendedGmxTracker.initialize([bnGmx.address, bonusGmxTracker.address], extendedGmxDistributor.address), "extendedGmxTracker.initialize")
  await sendTxn(extendedGmxDistributor.updateLastDistributionTime(), "extendedGmxDistributor.updateLastDistributionTime")

  await sendTxn(extendedGmxTracker.setInPrivateTransferMode(true), "extendedGmxTracker.setInPrivateTransferMode")
  await sendTxn(extendedGmxTracker.setInPrivateStakingMode(true), "extendedGmxTracker.setInPrivateStakingMode")

  await sendTxn(extendedGmxTracker.setGov(timelock.address), "extendedGmxTracker.setGov")
  await sendTxn(extendedGmxDistributor.setGov(timelock.address), "extendedGmxDistributor.setGov")
}

async function deployForAvax() {
  const gmx = await contractAt("GMX", "0x62edc0692BD897D2295872a9FFCac5425011c661");
  const bnGmx = await contractAt("MintableBaseToken", "0x8087a341D32D445d9aC8aCc9c14F5781E04A26d2");
  const bonusGmxTracker = await contractAt("RewardTracker", "0x908C4D94D34924765f1eDc22A1DD098397c59dD4");
  const timelock = await contractAt("Timelock", "0xa252b87040E4b97AFb617962e6b7E90cB508A45F");

  const extendedGmxTracker = await deployContract("RewardTracker", ["Staked + Bonus + Extended GMX", "sbeGMX"])
  const extendedGmxDistributor = await deployContract("RewardDistributor", [gmx.address, extendedGmxTracker.address])

  await sendTxn(extendedGmxTracker.initialize([bnGmx.address, bonusGmxTracker.address], extendedGmxDistributor.address), "extendedGmxTracker.initialize")
  await sendTxn(extendedGmxDistributor.updateLastDistributionTime(), "extendedGmxDistributor.updateLastDistributionTime")

  await sendTxn(extendedGmxTracker.setInPrivateTransferMode(true), "extendedGmxTracker.setInPrivateTransferMode")
  await sendTxn(extendedGmxTracker.setInPrivateStakingMode(true), "extendedGmxTracker.setInPrivateStakingMode")

  await sendTxn(extendedGmxTracker.setGov(timelock.address), "extendedGmxTracker.setGov")
  await sendTxn(extendedGmxDistributor.setGov(timelock.address), "extendedGmxDistributor.setGov") // Not sure if this is correct, I see that stakedGmxDistributor has the old V1 timelock set as gov

}

async function main() {
  if (network === "arbitrum") {
    await deployForArb()
  }

  if (network === "avax") {
    await deployForAvax()
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
