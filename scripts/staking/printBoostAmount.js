const { contractAt, sendTxn } = require("../shared/helpers")
const { bigNumberify } = require("../../test/shared/utilities")
const compoundGmxList = require("../../data/staking/compoundGmxList.json")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

async function getArbValues() {
  const rewardRouter = await contractAt("RewardRouter", "0x159854e14A862Df9E39E1D128b8e5F70B4A3cE9B")
  const stakedGmxTracker = await contractAt("RewardTracker", "0x908C4D94D34924765f1eDc22A1DD098397c59dD4")
  const feeGmxTracker = await contractAt("RewardTracker", "0xd2D1162512F927a7e282Ef43a362659E4F2a728F")
  const bnGmxAddress = "0x35247165119B69A40edD5304969560D0ef486921"
  return { rewardRouter, stakedGmxTracker, feeGmxTracker, bnGmxAddress }
}

async function getAvaxValues() {
  const rewardRouter = await contractAt("RewardRouter", "0xa192D0681E2b9484d1fA48083D36B8A2D0Da1809")
  const stakedGmxTracker = await contractAt("RewardTracker", "0x2bD10f8E93B3669b6d42E74eEedC65dd1B0a1342")
  const feeGmxTracker = await contractAt("RewardTracker", "0x4d268a7d4C16ceB5a606c173Bd974984343fea13")
  const bnGmxAddress = "0x8087a341D32D445d9aC8aCc9c14F5781E04A26d2"
  return { rewardRouter, stakedGmxTracker, feeGmxTracker, bnGmxAddress }
}

async function getValues() {
  if (network === "arbitrum") {
    return getArbValues()
  }

  if (network === "avax") {
    return getAvaxValues()
  }
}


async function main() {
  const { rewardRouter, stakedGmxTracker, feeGmxTracker, bnGmxAddress } = await getValues()

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

  console.log("processing list", accounts.length)

  const maxBoostBasisPoints = 20_000
  const BASIS_POINTS_DIVISOR = 10_000

  let sum = bigNumberify(0)

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i]
    const baseStakedAmount = await stakedGmxTracker.stakedAmounts(account)
    const maxAllowedBnGmxAmount = baseStakedAmount.mul(maxBoostBasisPoints).div(BASIS_POINTS_DIVISOR)
    const stakedBnGmxAmount = await feeGmxTracker.depositBalances(account, bnGmxAddress);
    const excessAmount = stakedBnGmxAmount.sub(maxAllowedBnGmxAmount)
    console.log(account, baseStakedAmount.toString(), maxAllowedBnGmxAmount.toString(), stakedBnGmxAmount.toString(), excessAmount.toString())
    sum = sum.add(excessAmount)
  }

  console.log("total", sum.toString())
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
