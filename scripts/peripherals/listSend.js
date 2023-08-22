const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals, bigNumberify } = require("../../test/shared/utilities")
const { LIST } = require("../../data/batchSend/list")

const {
  ARBITRUM_URL,
  ARBITRUM_PAYMENTS_KEY,
  AVAX_URL,
  AVAX_PAYMENTS_KEY,
} = require("../../env.json")

async function main() {
  const arbProvider = new ethers.providers.JsonRpcProvider(ARBITRUM_URL)
  const arbWallet = new ethers.Wallet(ARBITRUM_PAYMENTS_KEY).connect(arbProvider)

  const avaxProvider = new ethers.providers.JsonRpcProvider(AVAX_URL)
  const avaxWallet = new ethers.Wallet(AVAX_PAYMENTS_KEY).connect(avaxProvider)

  const list = LIST
  const usdc = await contractAt("Token", "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", avaxWallet)
  const usdcDecimals = 6
  const gmx = await contractAt("Token", "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a", arbWallet)
  const gmxDecimals = 18
  const shouldSendTxn = false

  const minCount = 0
  let count = 0

  let totalUsdc = bigNumberify(0)
  let totalGmx = bigNumberify(0)

  for (let i = 0; i < list.length; i++) {
    const item = list[i]
    if (item.usdc && parseFloat(item.usdc) !== 0) {
      const amount = ethers.utils.parseUnits(item.usdc, usdcDecimals)
      totalUsdc = totalUsdc.add(amount)
    }

    if (item.gmx && parseFloat(item.gmx) !== 0) {
      const amount = ethers.utils.parseUnits(item.gmx, gmxDecimals)
      totalGmx = totalGmx.add(amount)
    }
  }

  const usdcBalance = await usdc.balanceOf(avaxWallet.address)
  const gmxBalance = await gmx.balanceOf(arbWallet.address)

  if (usdcBalance.lt(totalUsdc)) {
    throw new Error(`Insufficient USDC, balance: ${usdcBalance.toString()}, required: ${totalUsdc.toString()}`)
  }

  if (gmxBalance.lt(totalGmx)) {
    throw new Error(`Insufficient GMX, balance: ${gmxBalance.toString()}, required: ${totalUsdc.toString()}`)
  }

  for (let i = 0; i < list.length; i++) {
    const item = list[i]
    if (item.usdc && parseFloat(item.usdc) !== 0) {
      count++
      const amount = ethers.utils.parseUnits(item.usdc, usdcDecimals)
      if (shouldSendTxn && count >= minCount) {
        await sendTxn(usdc.transfer(item.account, amount, { gasLimit: 1_000_000 }), `${count}: usdc.transfer(${item.account}, ${amount})`)
      }
    }
    if (item.gmx && parseFloat(item.gmx) !== 0) {
      count++
      const amount = ethers.utils.parseUnits(item.gmx, gmxDecimals)
      if (shouldSendTxn && count >= minCount) {
        await sendTxn(gmx.transfer(item.account, amount, { gasLimit: 2_000_000 }), `${count}: gmx.transfer(${item.account}, ${amount})`)
      }
    }
  }

  // for (let i = 0; i < list.length; i++) {
  //   const item = list[i]
  //   if (item.usdc && parseFloat(item.usdc) !== 0) {
  //     console.log("usdc:", item.usdc)
  //   }
  // }
  //
  // for (let i = 0; i < list.length; i++) {
  //   const item = list[i]
  //   if (item.gmx && parseFloat(item.gmx) !== 0) {
  //     console.log("gmx:", item.gmx)
  //   }
  // }

  console.log("total USDC", ethers.utils.formatUnits(totalUsdc, usdcDecimals))
  console.log("total GMX", ethers.utils.formatUnits(totalGmx, gmxDecimals))
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
