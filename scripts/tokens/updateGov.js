const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function main() {
  const frame = new ethers.providers.JsonRpcProvider("http://127.0.0.1:1248")
  const signer = frame.getSigner()

  // 0x4a3930b629f899fe19c1f280c73a376382d61a78, glpManager gov
  // 0x4a3930b629f899fe19c1f280c73a376382d61a78, stakedGmxTracker gov
  // 0x4a3930b629f899fe19c1f280c73a376382d61a78, bonusGmxTracker gov
  // 0x4a3930b629f899fe19c1f280c73a376382d61a78, feeGmxTracker gov
  // 0x4a3930b629f899fe19c1f280c73a376382d61a78, feeGlpTracker gov
  // 0x4a3930b629f899fe19c1f280c73a376382d61a78, stakedGlpTracker gov
  // 0x4a3930b629f899fe19c1f280c73a376382d61a78, stakedGmxDistributor gov
  // 0x4a3930b629f899fe19c1f280c73a376382d61a78, stakedGlpDistributor gov
  // 0x4a3930b629f899fe19c1f280c73a376382d61a78, stakedGlpDistributor gov
  // 0x09214c0a3594fbcad59a58099b0a63e2b29b15b8, esGmx gov
  // 0x4a3930b629f899fe19c1f280c73a376382d61a78, bnGmx gov

  const addresses = [
    "0x321F653eED006AD1C29D174e17d96351BDe22649", // glpManager
    "0x908C4D94D34924765f1eDc22A1DD098397c59dD4", // stakedGmxTracker
    "0x4d268a7d4C16ceB5a606c173Bd974984343fea13", // bonusGmxTracker
    "0xd2D1162512F927a7e282Ef43a362659E4F2a728F", // feeGmxTracker
    "0x4e971a87900b931fF39d1Aad67697F49835400b6", // feeGlpTracker
    "0x1aDDD80E6039594eE970E5872D247bf0414C8903", // stakedGlpTracker
    "0x23208B91A98c7C1CD9FE63085BFf68311494F193", // stakedGmxDistributor
    "0x60519b48ec4183a61ca2B8e37869E675FD203b34", // stakedGlpDistributor
    "0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA", // esGmx
    "0x35247165119B69A40edD5304969560D0ef486921" // bnGmx
  ]

  // const prevGov = await contractAt("Timelock", "0x4a3930b629f899fe19c1f280c73a376382d61a78")
  // const nextGov = { address: "0x181e9495444cc7AdCE9fBdeaE4c66D7c4eFEeaf5" }

  const prevGov = await contractAt("Timelock", "0x181e9495444cc7AdCE9fBdeaE4c66D7c4eFEeaf5", signer)
  const nextGov = { address: "0x3F3E77421E30271568eF7A0ab5c5F2667675341e" }
  for (let i = 0; i < addresses.length; i++) {
    const address = addresses[i]
    await sendTxn(prevGov.signalSetGov(address, nextGov.address), `${i}: signalSetGov`)
    // await sendTxn(prevGov.setGov(address, nextGov.address), `${i}: setGov`)
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
