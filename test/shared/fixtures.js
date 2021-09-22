const { expandDecimals } = require("./utilities")

async function deployContract(name, args) {
  const contractFactory = await ethers.getContractFactory(name)
  return await contractFactory.deploy(...args)
}

async function contractAt(name, address) {
  const contractFactory = await ethers.getContractFactory(name)
  return await contractFactory.attach(address)
}

module.exports = {
  deployContract,
  contractAt
}
