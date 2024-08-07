const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { signExternally } = require("../shared/signer")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

async function getValuesForAvax() {
  const timelock = await contractAt("Timelock", "0xa252b87040E4b97AFb617962e6b7E90cB508A45F")
  const rewardRouter = await contractAt("RewardRouterV2", "0xa192D0681E2b9484d1fA48083D36B8A2D0Da1809")
  const vesterCap = await contractAt("VesterCap", "0xdEdbE191b001c96BE6B9C2B3c22910331C869901")
  const bnGmx = await contractAt("MintableBaseToken", "0x8087a341D32D445d9aC8aCc9c14F5781E04A26d2")
  const feeGmxTracker = await contractAt("RewardTracker", "0x4d268a7d4C16ceB5a606c173Bd974984343fea13")
  const esGmx = await contractAt("MintableBaseToken", "0xFf1489227BbAAC61a9209A08929E4c2a526DdD17")
  const gmxVester = await contractAt("Vester", "0x472361d3cA5F49c8E633FB50385BfaD1e018b445")

  return {
    timelock,
    rewardRouter,
    vesterCap,
    bnGmx,
    feeGmxTracker,
    esGmx,
    gmxVester,
  }
}

async function getValuesForArb() {
  const timelock = await contractAt("Timelock", "0x460e1A727c9CAE785314994D54bde0804582bc6e")
  const rewardRouter = await contractAt("RewardRouterV2", "0x159854e14A862Df9E39E1D128b8e5F70B4A3cE9B")
  const vesterCap = await contractAt("VesterCap", "0x57866d65ACbb7Ba3269807Bf7af4019366789b60")
  const bnGmx = await contractAt("MintableBaseToken", "0x35247165119B69A40edD5304969560D0ef486921")
  const feeGmxTracker = await contractAt("RewardTracker", "0xd2D1162512F927a7e282Ef43a362659E4F2a728F")
  const esGmx = await contractAt("MintableBaseToken", "0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA")
  const gmxVester = await contractAt("Vester", "0x199070DDfd1CFb69173aa2F7e20906F26B363004")

  return {
    timelock,
    rewardRouter,
    vesterCap,
    bnGmx,
    feeGmxTracker,
    esGmx,
    gmxVester,
  }
}

async function getValues() {
  if (network === "avax") {
    return await getValuesForAvax()
  }

  if (network === "arbitrum") {
    return await getValuesForArb()
  }
}

async function main() {
  const { timelock, rewardRouter, vesterCap, bnGmx, feeGmxTracker, esGmx, gmxVester } = await getValues()

  const multicallWriteParams = []

  const phase = process.env.PHASE

  if (phase === undefined) {
    throw new Error("PHASE is empty")
  }

  if (phase === "enableVesterCap") {
    multicallWriteParams.push(timelock.interface.encodeFunctionData("setMinter", [esGmx.address, vesterCap.address, true]));
    multicallWriteParams.push(timelock.interface.encodeFunctionData("setHandler", [gmxVester.address, vesterCap.address, true]));
    multicallWriteParams.push(timelock.interface.encodeFunctionData("setHandler", [feeGmxTracker.address, vesterCap.address, true]));
  }

  if (phase === "disableRewardRouter") {
    multicallWriteParams.push(timelock.interface.encodeFunctionData("setMinter", [bnGmx.address, rewardRouter.address, false]));
    multicallWriteParams.push(timelock.interface.encodeFunctionData("setHandler", [feeGmxTracker.address, rewardRouter.address, false]));
  }

  if (phase === "enableRewardRouter") {
    multicallWriteParams.push(timelock.interface.encodeFunctionData("setMinter", [bnGmx.address, rewardRouter.address, true]));
    multicallWriteParams.push(timelock.interface.encodeFunctionData("setHandler", [feeGmxTracker.address, rewardRouter.address, true]));
  }

  await signExternally(await timelock.populateTransaction.multicall(multicallWriteParams));
}

main().catch((ex) => {
  console.error(ex);
  process.exit(1);
});
