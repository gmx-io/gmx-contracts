function toUsd(value) {
  const normalizedValue = parseInt(value * Math.pow(10, 10))
  return ethers.BigNumber.from(normalizedValue).mul(ethers.BigNumber.from(10).pow(20))
}

toNormalizedPrice = toUsd

module.exports = { toUsd, toNormalizedPrice }
