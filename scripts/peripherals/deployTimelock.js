const { deployContract, contractAt, sendTxn, getFrameSigner } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

async function runForArbitrum() {
  const signer = await getFrameSigner()

  const admin = "0x49B373D422BdA4C6BfCdd5eC1E48A9a26fdA2F8b"
  const rewardManager = { address: ethers.constants.AddressZero }
  const buffer = 24 * 60 * 60
  const tokenManager = { address: "0x4E29d2ee6973E5Bd093df40ef9d0B28BD56C9e4E" }
  const mintReceiver = { address: "0x50F22389C10FcC3bA9B1AB9BCDafE40448a357FB" }
  const maxTokenSupply = expandDecimals("13250000", 18)

  const timelock = await deployContract("Timelock", [
    admin,
    buffer,
    rewardManager.address,
    tokenManager.address,
    mintReceiver.address,
    maxTokenSupply,
    10, // marginFeeBasisPoints 0.1%
    10 // maxMarginFeeBasisPoints 0.1%
  ], "Timelock")

  const positionManager = { address: "0x98a00666CfCb2BA5A405415C2BF6547C63bf5491" }
  const orderExecutor = { address: "0x7257ac5D0a0aaC04AA7bA2AC0A6Eb742E332c3fB" }

  let deployedTimelock = await contractAt("Timelock", timelock.address, signer)

  await sendTxn(deployedTimelock.setContractHandler(positionManager.address, true), "deployedTimelock.setContractHandler(positionManager)")
  await sendTxn(deployedTimelock.setContractHandler(orderExecutor.address, true), "deployedTimelock.setContractHandler(orderExecutor)")
}

async function runForAvax() {
  const admin = "0x49B373D422BdA4C6BfCdd5eC1E48A9a26fdA2F8b"
  const rewardManager = { address: ethers.constants.AddressZero }
  const buffer = 24 * 60 * 60
  const tokenManager = { address: "0x7F98d265Ba2609c1534D12cF6b0976505Ad7F653" }
  const mintReceiver = { address: "0x7F98d265Ba2609c1534D12cF6b0976505Ad7F653" }
  const maxTokenSupply = expandDecimals("13250000", 18)

  const timelock = await deployContract("Timelock", [
    admin,
    buffer,
    rewardManager.address,
    tokenManager.address,
    mintReceiver.address,
    maxTokenSupply,
    10, // marginFeeBasisPoints 0.1%
    10 // maxMarginFeeBasisPoints 0.1%
  ])
}

async function main() {
  if (network === "avax") {
    await runForAvax()
    return
  }

  await runForArbitrum()
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
