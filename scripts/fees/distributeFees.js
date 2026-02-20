const fs = require("fs");

const {
  contractAt,
  sendTxn,
  sleep,
  sendPushMessage
} = require("../shared/helpers");

const { sendEvm } = require("../shared/bridge")

const {
  getArbValues: getArbFundAccountValues,
  getAvaxValues: getAvaxFundAccountValues,
} = require("../shared/fundAccountsUtils");

const {
  updateBuybackRewards,
} = require("../staking/updateBuybackRewards");

const { formatAmount, bigNumberify } = require("../../test/shared/utilities");

const DataStore = require("../../artifacts-v2/contracts/data/DataStore.sol/DataStore.json");
const Multicall3 = require("../../artifacts-v2/contracts/mock/Multicall3.sol/Multicall3.json");
const FeeHandler = require("../../artifacts-v2/contracts/fee/FeeHandler.sol/FeeHandler.json");
const MintableToken = require("../../artifacts-v2/contracts/mock/MintableToken.sol/MintableToken.json");

let feeSteps = {}

try {
  feeSteps = require("../../fee-steps.json");
} catch (err) {
  console.warn(err)
}

console.log("feeSteps", feeSteps)

let feePlan

let write = process.env.WRITE === "true"

const skipBalanceValidations =
  process.env.SKIP_BALANCE_VALIDATIONS === "true";

const {
  ARBITRUM_URL,
  AVAX_URL,
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

function saveFeeStep(step) {
  feeSteps[step] = Date.now()
  fs.writeFileSync(`./fee-steps.json`, JSON.stringify(feeSteps, null, 4))
}

function hasSavedFeeStep(step) {
  console.log(`checking fee step: ${step}, ${feeSteps[step]}`)

  if (!feeSteps[step]) {
    return false
  }

  // 259200 => 3 days
  return Date.now() - feeSteps[step] < 259200 * 1000
}

function shouldRunFeeStep(steps, step) {
  if (!steps.includes(step)) {
    console.log(`${steps} does not include: ${step}`)
    return false
  }

  if (hasSavedFeeStep(step)) {
    console.log(`skipping`, step)
    return false
  }

  return true
}

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
      feeHandler.withdrawFees(gmx[network].address),
      "feeHandler.withdrawFees gmx"
    );
    await sendTxn(
      feeHandler.withdrawFees(nativeTokens[network].address),
      "feeHandler.withdrawFees nativeToken"
    );
  }
}

async function bridgeTokens() {
  if (bigNumberify(feePlan.amountToBridgeFromArbritrum).gt(0)) {
    const amount = bigNumberify(feePlan.amountToBridgeFromArbritrum).toString()
    await sendEvm({
      rpcUrl: ARBITRUM_URL,
      key: HANDLER_KEY,
      srcWrapperAddress: "0x02984c3BB35F0e61cFC690f221A5EBCc5389f86b",
      srcEid: "30110",
      dstEid: "30106",
      amount: amount,
      to: feeKeepers.avax.address,
      minAmount: amount
    })
  }

  if (bigNumberify(feePlan.amountToBridgeFromAvalanche).gt(0)) {
    const amount = bigNumberify(feePlan.amountToBridgeFromAvalanche)

    await sendEvm({
      rpcUrl: AVAX_URL,
      key: HANDLER_KEY,
      srcWrapperAddress: "0x02984c3BB35F0e61cFC690f221A5EBCc5389f86b",
      srcEid: "30106",
      dstEid: "30110",
      amount: amount,
      to: feeKeepers.arbitrum.address,
      minAmount: amount
    })
  }
}

async function withdrawFees() {
  await withdrawFeesFromFeeHandler({ network: "arbitrum" });
  await withdrawFeesFromFeeHandler({ network: "avax" });
}

async function fundAccountsForNetwork({ network, fundAccountValues }) {
  const handler = feeKeepers[network];
  const { transfers, totalTransferAmount, gasToken } =
    fundAccountValues[network];

  const nativeToken = await contractAt(
    "WETH",
    nativeTokens[network].address,
    handler
  );

  const nativeTokenLabel = network === "avax" ? "AVAX" : "ETH"

  for (let i = 0; i < transfers.length; i++) {
    const transferItem = transfers[i];

    if (transferItem.amount.lt("10000000000000000")) {
      continue;
    }

    const nativeTokenBalance = await nativeToken.balanceOf(handler.address)

    if (nativeTokenBalance.lt(transferItem.amount)) {
      await sendPushMessage(`Insufficient ${nativeTokenLabel}, skipping top up of ${formatAmount(transferItem.amount, 18, 2)} ${nativeTokenLabel} for ${transferItem.address}`)
    }

    if (write) {
      await sendTxn(
        nativeToken.withdraw(transferItem.amount, { gasLimit: 500_000 }),
        `nativeToken.withdraw(${formatAmount(transferItem.amount, 18, 2)})`
      );

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

async function updateGmxRewards() {
  const gmxTokenBalance = {
    arbitrum: await gmx.arbitrum.balanceOf(feeKeepers.arbitrum.address),
    avax: await gmx.avax.balanceOf(feeKeepers.avax.address),
  }

  if (bigNumberify(feePlan.amountToBridgeFromAvalanche).gt(0)) {
    while (true) {
      if (gmxTokenBalance.arbitrum.gte(feePlan.gmxRewards.arbitrum)) {
        break
      }
      console.log(`continue polling arbitrum gmx balance: ${gmxTokenBalance.arbitrum.toString()} < ${feePlan.gmxRewards.arbitrum}`)

      await sleep(10_000)

      gmxTokenBalance.arbitrum = await gmx.arbitrum.balanceOf(feeKeepers.arbitrum.address)
    }
  }

  if (bigNumberify(feePlan.amountToBridgeFromArbritrum).gt(0)) {
    while (true) {
      if (gmxTokenBalance.avax.gte(feePlan.gmxRewards.avax)) {
        break
      }
      console.log(`continue polling avax gmx balance: ${gmxTokenBalance.avax.toString()} < ${feePlan.gmxRewards.avax}`)

      await sleep(10_000)

      gmxTokenBalance.avax = await gmx.avax.balanceOf(feeKeepers.avax.address)
    }
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
        transferAmount: bigNumberify(0) // feePlan.gmxRewards.arbitrum
      },
      // {
      //   // FeeGmxTracker
      //   rewardTracker: await contractAt("RewardTracker", "0xd2D1162512F927a7e282Ef43a362659E4F2a728F", feeKeepers.arbitrum),
      //   rewardToken: nativeTokens.arbitrum,
      //   transferAmount: "0"
      // },
    ],
    avax: [
      {
        // ExtendedGmxTracker
        rewardTracker: await contractAt("RewardTracker", "0xB0D12Bf95CC1341d6C845C978daaf36F70b5910d", feeKeepers.avax),
        rewardToken: gmx.avax,
        transferAmount: bigNumberify(0) // feePlan.gmxRewards.avax
      },
      // {
      //   // FeeGmxTracker
      //   rewardTracker: await contractAt("RewardTracker", "0x4d268a7d4C16ceB5a606c173Bd974984343fea13", feeKeepers.avax),
      //   rewardToken: nativeTokens.avax,
      //   transferAmount: "0"
      // },
    ]
  }

  for (let i = 0; i < networks.length; i++) {
    const network = networks[i];
    const stepKey = `updateGmxRewards-${network}`

    if (hasSavedFeeStep(stepKey)) {
      continue
    }

    const rewardArr = rewardArrList

    await updateBuybackRewards({
      rewardArr: rewardArrList[network],
      intervalUpdater: feeKeepers[network],
      write
    })

    saveFeeStep(stepKey)
  }
}

async function sendPayments() {
  const rewardAmounts = {
    arbitrum: {
      treasury: bigNumberify(feePlan.treasuryFees.arbitrum),
      chainlink: bigNumberify(feePlan.chainlinkFees.arbitrum)
    },
    avax: {
      treasury: bigNumberify(feePlan.treasuryFees.avax),
      chainlink: bigNumberify(feePlan.chainlinkFees.avax)
    }
  }

  for (let i = 0; i < networks.length; i++) {
    const network = networks[i]

    const stepKey = `sendPayments-${network}`
    console.log(`running step: ${stepKey}`)

    const handler = feeKeepers[network]

    const nativeToken = await contractAt(
      "WETH",
      nativeTokens[network].address,
      handler
    );

    if (hasSavedFeeStep(stepKey)) {
      continue
    }

    const nativeTokenBalance = await nativeToken.balanceOf(handler.address);
    if (nativeTokenBalance.lt(rewardAmounts[network].treasury.add(rewardAmounts[network].chainlink))) {
      throw new Error(`Insufficient native token balance: ${nativeTokenBalance.toString()}, ${rewardAmounts[network].treasury.toString()}, ${rewardAmounts[network].chainlink.toString()}`)
    }

    const chainlinkFeeReceiver = chainlinkFeeReceivers[network]

    if (write) {
      await sendTxn(nativeToken.transfer(treasuries[network], rewardAmounts[network].treasury, { gasLimit: 500_000 }), `nativeToken.transfer ${i}: ${rewardAmounts[network].treasury.toString()}`)
      await sendTxn(nativeToken.transfer(chainlinkFeeReceiver, rewardAmounts[network].chainlink, { gasLimit: 500_000 }), `nativeToken.transfer ${i}: ${rewardAmounts[network].chainlink.toString()}`)
    }

    saveFeeStep(stepKey)
  }
}

async function distributeFees({ write: _write, steps }) {
  if (_write !== undefined) {
    write = _write
  }

  // reload json file
  delete require.cache[require.resolve("../../fee-plan.json")];
  feePlan = require("../../fee-plan.json");

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


  if (shouldRunFeeStep(steps, 1)) {
    // await withdrawFees();
    // await printFeeHandlerBalances();
    // saveFeeStep(1)
    // await sendPushMessage("Step 1: Fees withdrawn")
  }

  if (shouldRunFeeStep(steps, 2)) {
    // await bridgeTokens()
    // saveFeeStep(2)
    // await sendPushMessage("Step 2: Tokens bridged")
  }

  if (shouldRunFeeStep(steps, 3)) {
    await updateGmxRewards();
    await printFeeHandlerBalances();
    saveFeeStep(3)
    await sendPushMessage("Fee Distribution: GMX rewards updated")
  }

  if (shouldRunFeeStep(steps, 4)) {
    // await sendPayments()
    // await printFeeHandlerBalances();
    // saveFeeStep(4)
    // await sendPushMessage("Step 4: Payments sent")
  }

  if (shouldRunFeeStep(steps, 5)) {
    // await fundAccounts();
    // await printFeeHandlerBalances();
    // saveFeeStep(5)
    // await sendPushMessage("Step 5: Accounts funded")
  }

  await sendPushMessage("Fee distribution completed")
}

module.exports = { distributeFees };
