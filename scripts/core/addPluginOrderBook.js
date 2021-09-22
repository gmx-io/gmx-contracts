const { contractAt , sendTxn, callWithRetries } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function main() {
  const router = await callWithRetries(contractAt, ["Router", "0x526f42EA12E167E36E3De747187f53b6989d121A"])

  await sendTxn(callWithRetries(router.addPlugin.bind(router), [
    "0x84B1FEA4A2c1e0C07f34755ac4cf5aD26a07485d"
  ]), "router.addPlugin")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
