const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed } = require("../shared/utilities")
const { toChainlinkPrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig, validateVaultBalance } = require("./Vault/helpers")

use(solidity)

const USD_PRECISION = expandDecimals(1, 30)

describe("Pool", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let eth
  let pool

  beforeEach(async () => {
    eth = await deployContract("Token", [])
    pool = await deployContract("Pool", [])
  })

  it("increasePosition", async () => {
    await pool.increasePosition(user0.address, eth.address, 17, true, 1000, 200)
    let position = await pool.getPosition(user0.address, eth.address, 17, true)
    console.log("position",
      position.size.toString(),
      position.collateralAmount.toString(),
      position.averagePrice.toString(),
      position.entryFundingRate.toString(),
      position.reserveAmount.toString(),
      position.updatedAt.toString()
    )

    await pool.increasePosition(user0.address, eth.address, 17, true, 500, 100)

    position = await pool.getPosition(user0.address, eth.address, 17, true)
    console.log("position",
      position.size.toString(),
      position.collateralAmount.toString(),
      position.averagePrice.toString(),
      position.entryFundingRate.toString(),
      position.reserveAmount.toString(),
      position.updatedAt.toString()
    )
  })
})
