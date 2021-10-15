const { deployContract, contractAt, writeTmpAddresses } = require("../shared/helpers")

async function main() {
  const glp = { address: "0x4277f8F2c384827B5273592FF7CeBd9f2C1ac258" }
  const glpManager = { address: "0x321F653eED006AD1C29D174e17d96351BDe22649" }
  const stakedGlpTracker = { address: "0x1aDDD80E6039594eE970E5872D247bf0414C8903" }
  const feeGlpTracker = { address: "0x4e971a87900b931fF39d1Aad67697F49835400b6" }

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
