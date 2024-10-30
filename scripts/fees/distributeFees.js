const fs = require("fs");

const {
  contractAt,
  sendTxn,
  getFrameSigner,
  sleep,
} = require("../shared/helpers");

const {
  getArbValues: getArbFundAccountValues,
  getAvaxValues: getAvaxFundAccountValues,
} = require("../shared/fundAccountsUtils");

const {
  updateBuybackRewards,
} = require("../staking/updateBuybackRewards");

const {
  getArbValues: getArbReferralValues,
  getAvaxValues: getAvaxReferralValues,
  sendReferralRewards: _sendReferralRewards,
} = require("../referrals/referralRewards");

const { formatAmount, bigNumberify } = require("../../test/shared/utilities");

const DataStore = require("../../artifacts-v2/contracts/data/DataStore.sol/DataStore.json");
const Multicall3 = require("../../artifacts-v2/contracts/mock/Multicall3.sol/Multicall3.json");
const FeeHandler = require("../../artifacts-v2/contracts/fee/FeeHandler.sol/FeeHandler.json");
const MintableToken = require("../../artifacts-v2/contracts/mock/MintableToken.sol/MintableToken.json");

const feePlan = require("../../fee-plan.json");

const write = process.env.WRITE === "true"

const skipBalanceValidations =
  process.env.SKIP_BALANCE_VALIDATIONS === "true";

const {
  ARBITRUM_URL,
  AVAX_URL,
  ARBITRUM_DEPLOY_KEY,
  AVAX_DEPLOY_KEY,
  HANDLER_KEY,
} = require("../../env.json");

const ARBITRUM = "arbitrum";
const AVAX = "avax";
const networks = [ARBITRUM, AVAX];

const SKIP_VALIDATIONS = process.env.SKIP_VALIDATIONS

const FEE_KEEPER_KEY = HANDLER_KEY;

const treasuries = {
  arbitrum: "0x68863dDE14303BcED249cA8ec6AF85d4694dea6A",
  avax: "0x0339740d92fb8BAf73bAB0E9eb9494bc0Df1CaFD",
};

const chainlinkFeeReceivers = {
  arbitrum: "0x9Ec49f512eadD1a1ca4FBBd015CE05F62FC3D1BC",
  avax: "0x521f4eD08dEeDf3300d786417c8495cfaE72A20E",
};

const providers = {
  arbitrum: new ethers.providers.JsonRpcProvider(ARBITRUM_URL),
  avax: new ethers.providers.JsonRpcProvider(AVAX_URL),
};

const feeKeepers = {
  arbitrum: new ethers.Wallet(FEE_KEEPER_KEY).connect(providers.arbitrum),
  avax: new ethers.Wallet(FEE_KEEPER_KEY).connect(providers.avax),
};

const deployers = {
  arbitrum: new ethers.Wallet(ARBITRUM_DEPLOY_KEY).connect(providers.arbitrum),
  avax: new ethers.Wallet(AVAX_DEPLOY_KEY).connect(providers.avax),
};

const nativeTokens = {
  arbitrum: new ethers.Contract(
    require("../core/tokens")["arbitrum"].nativeToken.address,
    MintableToken.abi,
    feeKeepers.arbitrum
  ),

  avax: new ethers.Contract(
    require("../core/tokens")["avax"].nativeToken.address,
    MintableToken.abi,
    feeKeepers.avax
  ),
};

const gmx = {
  arbitrum: new ethers.Contract(
    "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a",
    MintableToken.abi,
    feeKeepers.arbitrum
  ),
  avax: new ethers.Contract(
    "0x62edc0692BD897D2295872a9FFCac5425011c661",
    MintableToken.abi,
    feeKeepers.avax
  ),
}

const dataStores = {
  arbitrum: new ethers.Contract(
    "0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8",
    DataStore.abi,
    feeKeepers.arbitrum
  ),
  avax: new ethers.Contract(
    "0x2F0b22339414ADeD7D5F06f9D604c7fF5b2fe3f6",
    DataStore.abi,
    feeKeepers.avax
  ),
};

const feeHandlers = {
  arbitrum: new ethers.Contract(
    "0x7EB417637a3E6d1C19E6d69158c47610b7a5d9B3",
    FeeHandler.abi,
    feeKeepers.arbitrum
  ),
  avax: new ethers.Contract(
    "0x1A3A103F9F536a0456C9b205152A3ac2b3c54490",
    FeeHandler.abi,
    feeKeepers.avax
  ),
};

async function printFeeHandlerBalances() {
  for (let i = 0; i < networks.length; i++) {
    const network = networks[i];
    const handler = feeKeepers[network];
    const nativeToken = await contractAt(
      "WETH",
      nativeTokens[network].address,
      handler
    );
    const nativeTokenBalance = await nativeToken.balanceOf(handler.address);
    const gmxTokenBalance = await gmx[network].balanceOf(handler.address);

    console.log(`network: ${network}, ${handler.address}`)
    console.log(`nativeTokenBalance: ${formatAmount(nativeTokenBalance, 18, 2)}`);
    console.log(`gmxTokenBalance: ${formatAmount(gmxTokenBalance, 18, 2)}`);
  }
}

async function withdrawFeesFromFeeHandler({ network }) {
  const feeHandler = feeHandlers[network];

  if (write) {
    await sendTxn(
      feeHandler.withdrawFees(gmx.network.address),
      "feeHandler.withdrawFees gmx"
    );
    await sendTxn(
      feeHandler.withdrawFees(nativeTokens[network].address),
      "feeHandler.withdrawFees nativeToken"
    );
  }
}

async function withdrawFees() {
  await withdrawFeesFromFeeHandler({ network: "arbitrum" });
  await withdrawFeesFromFeeHandler({ network: "avax" });
}

async function fundAccountsForNetwork({ network, fundAccountValues }) {
  const handler = feeKeepers[network];
  const { sender, transfers, totalTransferAmount, gasToken } =
    fundAccountValues[network];

  const nativeToken = await contractAt(
    "WETH",
    nativeTokens[network].address,
    handler
  );

  if (write) {
    await sendTxn(
      nativeToken.withdraw(totalTransferAmount),
      `nativeToken.withdraw(${formatAmount(totalTransferAmount, 18, 2)})`
    );
  }

  for (let i = 0; i < transfers.length; i++) {
    const transferItem = transfers[i];

    if (transferItem.amount.eq(0)) {
      continue;
    }

    if (write) {
      await sendTxn(
        handler.sendTransaction({
          to: transferItem.address,
          value: transferItem.amount,
        }),
        `${formatAmount(transferItem.amount, 18, 2)} ${gasToken} to ${
          transferItem.address
        }`
      );
    }
  }
}

async function fundAccounts() {
  const fundAccountValues = {
    arbitrum: await getArbFundAccountValues(),
    avax: await getAvaxFundAccountValues(),
  };

  await fundAccountsForNetwork({ network: ARBITRUM, fundAccountValues });
  await fundAccountsForNetwork({ network: AVAX, fundAccountValues });
}

async function sendReferralRewards() {
  const referralValues = {
    arbitrum: await getArbReferralValues(deployers.arbitrum),
    avax: await getAvaxReferralValues(deployers.avax),
  };

  for (let i = 0; i < networks.length; i++) {
    const network = networks[i];

    await _sendReferralRewards({
      signer: feeKeepers[network],
      referralSender: deployers[network],
      shouldSendTxn: false,
      skipSendNativeToken: false,
      nativeToken: nativeTokens[network],
      nativeTokenPrice: feePlan.nativeTokenPrice[network],
      gmxPrice: feePlan.gmxPrice,
      values: referralValues[network],
      network,
    });
  }

  for (let i = 0; i < networks.length; i++) {
    const network = networks[i];

    await _sendReferralRewards({
      signer: feeKeepers[network],
      referralSender: deployers[network],
      shouldSendTxn: write,
      skipSendNativeToken: false,
      nativeToken: nativeTokens[network],
      nativeTokenPrice: feePlan.nativeTokenPrice[network],
      gmxPrice: feePlan.gmxPrice,
      values: referralValues[network],
      network,
    });
  }
}

async function updateGmxRewards() {
  const gmxTokenBalance = {
    arbitrum: await gmx.arbitrum.balanceOf(feeKeepers.arbitrum.address),
    avax: await gmx.avax.balanceOf(feeKeepers.avax.address),
  }

  if (!skipBalanceValidations && gmxTokenBalance.arbitrum.lt(feePlan.gmxRewards.arbitrum)) {
    throw new Error(`Insufficient gmxTokenBalance.arbitrum: ${gmxTokenBalance.arbitrum.toString()}, ${feePlan.gmxRewards.arbitrum}`)
  }

  if (!skipBalanceValidations && gmxTokenBalance.avax.lt(feePlan.gmxRewards.avax)) {
    throw new Error(`Insufficient gmxTokenBalance.avax: ${gmxTokenBalance.avax.toString()}, ${feePlan.gmxRewards.avax}`)
  }

  const rewardArrList = {
    arbitrum: [
      {
        // ExtendedGmxTracker
        rewardTracker: await contractAt("RewardTracker", "0x0755D33e45eD2B874c9ebF5B279023c8Bd1e5E93", feeKeepers.arbitrum),
        rewardToken: gmx.arbitrum,
        transferAmount: feePlan.gmxRewards.arbitrum
      },
      {
        // FeeGmxTracker
        rewardTracker: await contractAt("RewardTracker", "0xd2D1162512F927a7e282Ef43a362659E4F2a728F", feeKeepers.arbitrum),
        rewardToken: nativeTokens.arbitrum,
        transferAmount: "0"
      },
    ],
    avax: [
      {
        // ExtendedGmxTracker
        rewardTracker: await contractAt("RewardTracker", "0xB0D12Bf95CC1341d6C845C978daaf36F70b5910d", feeKeepers.avax),
        rewardToken: gmx.avax,
        transferAmount: feePlan.gmxRewards.avalanche
      },
      {
        // FeeGmxTracker
        rewardTracker: await contractAt("RewardTracker", "0x4d268a7d4C16ceB5a606c173Bd974984343fea13", feeKeepers.avax),
        rewardToken: nativeTokens.avax,
        transferAmount: "0"
      },
    ]
  }

  for (let i = 0; i < networks.length; i++) {
    const network = networks[i];
    const rewardArr = rewardArrList

    await updateBuybackRewards({
      rewardArr: rewardArrList[network],
      intervalUpdater: deployers[network]
    })
  }
}

async function updateGlpRewards() {
  const nativeTokenBalance = {
    arbitrum: await gmx.arbitrum.balanceOf(feeKeepers.arbitrum.address),
    avax: await gmx.avax.balanceOf(feeKeepers.avax.address),
  }

  if (!skipBalanceValidations && nativeTokenBalance.arbitrum.lt(feePlan.glpRewards.arbitrum)) {
    throw new Error(`Insufficient nativeTokenBalance.arbitrum: ${nativeTokenBalance.arbitrum.toString()}, ${feePlan.glpRewards.arbitrum}`)
  }

  if (!skipBalanceValidations && nativeTokenBalance.avax.lt(feePlan.glpRewards.avalanche)) {
    throw new Error(`Insufficient nativeTokenBalance.avax: ${nativeTokenBalance.avax.toString()}, ${feePlan.glpRewards.avax}`)
  }

  const rewardArrList = {
    arbitrum: [
      {
        // FeeGlpTracker
        rewardTracker: await contractAt("RewardTracker", "0x4e971a87900b931fF39d1Aad67697F49835400b6", feeKeepers.arbitrum),
        rewardToken: nativeTokens.arbitrum,
        transferAmount: feePlan.glpRewards.arbitrum
      },
    ],
    avax: [
      {
        // FeeGlpTracker
        rewardTracker: await contractAt("RewardTracker", "0xd2D1162512F927a7e282Ef43a362659E4F2a728F", feeKeepers.avax),
        rewardToken: nativeTokens.avax,
        transferAmount: feePlan.glpRewards.avalanche
      },
    ]
  }

  for (let i = 0; i < networks.length; i++) {
    const network = networks[i];
    const rewardArr = rewardArrList

    await updateBuybackRewards({
      rewardArr: rewardArrList[network],
      intervalUpdater: deployers[network]
    })
  }
}

async function sendPayments() {
  const rewardAmounts = {
    arbitrum: {
      treasury: bigNumberify(feePlan.treasuryFees.arbitrum),
      chainlink: bigNumberify(feePlan.chainlinkFees.arbitrum)
    },
    avax: {
      treasury: bigNumberify(feePlan.treasuryFees.avalanche),
      chainlink: bigNumberify(feePlan.chainlinkFees.avalanche)
    }
  }

  for (let i = 0; i < networks.length; i++) {
    const network = networks[i]

    const handler = feeKeepers[network]

    const nativeToken = await contractAt("WETH", nativeTokens[network].address, handler)
    const chainlinkFeeReceiver = chainlinkFeeReceivers[network]

    if (write) {
      await sendTxn(nativeToken.transfer(treasuries[network], rewardAmounts[network].treasury), `nativeToken.transfer ${i}: ${rewardAmounts[network].treasury.toString()}`)
      await sendTxn(nativeToken.transfer(chainlinkFeeReceiver, rewardAmounts[network].chainlink), `nativeToken.transfer ${i}: ${rewardAmounts[network].chainlink.toString()}`)
    }
  }
}

async function distributeFees({ steps }) {
  const stepsToRun = steps.split(",");
  console.log("stepsToRun", stepsToRun);

  if (SKIP_VALIDATIONS !== "true" && feePlan.refTimestamp > Date.now()) {
    throw new Error(
      `refTimestamp is later than current time ${feePlan.refTimestamp}`
    );
  }

  const allowedDelay = 6 * 60 * 60 * 1000;
  if (feePlan.refTimestamp < Date.now() - allowedDelay) {
    throw new Error(`refTimestamp is older than the allowed delay`);
  }

  const routers = {
    arbitrum: await contractAt(
      "Router",
      "0xaBBc5F99639c9B6bCb58544ddf04EFA6802F4064",
      feeKeepers.arbitrum
    ),
    avax: await contractAt(
      "Router",
      "0x5F719c2F1095F7B9fc68a68e35B51194f4b6abe8",
      feeKeepers.avax
    ),
  };


  if (steps.includes(1)) {
    await withdrawFees();
    await printFeeHandlerBalances();
  }

  // TODO: handle case where tokens need to be bridged from Arbitrum to Avalanche

  if (steps.includes(2)) {
    await fundAccounts();
    await printFeeHandlerBalances();
  }

  if (steps.includes(3)) {
    await updateGmxRewards();
    await printFeeHandlerBalances();
  }

  if (steps.includes(4)) {
    await sendPayments()
    await printFeeHandlerBalances();
  }

  if (steps.includes(5)) {
    await updateGlpRewards()
    await printFeeHandlerBalances();
  }

  if (steps.includes(6)) {
    await sendReferralRewards();
    await printFeeHandlerBalances();
  }
}

module.exports = { distributeFees };
