const hre = require("hardhat")

const handlers = {
  "0x8704EE9AB8622BbC25410C7D4717ED51f776c7f6": true,
};

function getArbValues() {
  return {
    batchSenderAddress: "0x5384E6cAd96B2877B5B3337A277577053BD1941D"
  }
}

function getAvaxValues() {
  return {
    batchSenderAddress: "0x0BEa5D3081921A08d73f150126f99cda0eb29C0e"
  }
}

function getValues() {
  if (hre.network.name === "arbitrum") {
    return getArbValues();
  } else if (hre.network.name === "avax") {
    return getAvaxValues();
  }

  throw new Error(`Unsupported network ${hre.network.name}`);
}

async function main() {
  const { batchSenderAddress } = getValues();
  const batchSender = await hre.ethers.getContractAt("BatchSender", batchSenderAddress);

  for (const [address, isHandler] of Object.entries(handlers)) {
    const onchainIsHandler = await batchSender.isHandler(address);
    if (isHandler !== onchainIsHandler) {
      console.log("%s handler %s", isHandler ? "adding" : "removing", address);
      const tx = await batchSender.setHandler(address, isHandler);
      console.log("done tx: %s", tx.hash);
    }
  }
  console.log("done")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
