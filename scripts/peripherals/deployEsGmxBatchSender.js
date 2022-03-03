const { getFrameSigner, deployContract, contractAt, sendTxn } = require("../shared/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

async function getArbValues() {
  const signer = await getFrameSigner()

  const esGmx = await contractAt("EsGMX", "0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA")
  const esGmxGov = await contractAt("Timelock", await esGmx.gov(), signer)
  const gmxVester = await contractAt("Vester", "0x199070DDfd1CFb69173aa2F7e20906F26B363004")
  const gmxVesterGov = await contractAt("Timelock", await gmxVester.gov(), signer)
  const glpVester = await contractAt("Vester", "0xA75287d2f8b217273E7FCD7E86eF07D33972042E")
  const glpVesterGov = await contractAt("Timelock", await glpVester.gov(), signer)

  return { esGmx, esGmxGov, gmxVester, gmxVesterGov, glpVester, glpVesterGov }
}

async function getAvaxValues() {
  const signer = await getFrameSigner()

  const esGmx = await contractAt("EsGMX", "0xFf1489227BbAAC61a9209A08929E4c2a526DdD17")
  const esGmxGov = await contractAt("Timelock", await esGmx.gov(), signer)
  const gmxVester = await contractAt("Vester", "0x472361d3cA5F49c8E633FB50385BfaD1e018b445")
  const gmxVesterGov = await contractAt("Timelock", await gmxVester.gov(), signer)
  const glpVester = await contractAt("Vester", "0x62331A7Bd1dfB3A7642B7db50B5509E57CA3154A")
  const glpVesterGov = await contractAt("Timelock", await glpVester.gov(), signer)

  return { esGmx, esGmxGov, gmxVester, gmxVesterGov, glpVester, glpVesterGov }
}

async function main() {
  const method = network === "arbitrum" ? getArbValues : getAvaxValues
  const { esGmx, esGmxGov, gmxVester, gmxVesterGov, glpVester, glpVesterGov } = await method()

  const esGmxBatchSender = await deployContract("EsGmxBatchSender", [esGmx.address])

  console.log("esGmx", esGmx.address)
  console.log("esGmxGov", esGmxGov.address)
  console.log("gmxVester", gmxVester.address)
  console.log("gmxVesterGov", gmxVesterGov.address)
  console.log("glpVester", glpVester.address)
  console.log("glpVesterGov", glpVesterGov.address)

  await sendTxn(esGmxGov.signalSetHandler(esGmx.address, esGmxBatchSender.address, true), "esGmxGov.signalSetHandler")
  await sendTxn(gmxVesterGov.signalSetHandler(gmxVester.address, esGmxBatchSender.address, true), "gmxVesterGov.signalSetHandler")
  await sendTxn(glpVesterGov.signalSetHandler(glpVester.address, esGmxBatchSender.address, true), "glpVesterGov.signalSetHandler")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
