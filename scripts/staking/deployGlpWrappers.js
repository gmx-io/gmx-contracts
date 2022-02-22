const { deployContract, contractAt, writeTmpAddresses } = require("../shared/helpers")

async function main() {
  const glp = { address: "0x01234181085565ed162a948b6a5e88758CD7c7b8" }
  const glpManager = { address: "0xe1ae4d4b06A5Fe1fc288f6B4CD72f9F8323B107F" }
  const stakedGlpTracker = { address: "0x9e295B5B976a184B14aD8cd72413aD846C299660" }
  const feeGlpTracker = { address: "0xd2D1162512F927a7e282Ef43a362659E4F2a728F" }

  await deployContract("StakedGlp", [
    glp.address,
    glpManager.address,
    stakedGlpTracker.address,
    feeGlpTracker.address
  ])

  await deployContract("GlpBalance", [glpManager.address, stakedGlpTracker.address])
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
