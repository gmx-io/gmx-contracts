const { deployContract, contractAt, sendTxn } = require("../shared/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

async function main() {
  const vesterCap = await contractAt("VesterCap", "0x6C507B00Ef0266de345548974A3A05182Bf62696")

  const accounts = [
    "0x785c926ff6da24ef6ac7e52b892ace5e0ecda7a2",
    "0xc2148f8699367f1eb52e9d6c751d94b05b3ee2aa",
    "0x2b82ecae43c4332916231e1e55a21015d0cd2584",
    "0x732191cb57f4b85a56f77d815536c568f41898e5",
    "0x3c8854f35fecdd55d4574486673082e842cd0bf9",
    "0xb6ee77571cfa9a825a2000745e3fe3ee2a10bf58",
    "0x5b3e062eb5a0af1d36da97851aff8462079178a1",
    "0xc3082311c09b99936fd2d45f5e17db18d5ea4b35",
    "0xff0db36bdf740ce4190892e0d930bc411420ef44",
    "0x83580f96035c1f7192fe4cb5b3357ba0e699cedf",
    "0xc4ed448e7d7bdd954e943954459017be63584f69",
    "0x557dd3d21b31cae70c22bf26bdc4ae315e5a6942",
    "0x04a8c5f571020aa0cae7e036beddfe8cc4f4e147",
    "0xd47d0ff8c77bc2a7fdaef21cbf0c0a1715b77fa0"
  ]

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i]
    await vesterCap.unreservePairToken(account)
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
