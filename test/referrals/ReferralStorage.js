const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")

use(solidity)

const { AddressZero, HashZero } = ethers.constants

describe("Vester", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3, user4] = provider.getWallets()
  let referralStorage

  beforeEach(async () => {
    referralStorage = await deployContract("ReferralStorage", []);
  })

  it("Sets new handler", async () => {
    await expect(referralStorage.connect(user0).setHandler(user1.address, true))
      .to.be.revertedWith("Governable: forbidden")

    expect(await referralStorage.isHandler(user0.address)).to.be.false
    await expect(referralStorage.connect(user1).setHandler(user0.address, true)).to.be.revertedWith("Governable: forbidden")
    await referralStorage.setHandler(user0.address, true)
    expect(await referralStorage.isHandler(user0.address)).to.be.true

    await referralStorage.setHandler(user0.address, false)
    expect(await referralStorage.isHandler(user0.address)).to.be.false
  })

  it("Activates and deactivates code", async () => {
    const code = ethers.utils.keccak256("0xFF")

    await expect(referralStorage.connect(user0).setIsCodeActive(code, true))
      .to.be.revertedWith("Governable: forbidden")

    expect(await referralStorage.isCodeActive(code)).to.be.false
    await expect(referralStorage.connect(user1).setIsCodeActive(code, true)).to.be.revertedWith("Governable: forbidden")
    await referralStorage.setIsCodeActive(code, true)
    expect(await referralStorage.isCodeActive(code)).to.be.true

    await referralStorage.setIsCodeActive(code, false)
    expect(await referralStorage.isCodeActive(code)).to.be.false
  })

  it("setTraderReferralCode", async () => {
    const code = ethers.utils.keccak256("0xFF")

    await expect(referralStorage.connect(user0).setTraderReferralCode(user1.address, code))
      .to.be.revertedWith("ReferralStorage: forbidden")

    await referralStorage.setHandler(user0.address, true)

    expect(await referralStorage.traderReferralCodes(user1.address)).eq(HashZero)
    await referralStorage.connect(user0).setTraderReferralCode(user1.address, code)
    expect(await referralStorage.traderReferralCodes(user1.address)).eq(code)
  })

  it("Registers code", async () => {
    const code = ethers.utils.keccak256("0xFF")

    expect (await referralStorage.codeOwners(code)).to.be.equal(AddressZero)

    await referralStorage.connect(user0).register(code)

    expect (await referralStorage.codeOwners(code)).to.be.equal(user0.address)

    await expect(referralStorage.connect(user0).register(code))
      .to.be.revertedWith("ReferralStorage: code already exists")

    const code2 = ethers.utils.keccak256("0xFF11")
    await referralStorage.connect(user0).register(code2)

    expect (await referralStorage.codeOwners(code)).to.be.equal(user0.address)
    expect (await referralStorage.codeOwners(code2)).to.be.equal(user0.address)
  })

  it("setCodeOwner", async () => {
    const code = ethers.utils.keccak256("0xFF")

    await referralStorage.connect(user0).register(code)
    expect (await referralStorage.codeOwners(code)).to.be.equal(user0.address)

    await expect(referralStorage.connect(user1).setCodeOwner(code, user2.address)).to.be.revertedWith("ReferralStorage: forbidden")
    await referralStorage.connect(user0).setCodeOwner(code, user2.address)

    expect (await referralStorage.codeOwners(code)).to.be.equal(user2.address)
  })

  it("govSetCodeOwner", async () => {
    const code = ethers.utils.keccak256("0xFF")

    await referralStorage.connect(user0).register(code)
    expect (await referralStorage.codeOwners(code)).to.be.equal(user0.address)

    await expect(referralStorage.connect(user1).govSetCodeOwner(code, user2.address)).to.be.revertedWith("Governable: forbidden")
    await referralStorage.connect(wallet).govSetCodeOwner(code, user2.address)

    expect (await referralStorage.codeOwners(code)).to.be.equal(user2.address)
  })

  it("getTraderReferralInfo", async () => {
    const code = ethers.utils.keccak256("0xFF")

    let info = await referralStorage.getTraderReferralInfo(user1.address)
    expect(info[0]).eq(HashZero)
    expect(info[1]).eq(AddressZero)

    await referralStorage.setHandler(user0.address, true)
    await referralStorage.connect(user0).setTraderReferralCode(user1.address, code)

    info = await referralStorage.getTraderReferralInfo(user1.address)
    expect(info[0]).eq(code)
    expect(info[1]).eq(AddressZero)

    await referralStorage.connect(user1).register(code)

    info = await referralStorage.getTraderReferralInfo(user1.address)
    expect(info[0]).eq(code)
    expect(info[1]).eq(AddressZero)

    await referralStorage.connect(wallet).setIsCodeActive(code, true)

    info = await referralStorage.getTraderReferralInfo(user1.address)
    expect(info[0]).eq(code)
    expect(info[1]).eq(user1.address)

    await referralStorage.connect(wallet).setIsCodeActive(code, false)

    info = await referralStorage.getTraderReferralInfo(user1.address)
    expect(info[0]).eq(code)
    expect(info[1]).eq(AddressZero)
  })
});
