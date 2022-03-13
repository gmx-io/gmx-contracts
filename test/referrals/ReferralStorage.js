const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")

use(solidity)

const { AddressZero } = ethers.constants

describe("Vester", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3, user4] = provider.getWallets()
  let referralStorage

  beforeEach(async () => {
    referralStorage = await deployContract("ReferralStorage", []);
  })

  it("Sets new handler", async () => {
    expect(await referralStorage.isHandler(user0.address)).to.be.false
    await expect(referralStorage.connect(user1).setHandler(user0.address, true)).to.be.revertedWith("Governable: forbidden")
    await referralStorage.setHandler(user0.address, true)
    expect(await referralStorage.isHandler(user0.address)).to.be.true

    await referralStorage.setHandler(user0.address, false)
    expect(await referralStorage.isHandler(user0.address)).to.be.false
  })

  it("Activates and deactivates code", async () => {
    const code = ethers.utils.keccak256("0xFF")

    expect(await referralStorage.isCodeActive(code)).to.be.false
    await expect(referralStorage.connect(user1).setIsCodeActive(code, true)).to.be.revertedWith("Governable: forbidden")
    await referralStorage.setIsCodeActive(code, true)
    expect(await referralStorage.isCodeActive(code)).to.be.true

    await referralStorage.setIsCodeActive(code, false)
    expect(await referralStorage.isCodeActive(code)).to.be.false
  })

  it("Registers code", async () => {
    const code = ethers.utils.keccak256("0xFF")

    expect (await referralStorage.referralCodeOwners(code)).to.be.equal(AddressZero)
    expect (await referralStorage.isRegistered(user0.address)).to.be.false

    await referralStorage.connect(user0).register(code)

    expect (await referralStorage.referralCodeOwners(code)).to.be.equal(user0.address)
    expect (await referralStorage.isRegistered(user0.address)).to.be.true
  })

  it("Sets referral code owner", async () => {
    const code = ethers.utils.keccak256("0xFF")

    expect(Number(await referralStorage.referrals(user1.address))).to.be.equal(0)
    await expect(referralStorage.connect(user1).setReferral(user0.address, code)).to.be.revertedWith("ReferralStorage: forbidden")
    await referralStorage.setHandler(user1.address, true)
    await referralStorage.connect(user1).setReferral(user0.address, code)
    expect(await referralStorage.referrals(user0.address)).to.be.equal(code)
  })

  it("Updates referrer address", async () => {
    const code = ethers.utils.keccak256("0xFF")

    await referralStorage.connect(user0).register(code)
    expect (await referralStorage.referralCodeOwners(code)).to.be.equal(user0.address)
    expect (await referralStorage.isRegistered(user0.address)).to.be.true

    await expect(referralStorage.connect(user1).updateAddress(code, user2.address)).to.be.revertedWith("ReferralStorage: forbidden")
    await referralStorage.connect(user0).updateAddress(code, user2.address)

    expect (await referralStorage.referralCodeOwners(code)).to.be.equal(user2.address)
    expect (await referralStorage.isRegistered(user2.address)).to.be.true
    // expect (await referralStorage.isRegistered(user0.address)).to.be.false
  })

  it("Registers code", async () => {
    const code = ethers.utils.keccak256("0xFF")

    await referralStorage.connect(user0).register(code)
    await referralStorage.setHandler(user1.address, true)
    await referralStorage.connect(user1).setReferral(user2.address, code)

    const referral = await referralStorage.getReferral(user2.address)
    expect(referral[0]).to.be.equal(code)
    expect(Number(referral[1])).to.be.equal(0)

    await referralStorage.setIsCodeActive(code, true)

    const referral2 = await referralStorage.getReferral(user2.address)
    expect(referral2[0]).to.be.equal(code)
    expect(referral2[1]).to.be.equal(user0.address)
  })
});
