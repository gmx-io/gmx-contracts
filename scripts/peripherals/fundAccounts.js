const { getFrameSigner, sendTxn, contractAt } = require("../shared/helpers")
const { formatAmount } = require("../../test/shared/utilities")
const { getValues } = require("../shared/fundAccountsUtils")

async function main() {
  const signer = await getFrameSigner()
  const { sender, transfers, totalTransferAmount, tokens, gasToken } = await getValues()
  const nativeTokenForSigner = await contractAt("WETH", tokens.nativeToken.address, signer)

  await sendTxn(nativeTokenForSigner.transfer(sender.address, totalTransferAmount), `to distributor, ${formatAmount(totalTransferAmount, 18, 2)} ${gasToken} to ${sender.address}`)

  const nativeToken = await contractAt("WETH", tokens.nativeToken.address)
  await sendTxn(nativeToken.withdraw(totalTransferAmount), `nativeToken.withdraw(${formatAmount(totalTransferAmount, 18, 2)})`)

  for (let i = 0; i < transfers.length; i++) {
    const transferItem = transfers[i]

    await sendTxn(sender.sendTransaction({
      to: transferItem.address,
      value: transferItem.amount
    }), `${formatAmount(transferItem.amount, 18, 2)} ${gasToken} to ${transferItem.address}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
