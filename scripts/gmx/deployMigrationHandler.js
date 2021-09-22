const { deployContract, contractAt, writeTmpAddresses } = require("../shared/helpers")

async function main() {
  const ammRouterV1 = { address: "0x05fF2B0DB69458A0750badebc4f9e13aDd608C7F" }
  const ammRouterV2 = { address: "0x10ED43C718714eb63d5aA57B78B54704E256024E" }
  const vault = { address: "0xc73A8DcAc88498FD4b4B1b2AaA37b0a2614Ff67B" }
  const gmt = { address: "0x99e92123eB77Bc8f999316f622e5222498438784" }
  const xgmt = { address: "0xe304ff0983922787Fd84BC9170CD21bF78B16B10" }
  const usdg = { address: "0x85E76cbf4893c1fbcB34dCF1239A91CE2A4CF5a7" }
  const busd = { address: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56" }
  const bnb = { address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" }

  const migrationHandler = await deployContract("MigrationHandler", [])

  await migrationHandler.initialize(
    ammRouterV1.address,
    ammRouterV2.address,
    vault.address,
    gmt.address,
    xgmt.address,
    usdg.address,
    bnb.address,
    busd.address
  )
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
