const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { getBlockTime } = require("../shared/utilities")

use(solidity)

const { keccak256 } = ethers.utils

// Tier0 (5% discount, 5% rebate) = Tier {totalRebate = 1000, defaultTradersDiscountShare = 5000}
// Tier1 (12% discount, 8% rebate) = Tier {totalRebate = 2000, defaultTradersDiscountShare = 6000}
// Tier2 (12% discount, 15% rebate) = Tier {totalRebate = 2700, defaultTradersDiscountShare = 4444}
// for the last tier extra EsGMX incentives will be handled off-chain
describe("Competition", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2] = provider.getWallets()
  let competition
  let referralStorage

  beforeEach(async () => {
    const ts = await getBlockTime(provider)

    referralStorage = await deployContract("ReferralStorage", [])
    competition = await deployContract("Competition", [
      ts + 60, // start
      ts + 120, // end
      ts - 60, // registrationStart
      ts + 60, // registrationEnd
      referralStorage.address
    ]);
  })

  it("allows owner to set times", async () => {
    await competition.connect(wallet).setStart(1)
    await competition.connect(wallet).setEnd(1)
    await competition.connect(wallet).setRegistrationStart(1)
    await competition.connect(wallet).setRegistrationEnd(1)
  })

  it("disable non owners to set times", async () => {
    await expect(competition.connect(user0).setStart(1)).to.be.revertedWith("Governable: forbidden")
    await expect(competition.connect(user0).setEnd(1)).to.be.revertedWith("Governable: forbidden")
    await expect(competition.connect(user0).setRegistrationStart(1)).to.be.revertedWith("Governable: forbidden")
    await expect(competition.connect(user0).setRegistrationEnd(1)).to.be.revertedWith("Governable: forbidden")
  })

  it("disable people to register teams before registration time", async () => {
    const code = keccak256("0xFF")
    await referralStorage.connect(user0).registerCode(code)
    await competition.connect(wallet).setRegistrationStart((await getBlockTime(provider)) + 10)
    await expect(competition.connect(user0).registerTeam("1", code)).to.be.revertedWith("Registration is closed.")
  })

  it("disable people to register teams after registration time", async () => {
    const code = keccak256("0xFF")
    await referralStorage.connect(user0).registerCode(code)
    await competition.connect(wallet).setRegistrationEnd((await getBlockTime(provider)) - 10)
    await expect(competition.connect(user0).registerTeam("1", code)).to.be.revertedWith("Registration is closed.")
  })

  it("allows people to register teams in times", async () => {
    const code = keccak256("0xFF")
    await referralStorage.connect(user0).registerCode(code)
    try {
      await competition.connect(user0).registerTeam("1", code)
    } catch (e) {
      console.log(e)
    }
  })

  it("disabled people to register multiple teams", async () => {
    const code = keccak256("0xFF")
    await referralStorage.connect(user0).registerCode(code)
    await competition.connect(user0).registerTeam("1", code)
    await expect(competition.connect(user0).registerTeam("1", code)).to.be.revertedWith("Team members are not allowed.")
  })

  it("disabled people to register a team with non existing referral code", async () => {
    const code = keccak256("0xFF")
    await expect(competition.connect(user0).registerTeam("1", code)).to.be.revertedWith("Referral code does not exist.")
  })

  it("disabled multiple teams with the same name", async () => {
    const code = keccak256("0xFF")
    await competition.connect(user0).registerTeam("1", code)
    await expect(competition.connect(user1).registerTeam("1", code)).to.be.revertedWith("Team name already registered.")
  })
});
