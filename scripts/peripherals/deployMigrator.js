const { deployContract, contractAt } = require("../shared/helpers")
const { signExternally } = require("../shared/signer")
const { expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

async function getArbValues() {
  return {
    contracts: {
      gmxVester: "0x199070DDfd1CFb69173aa2F7e20906F26B363004",
      glpVester: "0xA75287d2f8b217273E7FCD7E86eF07D33972042E",
      esGmx: "0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA",
      bnGmx: "0x35247165119B69A40edD5304969560D0ef486921",
      stakedGmxTracker: "0x908C4D94D34924765f1eDc22A1DD098397c59dD4",
      bonusGmxTracker: "0x4d268a7d4C16ceB5a606c173Bd974984343fea13",
      feeGmxTracker: "0xd2D1162512F927a7e282Ef43a362659E4F2a728F",
      stakedGlpTracker: "0x1aDDD80E6039594eE970E5872D247bf0414C8903",
      feeGlpTracker: "0x4e971a87900b931fF39d1Aad67697F49835400b6",
      rewardRouter: "0xA906F338CB21815cBc4Bc87ace9e68c87eF8d8F1",
      timelock: await contractAt("Timelock", "0x460e1A727c9CAE785314994D54bde0804582bc6e"),
    }
  }
}

async function getAvaxValues() {
  return {
    contracts: {
      gmxVester: "0x472361d3cA5F49c8E633FB50385BfaD1e018b445",
      glpVester: "0x62331A7Bd1dfB3A7642B7db50B5509E57CA3154A",
      esGmx: "0xFf1489227BbAAC61a9209A08929E4c2a526DdD17",
      bnGmx: "0x8087a341D32D445d9aC8aCc9c14F5781E04A26d2",
      stakedGmxTracker: "0x2bD10f8E93B3669b6d42E74eEedC65dd1B0a1342",
      bonusGmxTracker: "0x908C4D94D34924765f1eDc22A1DD098397c59dD4",
      feeGmxTracker: "0x4d268a7d4C16ceB5a606c173Bd974984343fea13",
      stakedGlpTracker: "0x9e295B5B976a184B14aD8cd72413aD846C299660",
      feeGlpTracker: "0xd2D1162512F927a7e282Ef43a362659E4F2a728F",
      rewardRouter: "0x82147C5A7E850eA4E28155DF107F2590fD4ba327",
      timelock: await contractAt("Timelock", "0xa252b87040E4b97AFb617962e6b7E90cB508A45F"),
    }
  }
}

async function getValues() {
  if (network === "arbitrum") {
    return getArbValues()
  }

  if (network === "avax") {
    return getAvaxValues()
  }
}

async function main() {
  const { contracts } = await getValues()
  const { timelock } = contracts
  const admin = "0x49B373D422BdA4C6BfCdd5eC1E48A9a26fdA2F8b"

  const caller = await deployContract("StabilizeCaller", [])
  const migrator = await deployContract("StabilizeMigrator", [
    admin,
    contracts.stakedGmxTracker,
    contracts.bonusGmxTracker,
    contracts.feeGmxTracker,
    contracts.stakedGlpTracker,
    contracts.feeGlpTracker,
    contracts.gmxVester,
    contracts.glpVester,
    contracts.esGmx,
    contracts.bnGmx,
    contracts.rewardRouter,
    caller.address
  ])

  await caller.initialize(
    migrator.address
  )

  await signExternally(await timelock.populateTransaction.signalSetGovRequester(migrator.address, true));
}

main().catch((ex) => {
  console.error(ex);
  process.exit(1);
});
