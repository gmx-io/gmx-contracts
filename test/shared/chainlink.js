function toChainlinkPrice(value) {
  return parseInt(value * Math.pow(10, 8))
}

module.exports = { toChainlinkPrice }
