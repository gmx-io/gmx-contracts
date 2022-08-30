const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { getBlockTime, sleep } = require("../shared/utilities")

use(solidity)

const { keccak256 } = ethers.utils

describe("Competition", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let contract
  let ts
  let referralStorage
  let code = keccak256("0xFF")

  beforeEach(async () => {
    ts = await getBlockTime(provider)
    referralStorage = await deployContract("ReferralStorage", [])
    contract = await deployContract("Competition", [referralStorage.address]);
    await referralStorage.registerCode(code)
  })

  it("allows owner to create competition", async () => {
    await contract.connect(wallet).createCompetition(ts + 10, ts + 20)
  })

  it("disable non owners to set competition details", async () => {
    await expect(contract.connect(user0).createCompetition(ts + 10, ts + 20)).to.be.revertedWith("Governable: forbidden")
  })

  it("disable people to register teams after registration time", async () => {
    const ts = await getBlockTime(provider)
    await contract.connect(wallet).createCompetition(ts + 2, ts + 60)
    await sleep(2000);
    await expect(contract.connect(user0).registerTeam("1", code)).to.be.revertedWith("Registration is closed.")
  })

  it("allows people to register teams in times", async () => {
    await contract.connect(user0).registerTeam("1", code)
  })

  it("disable people to register multiple teams", async () => {
    await contract.connect(user0).registerTeam("1", code)
    await expect(contract.connect(user0).registerTeam("2", code)).to.be.revertedWith("Team members are not allowed.")
  })

  it("disable people to register a team with non existing referral code", async () => {
    await expect(contract.connect(user0).registerTeam("1", keccak256("0xFE"))).to.be.revertedWith("Referral code does not exist.")
  })

  it("disable multiple teams with the same name", async () => {
    await contract.connect(user0).registerTeam("1", code)
    await expect(contract.connect(user1).registerTeam("1", code)).to.be.revertedWith("Team name already registered.")
  })

  it("allows people to create join requests", async () => {
    await contract.connect(user0).registerTeam("1", code)
    await contract.connect(user1).createJoinRequest(user0.address)
  })

  it("disable people to create multiple join requests", async () => {
    await contract.connect(user0).registerTeam("1", code)
    await contract.connect(user1).registerTeam("2", code)
    await contract.connect(user2).createJoinRequest(user0.address)
    await expect(contract.connect(user2).createJoinRequest(user1.address)).to.be.revertedWith("You already have an active join request.")
  })

  it("allow people to cancel join requests", async () => {
    await contract.connect(user0).registerTeam("1", code)
    await contract.connect(user1).createJoinRequest(user0.address)
    await contract.connect(user1).cancelJoinRequest()
    await expect(contract.connect(user0).approveJoinRequest(user1.address)).to.be.revertedWith("This member did not apply.")
  })

  it("disable team members to create join requests", async () => {
    await contract.connect(user0).registerTeam("1", code)
    await contract.connect(user1).registerTeam("2", code)
    await expect(contract.connect(user0).createJoinRequest(user1.address)).to.be.revertedWith("Team members are not allowed.")
  })

  it("allows team leaders to accept requests", async () => {
    await contract.connect(user0).registerTeam("1", code)
    await contract.connect(user1).createJoinRequest(user0.address)
    await contract.connect(user0).approveJoinRequest(user1.address)
    const members = await contract.getTeamMembers(user0.address)
    expect(members).to.include(user1.address)
  })

  it("disallow leaders to accept non existant join request", async () => {
    await contract.connect(user0).registerTeam("1", code)
    await expect(contract.connect(user0).approveJoinRequest(user1.address)).to.be.revertedWith("This member did not apply.")
  })

  it("disallow leaders to accept members after registration time", async () => {
    const ts = await getBlockTime(provider)
    await contract.connect(wallet).createCompetition(ts + 2, ts + 10)
    await sleep(2000)
    await expect(contract.connect(user0).registerTeam("1", code)).to.be.revertedWith("Registration is closed.")
  })

  it("allow leaders to kick members", async () => {
    await contract.connect(user0).registerTeam("1", code)
    await contract.connect(user1).createJoinRequest(user0.address)
    await contract.connect(user0).approveJoinRequest(user1.address)
    let members = await contract.getTeamMembers(user0.address)
    expect(members).to.include(user1.address)
    await contract.connect(user0).removeMember(user1.address)
    members = await contract.getTeamMembers(user0.address)
    expect(members).to.not.include(user1.address)
    await contract.connect(user1).createJoinRequest(user0.address)
  })

  it("allow owner to change team size", async () => {
    await contract.connect(wallet).setMaxTeamSize(2)
  })

  it("disallow non owners to change team size", async () => {
    await expect(contract.connect(user0).setMaxTeamSize(2)).to.be.revertedWith("Governable: forbidden")
  })

  it("disallow leader to accept join request if team is full", async () => {
    await contract.connect(user0).registerTeam("1", code)

    await contract.connect(user1).createJoinRequest(user0.address)
    await contract.connect(user0).approveJoinRequest(user1.address)

    await contract.connect(user2).createJoinRequest(user0.address)
    await contract.connect(user0).approveJoinRequest(user2.address)

    await contract.connect(wallet).setMaxTeamSize(2)
    await contract.connect(user3).createJoinRequest(user0.address)
    await expect(contract.connect(user0).approveJoinRequest(user3.address)).to.be.revertedWith("Team is full.")
  })
});
