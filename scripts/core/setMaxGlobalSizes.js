const { contractAt, sendTxn } = require("../shared/helpers")
const { bigNumberify, expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

const shouldSendTxn = true;

const {
  ARBITRUM_URL,
  ARBITRUM_CAP_KEEPER_KEY,
  AVAX_URL,
  AVAX_CAP_KEEPER_KEY,
} = require("../../env.json")

async function getArbValues() {
  const provider = new ethers.providers.JsonRpcProvider(ARBITRUM_URL)
  const wallet = new ethers.Wallet(ARBITRUM_CAP_KEEPER_KEY).connect(provider)

  const positionContracts = [
    "0xb87a436B93fFE9D75c5cFA7bAcFff96430b09868", // PositionRouter
    "0x75E42e6f01baf1D6022bEa862A28774a9f8a4A0C" // PositionManager
  ]

  const { btc, eth, link, uni } = tokens
  const tokenArr = [btc, eth, link, uni]

  const vaultAddress = "0x489ee077994B6658eAfA855C308275EAd8097C4A";

  return { wallet, positionContracts, tokenArr, vaultAddress }
}

async function getAvaxValues() {
  const provider = new ethers.providers.JsonRpcProvider(AVAX_URL)
  const wallet = new ethers.Wallet(AVAX_CAP_KEEPER_KEY).connect(provider)

  const positionContracts = [
    "0xffF6D276Bc37c61A23f06410Dce4A400f66420f8", // PositionRouter
    "0xA21B83E579f4315951bA658654c371520BDcB866" // PositionManager
  ]

  const { avax, eth, btc, btcb } = tokens
  const tokenArr = [avax, eth, btc, btcb]

  const vaultAddress = "0x9ab2De34A33fB459b538c43f251eB825645e8595";

  return { wallet, positionContracts, tokenArr, vaultAddress }
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
  const { wallet, positionContracts, tokenArr, vaultAddress } = await getValues()

  const vault = await contractAt("Vault", vaultAddress);
  const positionContractOptions = {
    libraries: {
      PositionUtils: "0x0000000000000000000000000000000000000001"
    }
  }
  const positionContract = await contractAt("PositionManager", positionContracts[0], undefined, positionContractOptions);
  for (const token of tokenArr) {
    const [currentLongCap, currentShortCap, currentLongSize, currentShortSize] = await Promise.all([
      positionContract.maxGlobalLongSizes(token.address),
      positionContract.maxGlobalShortSizes(token.address),
      vault.guaranteedUsd(token.address),
      vault.globalShortSizes(token.address)
    ]);
    console.log("%s longs $%sm / $%sm -> $%sm, shorts $%sm / $%sm -> $%sm",
      token.name.toUpperCase(),
      (currentLongSize.toString() / 1e36).toFixed(2),
      (currentLongCap.toString() / 1e36).toFixed(2),
      (token.maxGlobalLongSize.toString() / 1e6 || 0).toFixed(2),
      (currentShortSize.toString() / 1e36).toFixed(2),
      (currentShortCap.toString() / 1e36).toFixed(2),
      (token.maxGlobalShortSize.toString() / 1e6 || 0).toFixed(2),
    );
  }

  if (!shouldSendTxn) {
    return;
  }

  const tokenAddresses = tokenArr.map(t => t.address)
  const longSizes = tokenArr.map((token) => {
    if (!token.maxGlobalLongSize) {
      return bigNumberify(0)
    }

    return expandDecimals(token.maxGlobalLongSize, 30)
  })

  const shortSizes = tokenArr.map((token) => {
    if (!token.maxGlobalShortSize) {
      return bigNumberify(0)
    }

    return expandDecimals(token.maxGlobalShortSize, 30)
  })

  for (let i = 0; i < positionContracts.length; i++) {
    const positionContract = await contractAt("PositionManager", positionContracts[i], wallet, positionContractOptions)
    await sendTxn(positionContract.setMaxGlobalSizes(tokenAddresses, longSizes, shortSizes), "positionContract.setMaxGlobalSizes")
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
