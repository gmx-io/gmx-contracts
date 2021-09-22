const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function main() {
  const addresses = [
    "0x0EF0Cf825B8e9F89A43FfD392664131cFB4cfA89", // usdg yield tracker
    "0xd729d21EB85F8dBf3e0754f058024f20439a6AE9", // usdg reward distributor
    "0x82A012A9b3003b18B6bCd6052cbbef7Fa4892e80", // xgmt yield tracker
    "0x71d0F891a7e5A1D3526cB35589e37469380952c0", // xgmt reward distributor
    "0x3E8B08876c791dC880ADC8f965A02e53Bb9C0422", // gmt/usdg farm
    "0x08FAb024BEfcb6068847726b2eccEAd18b6c23Cd", // gmt/usdg xgmt yield tracker
    "0xA633158288520807F91CCC98aa58E0eA43ACB400", // gmt/usdg xgmt farm distributor
    "0xd8E26637B34B2487Cad1f91808878a391134C5c2", // gmt/usdg wbnb yield tracker
    "0x40aaDC15af652A790f18Eaf8EcA6228093d2F72E", // gmt/usdg wbnb farm distributor
    "0x68D7ee2A16AB7c0Ee1D670BECd144166d2Ae0759", // xgmt/usdg farm
    "0x026A02F7F26C1AFccb9Cba7C4df3Dc810F4e92e8", // xgmt/usdg xgmt yield tracker
    "0xd9b1C23411aDBB984B1C4BE515fAfc47a12898b2", // xgmt/usdg xgmt distributor
    "0x22458CEbD14a9679b2880147d08CA1ce5aa40E84", // xgmt/usdg wbnb yield tracker
    "0xB5EA6A50e7B9C5Aa640c7d5E6458a38E1718E8Cd" // xgmt/usdg wbnb distributor
  ]

  const gov = { address: "0x7918B81E119954488C00D2243A8BF2fa407ae87d" }
  for (let i = 0; i < addresses.length; i++) {
    const address = addresses[i]
    const contract = await contractAt("YieldToken", address)
    await sendTxn(contract.setGov(gov.address), `${i}: setGov`)
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
