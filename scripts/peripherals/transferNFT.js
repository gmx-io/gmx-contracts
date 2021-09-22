const { deployContract, contractAt, writeTmpAddresses, sendTxn } = require("../shared/helpers")

async function main() {
  // const wallet = { address: "0xaD8987f5a71D22BD14F1c842D1f431eeDa83Fc4B" }
  const wallet = { address: "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8" }
  const nft = await contractAt("ERC721", "0xC36442b4a4522E871399CD717aBDD847Ab11FE88")
  const nftId = 2742
  const tokenManager = await contractAt("TokenManager", "0x50F22389C10FcC3bA9B1AB9BCDafE40448a357FB")
  await sendTxn(nft.transferFrom(wallet.address, tokenManager.address, nftId), "nft.transferFrom")
  // await sendTxn(nft.transferFrom(tokenManager.address, wallet.address, nftId), "nft.transferFrom")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
