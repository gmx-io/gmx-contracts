const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function main() {
  const router = await contractAt("Router", "0xD46B23D042E976F8666F554E928e0Dc7478a8E1f")
  const vault = await contractAt("Vault", "0xc73A8DcAc88498FD4b4B1b2AaA37b0a2614Ff67B")
  const gov = await contractAt("Timelock", "0x330EeF6b9B1ea6EDd620C825c9919DC8b611d5d5")

  const tokenDecimals = 18

  const btc = {
    symbol: "BTC",
    address: "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c"
  }
  const eth = {
    symbol: "ETH",
    address: "0x2170ed0880ac9a755fd29b2688956bd959f933f8"
  }
  const bnb = {
    symbol: "BNB",
    address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"
  }
  const busd = {
    symbol: "BUSD",
    address: "0xe9e7cea3dedca5984780bafc599bd69add087d56"
  }
  const usdc = {
    symbol: "USDC",
    address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d"
  }
  const usdt = {
    symbol: "USDT",
    address: "0x55d398326f99059fF775485246999027B3197955"
  }

  const tokens = [btc, eth, bnb, busd, usdc, usdt]

  for (let i = 0; i < tokens.length; i++) {
    const token = await contractAt("YieldToken", tokens[i].address)
    const poolAmount = await vault.poolAmounts(token.address)
    const feeReserve = await vault.feeReserves(token.address)
    const balance = await token.balanceOf(vault.address)
    const vaultAmount = poolAmount.add(feeReserve)
    if (vaultAmount.gt(balance)) {
      const diff = vaultAmount.sub(balance)
      console.log(`${token.address}: vaultAmount.gt(balance): ${ethers.utils.formatUnits(diff, 18)} ${tokens[i].symbol}`)
    } else {
      const diff = balance.sub(vaultAmount)
      console.log(`${token.address}: vaultAmount.lt(balance): ${ethers.utils.formatUnits(diff, 18)} ${tokens[i].symbol}`)
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
