const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed, print } = require("../shared/utilities")
const { toChainlinkPrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")

use(solidity)

const { AddressZero } = ethers.constants

describe("GmxFloor", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3, signer0, signer1, signer2] = provider.getWallets()
  let gmx
  let eth
  let gmxFloor
  let timelock
  let nft0
  let nft1
  const nftId = 17

  beforeEach(async () => {
    gmx = await deployContract("GMX", [])
    eth = await deployContract("Token", [])
    gmxFloor = await deployContract("GmxFloor", [
      gmx.address, // _gmx
      eth.address, // _reserveToken
      expandDecimals(1000, 18), // _backedSupply
      expandDecimals(5, 30 - 4), // _baseMintPrice, 1 ETH => $4000, 0.0005 ETH => $2
      expandDecimals(5, 30 - 4 - 6), // _mintMultiplier, 0.0025 ETH => $10, 0.0025 / 5 million, 0.0005 / 1 million
      expandDecimals(1, 18), // _multiplierPrecision
      2
    ])

    await gmxFloor.initialize([signer0.address, signer1.address, signer2.address])

    nft0 = await deployContract("ERC721", ["NFT0", "NFT0"])
    nft1 = await deployContract("ERC721", ["NFT1", "NFT1"])

    timelock = await deployContract("Timelock", [
      wallet.address,
      5 * 24 * 60 * 60,
      user0.address,
      gmxFloor.address,
      user2.address,
      expandDecimals(1000, 18)
    ])
  })

  it("inits", async () => {
    expect(await gmxFloor.gmx()).eq(gmx.address)
    expect(await gmxFloor.reserveToken()).eq(eth.address)
    expect(await gmxFloor.backedSupply()).eq(expandDecimals(1000, 18))
    expect(await gmxFloor.baseMintPrice()).eq("500000000000000000000000000")
    expect(await gmxFloor.mintMultiplier()).eq("500000000000000000000")
    expect(await gmxFloor.multiplierPrecision()).eq(expandDecimals(1, 18))

    await expect(gmxFloor.initialize([signer0.address, signer1.address, signer2.address]))
      .to.be.revertedWith("TokenManager: already initialized")

    expect(await gmxFloor.signers(0)).eq(signer0.address)
    expect(await gmxFloor.signers(1)).eq(signer1.address)
    expect(await gmxFloor.signers(2)).eq(signer2.address)
    expect(await gmxFloor.signersLength()).eq(3)

    expect(await gmxFloor.isSigner(user0.address)).eq(false)
    expect(await gmxFloor.isSigner(signer0.address)).eq(true)
    expect(await gmxFloor.isSigner(signer1.address)).eq(true)
    expect(await gmxFloor.isSigner(signer2.address)).eq(true)
  })

  it("setHandler", async () => {
    await expect(gmxFloor.connect(user0).setHandler(user0.address, true))
      .to.be.revertedWith("TokenManager: forbidden")

    expect(await gmxFloor.isHandler(user0.address)).eq(false)
    await gmxFloor.connect(wallet).setHandler(user0.address, true)
    expect(await gmxFloor.isHandler(user0.address)).eq(true)
  })

  it("setBackedSupply", async () => {
    await expect(gmxFloor.connect(user0).setBackedSupply(expandDecimals(999, 18)))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(gmxFloor.connect(wallet).setBackedSupply(expandDecimals(999, 18)))
      .to.be.revertedWith("GmxFloor: invalid _backedSupply")

    expect(await gmxFloor.backedSupply()).eq(expandDecimals(1000, 18))
    await gmxFloor.connect(wallet).setBackedSupply(expandDecimals(1001, 18))
    expect(await gmxFloor.backedSupply()).eq(expandDecimals(1001, 18))
  })

  it("setMintMultiplier", async () => {
    await expect(gmxFloor.connect(user0).setMintMultiplier(expandDecimals(5, 30 - 10)))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(gmxFloor.connect(wallet).setMintMultiplier(expandDecimals(4, 30 - 10)))
      .to.be.revertedWith("GmxFloor: invalid _mintMultiplier")

    expect(await gmxFloor.mintMultiplier()).eq("500000000000000000000")
    await gmxFloor.connect(wallet).setMintMultiplier(expandDecimals(6, 30 - 10))
    expect(await gmxFloor.mintMultiplier()).eq("600000000000000000000")
  })

  it("mint, burn", async () => {
    expect(await gmxFloor.getMintPrice()).eq(expandDecimals(5, 30 - 4))
    expect(await gmxFloor.backedSupply()).eq(expandDecimals(1000, 18))
    expect(await gmxFloor.getBurnAmountOut(expandDecimals(1000, 18))).eq(0)

    await eth.mint(user0.address, expandDecimals(1, 18))
    expect(await gmx.balanceOf(user1.address)).eq(0)
    await expect(gmxFloor.connect(user0).mint(expandDecimals(1000, 18), expandDecimals(1, 18), user1.address))
      .to.be.revertedWith("GmxFloor: forbidden")

    await gmxFloor.setHandler(user0.address, true)

    await expect(gmxFloor.connect(user0).mint(expandDecimals(1000, 18), expandDecimals(1, 18), user1.address))
      .to.be.revertedWith("ERC20: transfer amount exceeds allowance")

    await eth.connect(user0).approve(gmxFloor.address, expandDecimals(1, 18))

    await expect(gmxFloor.connect(user0).mint(expandDecimals(1000, 18), expandDecimals(1, 18), user1.address))
      .to.be.revertedWith("BaseToken: transfer amount exceeds balance")

    await gmx.setMinter(wallet.address, true)
    await gmx.mint(gmxFloor.address, expandDecimals(2000, 18))

    expect(await eth.balanceOf(user0.address)).eq(expandDecimals(1, 18))
    expect(await gmx.balanceOf(user1.address)).eq(0)

    await expect(gmxFloor.connect(user0).mint(expandDecimals(2000, 18), expandDecimals(1, 18), user1.address))
      .to.be.revertedWith("GmxFloor: _maxCost exceeded")

    await gmxFloor.connect(user0).mint(expandDecimals(1900, 18), expandDecimals(1, 18), user1.address)

    expect(await eth.balanceOf(user0.address)).eq("49097500000000000") // 0.0490975
    expect(await gmx.balanceOf(user1.address)).eq(expandDecimals(1900, 18))

    expect(await gmxFloor.getMintPrice()).eq("500950000000000000000000000")
    expect(await gmxFloor.backedSupply()).eq(expandDecimals(2900, 18))

    expect(await gmxFloor.getBurnAmountOut(expandDecimals(1000, 18))).eq("295107672413793103") // 1000 * 0.9509025 / 2900 * 0.9, 0.295107672413793103 ETH, 1180 USD

    await gmxFloor.setHandler(user0.address, false)
    await expect(gmxFloor.connect(user0).burn(expandDecimals(1000, 18), "296000000000000000", user1.address))
      .to.be.revertedWith("GmxFloor: forbidden")

    await gmxFloor.setHandler(user0.address, true)
    await expect(gmxFloor.connect(user0).burn(expandDecimals(1000, 18), "296000000000000000", user1.address))
      .to.be.revertedWith("GmxFloor: insufficient amountOut")

    await expect(gmxFloor.connect(user0).burn(expandDecimals(1000, 18), "295000000000000000", user1.address))
      .to.be.revertedWith("MintableBaseToken: forbidden")

    await gmx.setMinter(gmxFloor.address, true)
    await expect(gmxFloor.connect(user0).burn(expandDecimals(1000, 18), "295000000000000000", user1.address))
      .to.be.revertedWith("BaseToken: burn amount exceeds balance")

    await gmx.connect(user1).transfer(user0.address, expandDecimals(1000, 18))
    await gmxFloor.connect(user0).burn(expandDecimals(1000, 18), "295000000000000000", user1.address)
  })

  it("signalApprove", async () => {
    await expect(gmxFloor.connect(user0).signalApprove(eth.address, user2.address, expandDecimals(5, 18)))
      .to.be.revertedWith("TokenManager: forbidden")

    await gmxFloor.connect(wallet).signalApprove(eth.address, user2.address, expandDecimals(5, 18))
  })

  it("signApprove", async () => {
    await expect(gmxFloor.connect(user0).signApprove(eth.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(gmxFloor.connect(signer2).signApprove(eth.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await gmxFloor.connect(wallet).signalApprove(eth.address, user2.address, expandDecimals(5, 18))

    await expect(gmxFloor.connect(user0).signApprove(eth.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await gmxFloor.connect(signer2).signApprove(eth.address, user2.address, expandDecimals(5, 18), 1)

    await expect(gmxFloor.connect(signer2).signApprove(eth.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("TokenManager: already signed")

    await gmxFloor.connect(signer1).signApprove(eth.address, user2.address, expandDecimals(5, 18), 1)
  })

  it("approve", async () => {
    await eth.mint(gmxFloor.address, expandDecimals(5, 18))

    await expect(gmxFloor.connect(user0).approve(eth.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(gmxFloor.connect(wallet).approve(eth.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await gmxFloor.connect(wallet).signalApprove(eth.address, user2.address, expandDecimals(5, 18))

    await expect(gmxFloor.connect(wallet).approve(gmx.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await expect(gmxFloor.connect(wallet).approve(eth.address, user0.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await expect(gmxFloor.connect(wallet).approve(eth.address, user2.address, expandDecimals(6, 18), 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await expect(gmxFloor.connect(wallet).approve(eth.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("TokenManager: action not authorized")

    await gmxFloor.connect(signer0).signApprove(eth.address, user2.address, expandDecimals(5, 18), 1)

    await expect(gmxFloor.connect(wallet).approve(eth.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("TokenManager: insufficient authorization")

    await gmxFloor.connect(signer2).signApprove(eth.address, user2.address, expandDecimals(5, 18), 1)

    await expect(eth.connect(user2).transferFrom(gmxFloor.address, user1.address, expandDecimals(4, 18)))
      .to.be.revertedWith("ERC20: transfer amount exceeds allowance")

    await gmxFloor.connect(wallet).approve(eth.address, user2.address, expandDecimals(5, 18), 1)

    await expect(eth.connect(user2).transferFrom(gmxFloor.address, user1.address, expandDecimals(6, 18)))
      .to.be.revertedWith("ERC20: transfer amount exceeds balance")

    expect(await eth.balanceOf(user1.address)).eq(0)
    await eth.connect(user2).transferFrom(gmxFloor.address, user1.address, expandDecimals(5, 18))
    expect(await eth.balanceOf(user1.address)).eq(expandDecimals(5, 18))
  })

  it("signalApproveNFT", async () => {
    await expect(gmxFloor.connect(user0).signalApproveNFT(eth.address, user2.address, nftId))
      .to.be.revertedWith("TokenManager: forbidden")

    await gmxFloor.connect(wallet).signalApproveNFT(eth.address, user2.address, nftId)
  })

  it("signApproveNFT", async () => {
    await expect(gmxFloor.connect(user0).signApproveNFT(eth.address, user2.address, nftId, 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(gmxFloor.connect(signer2).signApproveNFT(eth.address, user2.address, nftId, 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await gmxFloor.connect(wallet).signalApproveNFT(eth.address, user2.address, nftId)

    await expect(gmxFloor.connect(user0).signApproveNFT(eth.address, user2.address, nftId, 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await gmxFloor.connect(signer2).signApproveNFT(eth.address, user2.address, nftId, 1)

    await expect(gmxFloor.connect(signer2).signApproveNFT(eth.address, user2.address, nftId, 1))
      .to.be.revertedWith("TokenManager: already signed")

    await gmxFloor.connect(signer1).signApproveNFT(eth.address, user2.address, nftId, 1)
  })

  it("approveNFT", async () => {
    await nft0.mint(gmxFloor.address, nftId)
    await nft1.mint(gmxFloor.address, nftId)

    await expect(gmxFloor.connect(user0).approveNFT(nft0.address, user2.address, nftId, 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(gmxFloor.connect(wallet).approveNFT(nft0.address, user2.address, nftId, 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await gmxFloor.connect(wallet).signalApproveNFT(nft0.address, user2.address, nftId)

    await expect(gmxFloor.connect(wallet).approveNFT(nft1.address, user2.address, nftId, 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await expect(gmxFloor.connect(wallet).approveNFT(nft0.address, user0.address, nftId, 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await expect(gmxFloor.connect(wallet).approveNFT(nft0.address, user2.address, nftId + 1, 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await expect(gmxFloor.connect(wallet).approveNFT(nft0.address, user2.address, nftId, 1))
      .to.be.revertedWith("TokenManager: action not authorized")

    await gmxFloor.connect(signer0).signApproveNFT(nft0.address, user2.address, nftId, 1)

    await expect(gmxFloor.connect(wallet).approveNFT(nft0.address, user2.address, nftId, 1))
      .to.be.revertedWith("TokenManager: insufficient authorization")

    await gmxFloor.connect(signer2).signApproveNFT(nft0.address, user2.address, nftId, 1)

    await expect(nft0.connect(user2).transferFrom(gmxFloor.address, user1.address, nftId))
      .to.be.revertedWith("ERC721: transfer caller is not owner nor approved")

    await gmxFloor.connect(wallet).approveNFT(nft0.address, user2.address, nftId, 1)

    expect(await nft0.balanceOf(user1.address)).eq(0)
    expect(await nft0.balanceOf(gmxFloor.address)).eq(1)
    expect(await nft0.ownerOf(nftId)).eq(gmxFloor.address)

    await nft0.connect(user2).transferFrom(gmxFloor.address, user1.address, nftId)

    expect(await nft0.balanceOf(user1.address)).eq(1)
    expect(await nft0.balanceOf(gmxFloor.address)).eq(0)
    expect(await nft0.ownerOf(nftId)).eq(user1.address)

    await expect(nft0.connect(user2).transferFrom(gmxFloor.address, user1.address, nftId))
      .to.be.revertedWith("ERC721: transfer caller is not owner nor approved")
  })

  it("signalApproveNFTs", async () => {
    const nftId0 = 21
    const nftId1 = 22

    await expect(gmxFloor.connect(user0).signalApproveNFTs(nft0.address, user2.address, [nftId0, nftId1]))
      .to.be.revertedWith("TokenManager: forbidden")

    await gmxFloor.connect(wallet).signalApproveNFTs(nft0.address, user2.address, [nftId0, nftId1])
  })

  it("signApproveNFTs", async () => {
    const nftId0 = 21
    const nftId1 = 22

    await expect(gmxFloor.connect(user0).signApproveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(gmxFloor.connect(signer2).signApproveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await gmxFloor.connect(wallet).signalApproveNFTs(nft0.address, user2.address, [nftId0, nftId1])

    await expect(gmxFloor.connect(user0).signApproveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await gmxFloor.connect(signer2).signApproveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1)

    await expect(gmxFloor.connect(signer2).signApproveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1))
      .to.be.revertedWith("TokenManager: already signed")

    await gmxFloor.connect(signer1).signApproveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1)
  })

  it("approveNFTs", async () => {
    const nftId0 = 21
    const nftId1 = 22

    await nft0.mint(gmxFloor.address, nftId0)
    await nft0.mint(gmxFloor.address, nftId1)

    await expect(gmxFloor.connect(user0).approveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(gmxFloor.connect(wallet).approveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await gmxFloor.connect(wallet).signalApproveNFTs(nft0.address, user2.address, [nftId0, nftId1])

    await expect(gmxFloor.connect(wallet).approveNFTs(nft1.address, user2.address, [nftId0, nftId1], 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await expect(gmxFloor.connect(wallet).approveNFTs(nft0.address, user0.address, [nftId0, nftId1], 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await expect(gmxFloor.connect(wallet).approveNFTs(nft0.address, user2.address, [nftId0, nftId1 + 1], 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await expect(gmxFloor.connect(wallet).approveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1))
      .to.be.revertedWith("TokenManager: action not authorized")

    await gmxFloor.connect(signer0).signApproveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1)

    await expect(gmxFloor.connect(wallet).approveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1))
      .to.be.revertedWith("TokenManager: insufficient authorization")

    await gmxFloor.connect(signer2).signApproveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1)

    await expect(nft0.connect(user2).transferFrom(gmxFloor.address, user1.address, nftId0))
      .to.be.revertedWith("ERC721: transfer caller is not owner nor approved")

    await gmxFloor.connect(wallet).approveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1)

    expect(await nft0.balanceOf(user1.address)).eq(0)
    expect(await nft0.balanceOf(gmxFloor.address)).eq(2)
    expect(await nft0.ownerOf(nftId0)).eq(gmxFloor.address)
    expect(await nft0.ownerOf(nftId1)).eq(gmxFloor.address)

    await nft0.connect(user2).transferFrom(gmxFloor.address, user1.address, nftId0)

    expect(await nft0.balanceOf(user1.address)).eq(1)
    expect(await nft0.balanceOf(gmxFloor.address)).eq(1)
    expect(await nft0.ownerOf(nftId0)).eq(user1.address)
    expect(await nft0.ownerOf(nftId1)).eq(gmxFloor.address)

    await nft0.connect(user2).transferFrom(gmxFloor.address, user1.address, nftId1)

    expect(await nft0.balanceOf(user1.address)).eq(2)
    expect(await nft0.balanceOf(gmxFloor.address)).eq(0)
    expect(await nft0.ownerOf(nftId0)).eq(user1.address)
    expect(await nft0.ownerOf(nftId1)).eq(user1.address)
  })

  it("signalSetAdmin", async () => {
    await expect(gmxFloor.connect(user0).signalSetAdmin(timelock.address, user1.address))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(gmxFloor.connect(wallet).signalSetAdmin(timelock.address, user1.address))
      .to.be.revertedWith("TokenManager: forbidden")

    await gmxFloor.connect(signer0).signalSetAdmin(timelock.address, user1.address)
  })

  it("signSetAdmin", async () => {
    await expect(gmxFloor.connect(user0).signSetAdmin(timelock.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(gmxFloor.connect(wallet).signSetAdmin(timelock.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(gmxFloor.connect(signer1).signSetAdmin(timelock.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await gmxFloor.connect(signer1).signalSetAdmin(timelock.address, user1.address)

    await expect(gmxFloor.connect(user0).signSetAdmin(timelock.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(gmxFloor.connect(signer1).signSetAdmin(timelock.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: already signed")

    await gmxFloor.connect(signer2).signSetAdmin(timelock.address, user1.address, 1)

    await expect(gmxFloor.connect(signer2).signSetAdmin(timelock.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: already signed")
  })

  it("setAdmin", async () => {
    await expect(gmxFloor.connect(user0).setAdmin(timelock.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(gmxFloor.connect(wallet).setAdmin(timelock.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(gmxFloor.connect(signer0).setAdmin(timelock.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await gmxFloor.connect(signer0).signalSetAdmin(timelock.address, user1.address)

    await expect(gmxFloor.connect(signer0).setAdmin(user0.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await expect(gmxFloor.connect(signer0).setAdmin(timelock.address, user0.address, 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await expect(gmxFloor.connect(signer0).setAdmin(timelock.address, user1.address, 2))
      .to.be.revertedWith("TokenManager: action not signalled")

    await expect(gmxFloor.connect(signer0).setAdmin(timelock.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: insufficient authorization")

    await gmxFloor.connect(signer2).signSetAdmin(timelock.address, user1.address, 1)

    expect(await timelock.admin()).eq(wallet.address)
    await gmxFloor.connect(signer2).setAdmin(timelock.address, user1.address, 1)
    expect(await timelock.admin()).eq(user1.address)
  })
})
