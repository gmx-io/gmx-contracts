const { contractAt, sendTxn } = require("../shared/helpers");
const { expandDecimals } = require("../../test/shared/utilities");
const { toUsd } = require("../../test/shared/units");

const {
  ARBITRUM_URL,
  ARBITRUM_DEPLOY_KEY,
  AVAX_URL,
  AVAX_DEPLOY_KEY,
} = require("../../env.json");

async function getArbValues() {
  const provider = new ethers.providers.JsonRpcProvider(ARBITRUM_URL);
  const wallet = new ethers.Wallet(ARBITRUM_DEPLOY_KEY).connect(provider);
  const referralStorage = await contractAt(
    "ReferralStorage",
    "0xe6fab3F0c7199b0d34d7FbE83394fc0e0D06e99d",
    wallet
  );

  return { referralStorage, wallet };
}

async function getAvaxValues() {
  const provider = new ethers.providers.JsonRpcProvider(AVAX_URL);
  const wallet = new ethers.Wallet(AVAX_DEPLOY_KEY).connect(provider);
  const referralStorage = await contractAt(
    "ReferralStorage",
    "0x827ED045002eCdAbEb6e2b0d1604cf5fC3d322F8",
    wallet
  );

  return { referralStorage, wallet };
}

async function getNetworkValues() {
  return [await getArbValues(), await getAvaxValues()];
}

async function updateAccount(account) {
  const networkValues = await getNetworkValues();
  for (let i = 0; i < networkValues.length; i++) {
    const { referralStorage, wallet } = networkValues[i];
    const timelock = await contractAt(
      "Timelock",
      await referralStorage.gov(),
      wallet
    );
    const tier = 2; // tier 1, 2, 3

    console.log("account", account);

    const currentTier = (await referralStorage.referrerTiers(account)).add(1);
    console.log("currentTier", currentTier.toString());

    if (!currentTier.eq(1)) {
      throw new Error("Current tier is more than 1");
    }

    console.log("updating to tier", tier);
    await sendTxn(
      timelock.setReferrerTier(referralStorage.address, account, tier - 1),
      "timelock.setReferrerTier"
    );
  }
}

async function main() {
  const accounts = ["0x059f6A94980421C8687D5fC03CCB62aCbb242B58"];

  for (let i = 0; i < accounts.length; i++) {
    await updateAccount(accounts[i]);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
