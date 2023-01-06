const { getFrameSigner, deployContract, contractAt, sendTxn, writeTmpAddresses } = require("../shared/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

async function main() {
  const openStaking = await deployContract("OpenStaking", [
    "0x28ad774c41c229d48a441b280cbf7b5c5f1fed2b",
  ])
  // const openToken = await contractAt("ERC20","0x28ad774c41c229d48a441b280cbf7b5c5f1fed2b")
  // await openToken.approve(openStaking.address, "1000000000000000000000000")
  // await openStaking.submit("0x7C3C9d9E9251112f3c0E54DAe07921A0c699A3E7", "1000000000000000000000")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
