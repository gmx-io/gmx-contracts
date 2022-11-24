const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed, print } = require("../shared/utilities")
const { toChainlinkPrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")

use(solidity)

const { AddressZero } = ethers.constants

describe("TokenManager", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3, signer0, signer1, signer2] = provider.getWallets()
  let gmx
  let eth
  let tokenManager
  let timelock
  let gmxTimelock
  let nft0
  let nft1
  const nftId = 17

  beforeEach(async () => {
    gmx = await deployContract("GMX", [])
    eth = await deployContract("Token", [])
    tokenManager = await deployContract("TokenManager", [2])

    await tokenManager.initialize([signer0.address, signer1.address, signer2.address])

    nft0 = await deployContract("ERC721", ["NFT0", "NFT0"])
    nft1 = await deployContract("ERC721", ["NFT1", "NFT1"])

    timelock = await deployContract("Timelock", [
      wallet.address, // admin
      5 * 24 * 60 * 60, // buffer
      tokenManager.address, // tokenManager
      user2.address, // mintReceiver
      user0.address, // glpManager
      user1.address, // rewardRouter
      expandDecimals(1000, 18), // maxTokenSupply
      10, // marginFeeBasisPoints
      100 // maxMarginFeeBasisPoints
    ])

    gmxTimelock = await deployContract("GmxTimelock", [
      wallet.address,
      5 * 24 * 60 * 60,
      7 * 24 * 60 * 60,
      user0.address,
      tokenManager.address,
      user2.address,
      expandDecimals(1000, 18)
    ])
  })

  it("inits", async () => {
    await expect(tokenManager.initialize([signer0.address, signer1.address, signer2.address]))
      .to.be.revertedWith("TokenManager: already initialized")

    expect(await tokenManager.signers(0)).eq(signer0.address)
    expect(await tokenManager.signers(1)).eq(signer1.address)
    expect(await tokenManager.signers(2)).eq(signer2.address)
    expect(await tokenManager.signersLength()).eq(3)

    expect(await tokenManager.isSigner(user0.address)).eq(false)
    expect(await tokenManager.isSigner(signer0.address)).eq(true)
    expect(await tokenManager.isSigner(signer1.address)).eq(true)
    expect(await tokenManager.isSigner(signer2.address)).eq(true)
  })

  it("signalApprove", async () => {
    await expect(tokenManager.connect(user0).signalApprove(eth.address, user2.address, expandDecimals(5, 18)))
      .to.be.revertedWith("TokenManager: forbidden")

    await tokenManager.connect(wallet).signalApprove(eth.address, user2.address, expandDecimals(5, 18))
  })

  it("signApprove", async () => {
    await expect(tokenManager.connect(user0).signApprove(eth.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(tokenManager.connect(signer2).signApprove(eth.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await tokenManager.connect(wallet).signalApprove(eth.address, user2.address, expandDecimals(5, 18))

    await expect(tokenManager.connect(user0).signApprove(eth.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await tokenManager.connect(signer2).signApprove(eth.address, user2.address, expandDecimals(5, 18), 1)

    await expect(tokenManager.connect(signer2).signApprove(eth.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("TokenManager: already signed")

    await tokenManager.connect(signer1).signApprove(eth.address, user2.address, expandDecimals(5, 18), 1)
  })

  it("approve", async () => {
    await eth.mint(tokenManager.address, expandDecimals(5, 18))

    await expect(tokenManager.connect(user0).approve(eth.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(tokenManager.connect(wallet).approve(eth.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await tokenManager.connect(wallet).signalApprove(eth.address, user2.address, expandDecimals(5, 18))

    await expect(tokenManager.connect(wallet).approve(gmx.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await expect(tokenManager.connect(wallet).approve(eth.address, user0.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await expect(tokenManager.connect(wallet).approve(eth.address, user2.address, expandDecimals(6, 18), 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await expect(tokenManager.connect(wallet).approve(eth.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("TokenManager: action not authorized")

    await tokenManager.connect(signer0).signApprove(eth.address, user2.address, expandDecimals(5, 18), 1)

    await expect(tokenManager.connect(wallet).approve(eth.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("TokenManager: insufficient authorization")

    await tokenManager.connect(signer2).signApprove(eth.address, user2.address, expandDecimals(5, 18), 1)

    await expect(eth.connect(user2).transferFrom(tokenManager.address, user1.address, expandDecimals(4, 18)))
      .to.be.revertedWith("ERC20: transfer amount exceeds allowance")

    await tokenManager.connect(wallet).approve(eth.address, user2.address, expandDecimals(5, 18), 1)

    await expect(eth.connect(user2).transferFrom(tokenManager.address, user1.address, expandDecimals(6, 18)))
      .to.be.revertedWith("ERC20: transfer amount exceeds balance")

    expect(await eth.balanceOf(user1.address)).eq(0)
    await eth.connect(user2).transferFrom(tokenManager.address, user1.address, expandDecimals(5, 18))
    expect(await eth.balanceOf(user1.address)).eq(expandDecimals(5, 18))
  })

  it("signalApproveNFT", async () => {
    await expect(tokenManager.connect(user0).signalApproveNFT(eth.address, user2.address, nftId))
      .to.be.revertedWith("TokenManager: forbidden")

    await tokenManager.connect(wallet).signalApproveNFT(eth.address, user2.address, nftId)
  })

  it("signApproveNFT", async () => {
    await expect(tokenManager.connect(user0).signApproveNFT(eth.address, user2.address, nftId, 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(tokenManager.connect(signer2).signApproveNFT(eth.address, user2.address, nftId, 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await tokenManager.connect(wallet).signalApproveNFT(eth.address, user2.address, nftId)

    await expect(tokenManager.connect(user0).signApproveNFT(eth.address, user2.address, nftId, 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await tokenManager.connect(signer2).signApproveNFT(eth.address, user2.address, nftId, 1)

    await expect(tokenManager.connect(signer2).signApproveNFT(eth.address, user2.address, nftId, 1))
      .to.be.revertedWith("TokenManager: already signed")

    await tokenManager.connect(signer1).signApproveNFT(eth.address, user2.address, nftId, 1)
  })

  it("approveNFT", async () => {
    await nft0.mint(tokenManager.address, nftId)
    await nft1.mint(tokenManager.address, nftId)

    await expect(tokenManager.connect(user0).approveNFT(nft0.address, user2.address, nftId, 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(tokenManager.connect(wallet).approveNFT(nft0.address, user2.address, nftId, 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await tokenManager.connect(wallet).signalApproveNFT(nft0.address, user2.address, nftId)

    await expect(tokenManager.connect(wallet).approveNFT(nft1.address, user2.address, nftId, 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await expect(tokenManager.connect(wallet).approveNFT(nft0.address, user0.address, nftId, 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await expect(tokenManager.connect(wallet).approveNFT(nft0.address, user2.address, nftId + 1, 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await expect(tokenManager.connect(wallet).approveNFT(nft0.address, user2.address, nftId, 1))
      .to.be.revertedWith("TokenManager: action not authorized")

    await tokenManager.connect(signer0).signApproveNFT(nft0.address, user2.address, nftId, 1)

    await expect(tokenManager.connect(wallet).approveNFT(nft0.address, user2.address, nftId, 1))
      .to.be.revertedWith("TokenManager: insufficient authorization")

    await tokenManager.connect(signer2).signApproveNFT(nft0.address, user2.address, nftId, 1)

    await expect(nft0.connect(user2).transferFrom(tokenManager.address, user1.address, nftId))
      .to.be.revertedWith("ERC721: transfer caller is not owner nor approved")

    await tokenManager.connect(wallet).approveNFT(nft0.address, user2.address, nftId, 1)

    expect(await nft0.balanceOf(user1.address)).eq(0)
    expect(await nft0.balanceOf(tokenManager.address)).eq(1)
    expect(await nft0.ownerOf(nftId)).eq(tokenManager.address)

    await nft0.connect(user2).transferFrom(tokenManager.address, user1.address, nftId)

    expect(await nft0.balanceOf(user1.address)).eq(1)
    expect(await nft0.balanceOf(tokenManager.address)).eq(0)
    expect(await nft0.ownerOf(nftId)).eq(user1.address)

    await expect(nft0.connect(user2).transferFrom(tokenManager.address, user1.address, nftId))
      .to.be.revertedWith("ERC721: transfer caller is not owner nor approved")
  })

  it("signalApproveNFTs", async () => {
    const nftId0 = 21
    const nftId1 = 22

    await expect(tokenManager.connect(user0).signalApproveNFTs(nft0.address, user2.address, [nftId0, nftId1]))
      .to.be.revertedWith("TokenManager: forbidden")

    await tokenManager.connect(wallet).signalApproveNFTs(nft0.address, user2.address, [nftId0, nftId1])
  })

  it("signApproveNFTs", async () => {
    const nftId0 = 21
    const nftId1 = 22

    await expect(tokenManager.connect(user0).signApproveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(tokenManager.connect(signer2).signApproveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await tokenManager.connect(wallet).signalApproveNFTs(nft0.address, user2.address, [nftId0, nftId1])

    await expect(tokenManager.connect(user0).signApproveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await tokenManager.connect(signer2).signApproveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1)

    await expect(tokenManager.connect(signer2).signApproveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1))
      .to.be.revertedWith("TokenManager: already signed")

    await tokenManager.connect(signer1).signApproveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1)
  })

  it("approveNFTs", async () => {
    const nftId0 = 21
    const nftId1 = 22

    await nft0.mint(tokenManager.address, nftId0)
    await nft0.mint(tokenManager.address, nftId1)

    await expect(tokenManager.connect(user0).approveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(tokenManager.connect(wallet).approveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await tokenManager.connect(wallet).signalApproveNFTs(nft0.address, user2.address, [nftId0, nftId1])

    await expect(tokenManager.connect(wallet).approveNFTs(nft1.address, user2.address, [nftId0, nftId1], 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await expect(tokenManager.connect(wallet).approveNFTs(nft0.address, user0.address, [nftId0, nftId1], 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await expect(tokenManager.connect(wallet).approveNFTs(nft0.address, user2.address, [nftId0, nftId1 + 1], 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await expect(tokenManager.connect(wallet).approveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1))
      .to.be.revertedWith("TokenManager: action not authorized")

    await tokenManager.connect(signer0).signApproveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1)

    await expect(tokenManager.connect(wallet).approveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1))
      .to.be.revertedWith("TokenManager: insufficient authorization")

    await tokenManager.connect(signer2).signApproveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1)

    await expect(nft0.connect(user2).transferFrom(tokenManager.address, user1.address, nftId0))
      .to.be.revertedWith("ERC721: transfer caller is not owner nor approved")

    await tokenManager.connect(wallet).approveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1)

    expect(await nft0.balanceOf(user1.address)).eq(0)
    expect(await nft0.balanceOf(tokenManager.address)).eq(2)
    expect(await nft0.ownerOf(nftId0)).eq(tokenManager.address)
    expect(await nft0.ownerOf(nftId1)).eq(tokenManager.address)

    await nft0.connect(user2).transferFrom(tokenManager.address, user1.address, nftId0)

    expect(await nft0.balanceOf(user1.address)).eq(1)
    expect(await nft0.balanceOf(tokenManager.address)).eq(1)
    expect(await nft0.ownerOf(nftId0)).eq(user1.address)
    expect(await nft0.ownerOf(nftId1)).eq(tokenManager.address)

    await nft0.connect(user2).transferFrom(tokenManager.address, user1.address, nftId1)

    expect(await nft0.balanceOf(user1.address)).eq(2)
    expect(await nft0.balanceOf(tokenManager.address)).eq(0)
    expect(await nft0.ownerOf(nftId0)).eq(user1.address)
    expect(await nft0.ownerOf(nftId1)).eq(user1.address)
  })

  it("receiveNFTs", async () => {
    const nftId0 = 21
    const nftId1 = 22

    await nft0.mint(tokenManager.address, nftId0)
    await nft0.mint(tokenManager.address, nftId1)

    const tokenManager2 = await deployContract("TokenManager", [2])
    await tokenManager2.initialize([signer0.address, signer1.address, signer2.address])

    await tokenManager.connect(wallet).signalApproveNFTs(nft0.address, tokenManager2.address, [nftId0, nftId1])
    await tokenManager.connect(signer0).signApproveNFTs(nft0.address, tokenManager2.address, [nftId0, nftId1], 1)
    await tokenManager.connect(signer2).signApproveNFTs(nft0.address, tokenManager2.address, [nftId0, nftId1], 1)

    await expect(tokenManager2.receiveNFTs(nft0.address, tokenManager.address, [nftId0, nftId1]))
      .to.be.revertedWith("ERC721: transfer caller is not owner nor approved")

    await tokenManager.connect(wallet).approveNFTs(nft0.address, tokenManager2.address, [nftId0, nftId1], 1)

    expect(await nft0.balanceOf(tokenManager.address)).eq(2)
    expect(await nft0.balanceOf(tokenManager2.address)).eq(0)
    expect(await nft0.ownerOf(nftId0)).eq(tokenManager.address)
    expect(await nft0.ownerOf(nftId1)).eq(tokenManager.address)

    await tokenManager2.receiveNFTs(nft0.address, tokenManager.address, [nftId0, nftId1])

    expect(await nft0.balanceOf(tokenManager.address)).eq(0)
    expect(await nft0.balanceOf(tokenManager2.address)).eq(2)
    expect(await nft0.ownerOf(nftId0)).eq(tokenManager2.address)
    expect(await nft0.ownerOf(nftId1)).eq(tokenManager2.address)
  })

  it("signalSetAdmin", async () => {
    await expect(tokenManager.connect(user0).signalSetAdmin(timelock.address, user1.address))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(tokenManager.connect(wallet).signalSetAdmin(timelock.address, user1.address))
      .to.be.revertedWith("TokenManager: forbidden")

    await tokenManager.connect(signer0).signalSetAdmin(timelock.address, user1.address)
  })

  it("signSetAdmin", async () => {
    await expect(tokenManager.connect(user0).signSetAdmin(timelock.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(tokenManager.connect(wallet).signSetAdmin(timelock.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(tokenManager.connect(signer1).signSetAdmin(timelock.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await tokenManager.connect(signer1).signalSetAdmin(timelock.address, user1.address)

    await expect(tokenManager.connect(user0).signSetAdmin(timelock.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(tokenManager.connect(signer1).signSetAdmin(timelock.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: already signed")

    await tokenManager.connect(signer2).signSetAdmin(timelock.address, user1.address, 1)

    await expect(tokenManager.connect(signer2).signSetAdmin(timelock.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: already signed")
  })

  it("setAdmin", async () => {
    await expect(tokenManager.connect(user0).setAdmin(timelock.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(tokenManager.connect(wallet).setAdmin(timelock.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(tokenManager.connect(signer0).setAdmin(timelock.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await tokenManager.connect(signer0).signalSetAdmin(timelock.address, user1.address)

    await expect(tokenManager.connect(signer0).setAdmin(user0.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await expect(tokenManager.connect(signer0).setAdmin(timelock.address, user0.address, 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await expect(tokenManager.connect(signer0).setAdmin(timelock.address, user1.address, 2))
      .to.be.revertedWith("TokenManager: action not signalled")

    await expect(tokenManager.connect(signer0).setAdmin(timelock.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: insufficient authorization")

    await tokenManager.connect(signer2).signSetAdmin(timelock.address, user1.address, 1)

    expect(await timelock.admin()).eq(wallet.address)
    await tokenManager.connect(signer2).setAdmin(timelock.address, user1.address, 1)
    expect(await timelock.admin()).eq(user1.address)
  })

  it("signalSetGov", async () => {
    await expect(tokenManager.connect(user0).signalSetGov(timelock.address, gmx.address, user1.address))
      .to.be.revertedWith("TokenManager: forbidden")

    await tokenManager.connect(wallet).signalSetGov(timelock.address, gmx.address, user1.address)
  })

  it("signSetGov", async () => {
    await expect(tokenManager.connect(user0).signSetGov(timelock.address, gmx.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(tokenManager.connect(signer2).signSetGov(timelock.address, gmx.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await tokenManager.connect(wallet).signalSetGov(timelock.address, gmx.address, user1.address)

    await expect(tokenManager.connect(user0).signSetGov(timelock.address, gmx.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await tokenManager.connect(signer2).signSetGov(timelock.address, gmx.address, user1.address, 1)

    await expect(tokenManager.connect(signer2).signSetGov(timelock.address, gmx.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: already signed")

    await tokenManager.connect(signer1).signSetGov(timelock.address, gmx.address, user1.address, 1)
  })

  it("setGov", async () => {
    await gmx.setGov(gmxTimelock.address)

    await expect(tokenManager.connect(user0).setGov(gmxTimelock.address, gmx.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: forbidden")

    await expect(tokenManager.connect(wallet).setGov(gmxTimelock.address, gmx.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await tokenManager.connect(wallet).signalSetGov(gmxTimelock.address, gmx.address, user1.address)

    await expect(tokenManager.connect(wallet).setGov(user2.address, gmx.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await expect(tokenManager.connect(wallet).setGov(gmxTimelock.address, user0.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await expect(tokenManager.connect(wallet).setGov(gmxTimelock.address, gmx.address, user2.address, 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await expect(tokenManager.connect(wallet).setGov(gmxTimelock.address, gmx.address, user1.address, 1 + 1))
      .to.be.revertedWith("TokenManager: action not signalled")

    await expect(tokenManager.connect(wallet).setGov(gmxTimelock.address, gmx.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: action not authorized")

    await tokenManager.connect(signer0).signSetGov(gmxTimelock.address, gmx.address, user1.address, 1)

    await expect(tokenManager.connect(wallet).setGov(gmxTimelock.address, gmx.address, user1.address, 1))
      .to.be.revertedWith("TokenManager: insufficient authorization")

    await expect(gmxTimelock.connect(wallet).signalSetGov(gmx.address, user1.address))
      .to.be.revertedWith("GmxTimelock: forbidden")

    await tokenManager.connect(signer2).signSetGov(gmxTimelock.address, gmx.address, user1.address, 1)

    await expect(gmxTimelock.connect(wallet).setGov(gmx.address, user1.address))
      .to.be.revertedWith("GmxTimelock: action not signalled")

    await tokenManager.connect(wallet).setGov(gmxTimelock.address, gmx.address, user1.address, 1)

    await expect(gmxTimelock.connect(wallet).setGov(gmx.address, user1.address))
      .to.be.revertedWith("GmxTimelock: action time not yet passed")

    await increaseTime(provider, 6 * 24 * 60 * 60 + 10)
    await mineBlock(provider)

    await expect(gmxTimelock.connect(wallet).setGov(gmx.address, user1.address))
      .to.be.revertedWith("GmxTimelock: action time not yet passed")

    await increaseTime(provider, 1 * 24 * 60 * 60 + 10)
    await mineBlock(provider)

    expect(await gmx.gov()).eq(gmxTimelock.address)
    await gmxTimelock.connect(wallet).setGov(gmx.address, user1.address)
    expect(await gmx.gov()).eq(user1.address)
  })
})
