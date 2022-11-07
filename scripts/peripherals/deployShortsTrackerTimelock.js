const {
  deployContract,
  contractAt,
  sendTxn,
  getFrameSigner
} = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units");
const { getArgumentForSignature } = require("typechain");

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

async function getLocalhostValues() {
  return {
    shortsTrackerAddress: "0x9234252975484D75Fd05f3e4f7BdbEc61956D73a",
    config: {
      tokens: {
        AVAX: {
          address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
          maxAveragePriceChange: 20
        },
        BTC: {
          address: "0x50b7545627a5162F82A992c33b87aDc75187B218",
          maxAveragePriceChange: 10
        },
        "BTC.b": {
          address: "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB",
          maxAveragePriceChange: 10
        }
      },
      updateDelay: 300,
      handlers: [
        "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" // hardhat test account #1
      ]
    },
    updateGov: true
  }
}

async function getValues() {
  if (network === "localhost") {
    return await getLocalhostValues()
  }
  throw new Error("No values for network " + network)
}

async function main() {
  const signer = await getFrameSigner()

  const admin = "0x49B373D422BdA4C6BfCdd5eC1E48A9a26fdA2F8b"
  const { shortsTrackerAddress, updateGov, config } = await getValues()

  // TODO: increase buffer
  const buffer = 0 // 0 seconds
  let shortsTrackerTimelock = await deployContract("ShortsTrackerTimelock", [admin, buffer, config.updateDelay])
  shortsTrackerTimelock = await contractAt("ShortsTrackerTimelock", shortsTrackerTimelock.address, signer)
  const shortsTracker = await contractAt("ShortsTracker", shortsTrackerAddress)

  if (Object.keys(config.tokens).length) {
    console.log("Setting tokens")
    for (const token of Object.values(config.tokens)) {
      await sendTxn(
        shortsTrackerTimelock.signalSetMaxAveragePriceChange(token.address, token.maxAveragePriceChange),
        `shortsTrackerTimelock.signalSetMaxAveragePriceChange ${token.address} ${token.maxAveragePriceChange}`
      )
      await sendTxn(
        shortsTrackerTimelock.setMaxAveragePriceChange(token.address, token.maxAveragePriceChange),
        `shortsTrackerTimelock.setMaxAveragePriceChange ${token.address} ${token.maxAveragePriceChange}`
      )
    }
  }

  if (config.handlers.length) {
    console.log("Setting handlers")
    for (const handler of config.handlers) {
      await sendTxn(
        shortsTrackerTimelock.setHandler(handler, true),
        `shortsTrackerTimelock.setHandler ${handler}`
      )
    }
  }

  if (updateGov) {
    console.log("Updating ShortsTracker.gov = ShortsTrackerTimelock")
    if (network === "localhost") {
      const gov = await shortsTracker.gov()
      await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [gov]} )
      const signer = await ethers.getSigner(gov)
      await sendTxn(shortsTracker.connect(signer).setGov(shortsTrackerTimelock.address), `shortsTracker.setGov ${shortsTrackerTimelock.address}`)
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
