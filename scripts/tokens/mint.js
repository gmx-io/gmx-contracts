const { readTmpAddresses, contractAt, callWithRetries } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function main() {
	const account = (await ethers.getSigners())[0]
	const {BTC, ETH, USDC, USDT} = readTmpAddresses()

	for (const tokenAddress of [BTC, USDC, USDT]) {
		const amount = expandDecimals(100000, 18)
		console.log(`Minting ${amount} of tokens ${tokenAddress}`)
		const tokenContract = await contractAt("FaucetToken", tokenAddress)
		await callWithRetries(tokenContract.mint.bind(tokenContract), [account.address, amount])
	}
}

main()