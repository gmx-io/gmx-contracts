const { buildSignatureBytes } = require("@safe-global/protocol-kit");

async function proposeSafeTransaction(safeClient, { transactions, nonce }) {
  const safeTransaction = await safeClient.protocolKit.createTransaction({
    transactions,
    options: nonce !== undefined ? { nonce } : undefined,
  });

  const signedSafeTransaction = await safeClient.protocolKit.signTransaction(safeTransaction);
  const signerAddress = await safeClient.protocolKit.getSafeProvider().getSignerAddress();
  if (!signerAddress) {
    throw new Error("Signer address is required to propose a Safe transaction");
  }

  const safeTxHash = await safeClient.protocolKit.getTransactionHash(signedSafeTransaction);
  const ethSig = signedSafeTransaction.getSignature(signerAddress);

  await safeClient.apiKit.proposeTransaction({
    safeAddress: await safeClient.protocolKit.getAddress(),
    safeTransactionData: signedSafeTransaction.data,
    safeTxHash,
    senderAddress: signerAddress,
    senderSignature: buildSignatureBytes([ethSig]),
  });

  return {
    safeTxHash,
    nonce: signedSafeTransaction.data.nonce,
  };
}

module.exports = {
  proposeSafeTransaction,
};
