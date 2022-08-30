const { ADDRESS_ZERO } = require("@uniswap/v3-sdk")
const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { ethers } = require("hardhat")
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

  async function getTeamMembers(index, addr)
  {
    let start = 0
    const offset = 100
    const result = []

    while (true) {
      let res = await contract.getTeamMembers(index, addr, start, offset)
      res = res.filter(addr => addr !== ADDRESS_ZERO)

      res.forEach(r => {
        result.push(r)
      })

      if (res.length < offset) {
        break;
      }
    }

    return result
  }

  beforeEach(async () => {
    ts = await getBlockTime(provider)
    referralStorage = await deployContract("ReferralStorage", [])
    contract = await deployContract("Competition", [referralStorage.address]);
    await referralStorage.registerCode(code)
    await contract.createCompetition(ts + 10, ts + 20, 10)
  })

  it("allows owner to create competition", async () => {
    await contract.connect(wallet).createCompetition(ts + 10, ts + 20, 10)
  })

  it("disable non owners to set competition details", async () => {
    await expect(contract.connect(user0).createCompetition(ts + 10, ts + 20, 10)).to.be.revertedWith("Governable: forbidden")
  })

  it("disable people to register teams after registration time", async () => {
    const ts = await getBlockTime(provider)
    await contract.connect(wallet).createCompetition(ts + 2, ts + 60, 10)
    await sleep(2000);
    await expect(contract.connect(user0).createTeam(1, "1", code)).to.be.revertedWith("Competition: Registration is closed.")
  })

  it("allows people to register teams in times", async () => {
    await contract.connect(user0).createTeam(0, "1", code)
  })

  it("disable people to register multiple teams", async () => {
    await contract.connect(user0).createTeam(0, "1", code)
    await expect(contract.connect(user0).createTeam(0, "2", code)).to.be.revertedWith("Competition: Team members are not allowed.")
  })

  it("disable people to register a team with non existing referral code", async () => {
    await expect(contract.connect(user0).createTeam(0, "1", keccak256("0xFE"))).to.be.revertedWith("Competition: Referral code does not exist.")
  })

  it("disable multiple teams with the same name", async () => {
    await contract.connect(user0).createTeam(0, "1", code)
    await expect(contract.connect(user1).createTeam(0, "1", code)).to.be.revertedWith("Competition: Team name already registered.")
  })

  it("allows people to create join requests", async () => {
    await contract.connect(user0).createTeam(0, "1", code)
    await contract.connect(user1).createJoinRequest(0, user0.address)
  })

  it("allows people to replace join requests", async () => {
    await contract.connect(user0).createTeam(0, "1", code)
    await contract.connect(user1).createTeam(0, "2", code)
    await contract.connect(user2).createJoinRequest(0, user0.address)
    await contract.connect(user2).createJoinRequest(0, user1.address)
  })

  it("allow people to cancel join requests", async () => {
    await contract.connect(user0).createTeam(0, "1", code)
    await contract.connect(user1).createJoinRequest(0, user0.address)
    await contract.connect(user1).cancelJoinRequest(0)
    await expect(contract.connect(user0).approveJoinRequest(0, user1.address)).to.be.revertedWith("Competition: This member did not apply.")
  })

  it("disable team members to create join requests", async () => {
    await contract.connect(user0).createTeam(0, "1", code)
    await contract.connect(user1).createTeam(0, "2", code)
    await expect(contract.connect(user0).createJoinRequest(0, user1.address)).to.be.revertedWith("Competition: Team members are not allowed.")
  })

  it("allows team leaders to accept requests", async () => {
    await contract.connect(user0).createTeam(0, "1", code)
    await contract.connect(user1).createJoinRequest(0, user0.address)
    await contract.connect(user0).approveJoinRequest(0, user1.address)
    const members = await getTeamMembers(0, user0.address)
    expect(members).to.include(user1.address)
  })

  it("disallow leaders to accept non existant join request", async () => {
    await contract.connect(user0).createTeam(0, "1", code)
    await expect(contract.connect(user0).approveJoinRequest(0, user1.address)).to.be.revertedWith("Competition: This member did not apply.")
  })

  it("disallow leaders to accept members after registration time", async () => {
    const ts = await getBlockTime(provider)
    await contract.connect(wallet).createCompetition(ts + 2, ts + 10, 10)
    await sleep(2000)
    await expect(contract.connect(user0).createTeam(1, "1", code)).to.be.revertedWith("Competition: Registration is closed.")
  })

  it("allow leaders to kick members", async () => {
    await contract.connect(user0).createTeam(0, "1", code)
    await contract.connect(user1).createJoinRequest(0, user0.address)
    await contract.connect(user0).approveJoinRequest(0, user1.address)
    let members = await getTeamMembers(0, user0.address)
    expect(members).to.include(user1.address)
    await contract.connect(user0).removeMember(0, user1.address)
    members = await getTeamMembers(0, user0.address)
    expect(members).to.not.include(user1.address)
    await contract.connect(user1).createJoinRequest(0, user0.address)
  })

  it("allow owner to change competition", async () => {
    await contract.connect(wallet).updateCompetition(0, ts + 60, ts + 120, 5);
  })

  it("disallow non owners to change competition", async () => {
    await expect(contract.connect(user0).updateCompetition(0, ts + 60, ts + 12, 5)).to.be.revertedWith("Governable: forbidden")
  })

  it("disallow leader to accept join request if team is full", async () => {
    const ts = await getBlockTime(provider)

    await contract.connect(wallet).updateCompetition(0, ts + 10, ts + 20, 3)
    await contract.connect(user0).createTeam(0, "1", code)

    await contract.connect(user1).createJoinRequest(0, user0.address)
    await contract.connect(user0).approveJoinRequest(0, user1.address)

    await contract.connect(user2).createJoinRequest(0, user0.address)
    await contract.connect(user0).approveJoinRequest(0, user2.address)

    await contract.connect(user3).createJoinRequest(0, user0.address)
    await expect(contract.connect(user0).approveJoinRequest(0, user3.address)).to.be.revertedWith("Competition: Team is full.")
  })

  it("allow owner to delete competition if it is not started", async () => {
    await contract.removeCompetition(0)
    const ts = await getBlockTime(provider)
    await contract.createCompetition(ts + 2, ts + 10, 10)
    await sleep(2000)
    await expect(contract.removeCompetition(1)).to.be.revertedWith("Competition: Competition is active.")
    await contract.updateCompetition(1, ts + 10, ts + 20, 10)
    await expect(contract.connect(user1).removeCompetition(1)).to.be.revertedWith("Governable: forbidden")
  })
});
