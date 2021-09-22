const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function main() {
  const receiver = { address: "0x9f169c2189A2d975C18965DE985936361b4a9De9" }
  const usdg = await contractAt("YieldToken", "0x85E76cbf4893c1fbcB34dCF1239A91CE2A4CF5a7")
  const xgmt = await contractAt("YieldToken", "0xe304ff0983922787Fd84BC9170CD21bF78B16B10")
  const usdgYieldTracker = await contractAt("YieldTracker", "0x0EF0Cf825B8e9F89A43FfD392664131cFB4cfA89")
  const xgmtYieldTracker = await contractAt("YieldTracker", "0x82A012A9b3003b18B6bCd6052cbbef7Fa4892e80")
  const gmtUsdgPair = { address: "0xa41e57459f09a126F358E118b693789d088eA8A0" }
  const xgmtUsdgPair = { address: "0x0b622208fc0691C2486A3AE6B7C875b4A174b317" }
  const busdgUsdgPair = { address: "0x7Fea0c6022D81EE17146324E4F55f6A02E138Dab" }
  const autoUsdgPair = { address: "0x0523FD5C53ea5419B4DAF656BC1b157dDFE3ce50" }

  const wbnbClaimableForXgmtPair = await xgmtYieldTracker.claimable(xgmtUsdgPair.address)
  console.log(`claimable: ${ethers.utils.formatUnits(wbnbClaimableForXgmtPair, 18)} WBNB`)
  await sendTxn(xgmt.recoverClaim(xgmtUsdgPair.address, receiver.address), "recoverClaim")

  const accounts = [gmtUsdgPair, xgmtUsdgPair, busdgUsdgPair, autoUsdgPair]

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i]
    const claimable = await usdgYieldTracker.claimable(account.address)
    console.log(`claimable ${i}: ${ethers.utils.formatUnits(claimable, 18)} WBNB`)
    await sendTxn(usdg.recoverClaim(account.address, receiver.address), `recoverClaim ${i}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
