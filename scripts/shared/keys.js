const { hashString, hashData } = require("./hash")

const CLAIMABLE_FEE_AMOUNT = hashString("CLAIMABLE_FEE_AMOUNT")

const WITHDRAWABLE_BUYBACK_TOKEN_AMOUNT = hashString("WITHDRAWABLE_BUYBACK_TOKEN_AMOUNT")

function claimableFeeAmountKey(market, token) {
  return hashData(["bytes32", "address", "address"], [CLAIMABLE_FEE_AMOUNT, market, token]);
}

function withdrawableBuybackTokenAmountKey(buybackToken) {
  return hashData(["bytes32", "address"], [WITHDRAWABLE_BUYBACK_TOKEN_AMOUNT, buybackToken]);
}

module.exports = {
  claimableFeeAmountKey,
  withdrawableBuybackTokenAmountKey
}
