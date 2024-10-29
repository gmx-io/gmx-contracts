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
  getArbValues: getArbRewardValues,
  getAvaxValues: getAvaxRewardValues,
  updateRewards: updateStakingRewards,
} = require("../staking/rewards");
const {
  getArbValues: getArbReferralValues,
  getAvaxValues: getAvaxReferralValues,
  sendReferralRewards: _sendReferralRewards,
} = require("../referrals/referralRewards");
const { formatAmount, bigNumberify } = require("../../test/shared/utilities");
const { bridgeTokens } = require("./bridge");
const { tokenArrRef } = require("../peripherals/feeCalculations");

const ReaderV2 = require("../../artifacts-v2/contracts/reader/Reader.sol/Reader.json");
const DataStore = require("../../artifacts-v2/contracts/data/DataStore.sol/DataStore.json");
const Multicall3 = require("../../artifacts-v2/contracts/mock/Multicall3.sol/Multicall3.json");
const FeeHandler = require("../../artifacts-v2/contracts/fee/FeeHandler.sol/FeeHandler.json");

const feePlan = require("fee-plan.json");

const shouldSendTxn = process.env.WRITE === "true";
const shouldSkipBalanceValidations =
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

const { DEPLOYER_KEY_FILE } = process.env;

const gmx = {
  arbitrum: await contractAt("GMX", "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a"),
  avax: await contractAt("GMX", "0x62edc0692BD897D2295872a9FFCac5425011c661"),
}

const getFeeKeeperKey = () => {
  const filepath = "./keys/fee-keeper.json";
  const data = JSON.parse(fs.readFileSync(filepath));
  if (!data || !data.mnemonic) {
    throw new Error("Invalid key file");
  }
  const wallet = ethers.Wallet.fromMnemonic(data.mnemonic);
  return wallet.privateKey;
};

const FEE_KEEPER_KEY = getFeeKeeperKey();

const FEE_ACCOUNT = "0x49B373D422BdA4C6BfCdd5eC1E48A9a26fdA2F8b";
const FEE_HELPER = "0x43CE1d475e06c65DD879f4ec644B8e0E10ff2b6D";

const FEE_KEEPER = "0xA70C24C3a6Ac500D7e6B1280c6549F2428367d0B";

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
  arbitrum: require("./tokens")["arbitrum"].nativeToken,
  avax: require("./tokens")["avax"].nativeToken,
};

const tokensRef = {
  arbitrum: require("./tokens")["arbitrum"],
  avax: require("./tokens")["avax"],
};

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

const readersV2 = {
  arbitrum: new ethers.Contract(
    "0x38d91ED96283d62182Fc6d990C24097A918a4d9b",
    ReaderV2.abi,
    feeKeepers.arbitrum
  ),
  avax: new ethers.Contract(
    "0x1D5d64d691FBcD8C80A2FD6A9382dF0fe544cBd8",
    ReaderV2.abi,
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
    const balance = await nativeToken.balanceOf(handler.address);
    console.log(`nativeToken balance: ${formatAmount(balance, 18, 2)}`);
  }
}

async function withdrawFeesFromFeeHandler({ network }) {
  const feeHandler = feefeeKeepers[network];

  await sendTxn(
    feeHandler.withdrawFees(gmx.network.address),
    "feeHandler.withdrawFees gmx"
  );
  await sendTxn(
    feeHandler.withdrawFees(nativeTokens[network].address),
    "feeHandler.withdrawFees nativeToken"
  );
}

async function withdrawFees() {
  await withdrawFeesFromFeeHandler({ network: "arbitrum" });
  await withdrawFeesFromFeeHandler({ network: "avax" });
}

async function fundHandlerForNetwork({ network }) {
  const tokenArr = tokenArrRef[network];
  const feeKeeper = feeKeepers[network];
  const handler = feeKeepers[network];

  for (let i = 0; i < tokenArr.length; i++) {
    const token = await contractAt("Token", tokenArr[i].address, feeKeeper);
    const balance = await token.balanceOf(FEE_ACCOUNT);
    if (balance.eq(0)) {
      continue;
    }

    const approvedAmount = await token.allowance(
      FEE_ACCOUNT,
      feeKeeper.address
    );

    if (approvedAmount.lt(balance)) {
      const signer = await getFrameSigner({ network });
      const tokenForSigner = await contractAt("Token", token.address, signer);
      await sendTxn(
        tokenForSigner.approve(handler.address, balance),
        `approve: ${tokenArr[i].name}, ${balance.toString()}`
      );
    }
  }

  for (let i = 0; i < tokenArr.length; i++) {
    const token = await contractAt("Token", tokenArr[i].address, feeKeeper);
    const balance = await token.balanceOf(FEE_ACCOUNT);
    if (balance.eq(0)) {
      continue;
    }

    await sendTxn(
      token.transferFrom(FEE_ACCOUNT, handler.address, balance),
      `fund handler: ${tokenArr[i].name}, ${balance.toString()}`
    );
  }
}

async function fundHandler() {
  await fundHandlerForNetwork({ network: ARBITRUM });
  await fundHandlerForNetwork({ network: AVAX });
}

async function bridgeTokensToAvax() {
  const bridgeAmount = await gmx.arbitrum.balanceOf(feeKeepers.arbitrum.address);

  if (bridgeAmount.eq(0)) {
    console.info("no tokens to bridge");
    return;
  }

  console.log(
    `sending ${ethers.utils.formatUnits(bridgeAmount, 18)} to be bridged`
  );
  
  await sendTxn(gmx.arbitrum.transfer(FEE_HELPER, bridgeAmount), `sending ${ethers.utils.formatUnits(bridgeAmount, 18)} to be bridged`)

  // send tokens to avax
  await bridgeTokens({ signer: feeKeepers.arbitrum, inputAmount: bridgeAmount })
}

async function bridgeTokensToArbitrum() {
  const bridgeAmount = await gmx.avax.balanceOf(feeKeepers.avax.address);

  if (bridgeAmount.eq(0)) {
    console.info("no tokens to bridge");
    return;
  }

  console.log(
    `sending ${ethers.utils.formatUnits(bridgeAmount, 18)} to be bridged`
  );

  await sendTxn(gmx.avax.transfer(FEE_HELPER, bridgeAmount), `sending ${ethers.utils.formatUnits(bridgeAmount, 18)} to be bridged`)

  // send tokens to arbitrum
  await bridgeTokens({ signer: feeKeepers.avax, inputAmount: bridgeAmount })
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
  await sendTxn(
    nativeToken.withdraw(totalTransferAmount),
    `nativeToken.withdraw(${formatAmount(totalTransferAmount, 18, 2)})`
  );

  for (let i = 0; i < transfers.length; i++) {
    const transferItem = transfers[i];

    if (transferItem.amount.eq(0)) {
      continue;
    }

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
      shouldSendTxn: true,
      skipSendNativeToken: false,
      nativeToken: nativeTokens[network],
      nativeTokenPrice: feePlan.nativeTokenPrice[network],
      gmxPrice: feePlan.gmxPrice,
      values: referralValues[network],
      network,
    });
  }
}

async function distributeFees({ steps }) {
  const stepsToRun = steps.split(",");
  console.log("stepsToRun", stepsToRun);

  if (feePlan.refTimestamp > Date.now()) {
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

  // TODO: handle case where tokens need to be bridged from Arbitrum to Avalanche

  if (steps.includes(1)) {
    await withdrawFees();
    await printFeeHandlerBalances();
  }

  if (steps.includes(2)) {
    if (feePlan.deltaRewardArb > 0) {
      await bridgeTokensToAvax();
    } 
    else {
      await bridgeTokensToArbitrum();
    }
  }

  if (steps.includes(3)) {
    // send tokens to extendedGmxDistributors and update tokensPerInterval
    // update tokensPerInterval for FeeGmxDistributor to 0
  }

  if (steps.includes(4)) {
    await fundAccounts();
    await printFeeHandlerBalances();
  }

  if (steps.includes(5)) {
    // send WETH/WAVAX to treasury and chainlink
  }

  if (steps.includes(6)) {
    // send WETH/AVAX to FeeGlpDistributors and update tokensPerInterval for distributor
  }

  if (steps.includes(7)) {
    await sendReferralRewards();
    await printFeeHandlerBalances();
  }
}

module.exports = { distributeFees };
