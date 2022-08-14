const { readTmpAddresses, contractAt, callWithRetries } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require("../core/tokens")[network]

async function main() {
	const account = (await ethers.getSigners())[0]
	const {btc, usdc, usdt} = tokens

	for (const token of [btc, usdc, usdt]) {
		const amount = expandDecimals(100000, token.decimals)
		console.log(`Minting ${amount} of tokens ${token.address}`)
		const tokenContract = await contractAt("FaucetToken", token.address)
		await callWithRetries(tokenContract.mint.bind(tokenContract), [account.address, amount])
	}
}

main()
