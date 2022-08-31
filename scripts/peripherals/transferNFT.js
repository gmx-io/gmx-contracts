const { getFrameSigner, deployContract, contractAt, writeTmpAddresses, sendTxn } = require("../shared/helpers")

async function main() {
  const signer = await getFrameSigner()
  // const wallet = { address: "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8" }
  const wallet = { address: "0x49B373D422BdA4C6BfCdd5eC1E48A9a26fdA2F8b" }
  const nft = await contractAt("ERC721", "0xC36442b4a4522E871399CD717aBDD847Ab11FE88", signer)
  const nftId = 34143
  const tokenManager = await contractAt("TokenManager", "0x4E29d2ee6973E5Bd093df40ef9d0B28BD56C9e4E")
  await sendTxn(nft.transferFrom(wallet.address, tokenManager.address, nftId), "nft.transferFrom")
  // await sendTxn(nft.transferFrom(tokenManager.address, wallet.address, nftId), "nft.transferFrom")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
