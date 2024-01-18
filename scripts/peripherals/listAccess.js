const { contractAt , sendTxn, sleep } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');


async function getArbValues() {
  const allContractsList = require("../../data/contractList/arbitrum.json")
  const contractInfoList = [
    // Vault methods: isManager
    ["Vault", "0x489ee077994B6658eAfA855C308275EAd8097C4A", "Vault"],
    // RewardTracker methods: isHandler
    ["StakedGmxTracker", "0x908C4D94D34924765f1eDc22A1DD098397c59dD4", "RewardTracker"],
    ["BonusGmxTracker", "0x4d268a7d4C16ceB5a606c173Bd974984343fea13", "RewardTracker"],
    ["FeeGmxTracker", "0xd2D1162512F927a7e282Ef43a362659E4F2a728F", "RewardTracker"],
    ["StakedGlpTracker", "0x1aDDD80E6039594eE970E5872D247bf0414C8903", "RewardTracker"],
    ["FeeGlpTracker", "0x4e971a87900b931fF39d1Aad67697F49835400b6", "RewardTracker"],
    // Vester methods: isHandler
    ["GmxVester", "0x199070DDfd1CFb69173aa2F7e20906F26B363004", "Vester"],
    ["GlpVester", "0xA75287d2f8b217273E7FCD7E86eF07D33972042E", "Vester"],
    // GlpManager methods: isHandler
    ["Old GlpManager", "0x321F653eED006AD1C29D174e17d96351BDe22649", "GlpManager"],
    ["New GlpManager", "0x3963FfC9dff443c2A94f21b129D429891E32ec18", "GlpManager"],
    // MintableBaseToken methods: isHandler, isMinter
    ["GLP", "0x4277f8F2c384827B5273592FF7CeBd9f2C1ac258", "MintableBaseToken"],
    ["GMX", "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a", "MintableBaseToken"],
    ["ES_GMX", "0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA", "MintableBaseToken"],
    ["BN_GMX", "0x35247165119B69A40edD5304969560D0ef486921", "MintableBaseToken"],
    // USDG methods: vaults
    ["USDG", "0x45096e7aA921f27590f8F19e457794EB09678141", "USDG"],
    // Timelock methods: isHandler
    ["Timelock", "0xe7E740Fa40CA16b15B621B49de8E9F0D69CF4858", "Timelock"]
  ]

  return { allContractsList, contractInfoList }
}

async function getAvaxValues() {
  const allContractsList = require("../../data/contractList/avalanche.json")
  const contractInfoList = [
    // Vault methods: isManager
    ["Vault", "0x9ab2De34A33fB459b538c43f251eB825645e8595", "Vault"],
    // RewardTracker methods: isHandler
    ["StakedGmxTracker", "0x2bD10f8E93B3669b6d42E74eEedC65dd1B0a1342", "RewardTracker"],
    ["BonusGmxTracker", "0x908C4D94D34924765f1eDc22A1DD098397c59dD4", "RewardTracker"],
    ["FeeGmxTracker", "0x4d268a7d4C16ceB5a606c173Bd974984343fea13", "RewardTracker"],
    ["StakedGlpTracker", "0x9e295B5B976a184B14aD8cd72413aD846C299660", "RewardTracker"],
    ["FeeGlpTracker", "0xd2D1162512F927a7e282Ef43a362659E4F2a728F", "RewardTracker"],
    // Vester methods: isHandler
    ["GmxVester", "0x472361d3cA5F49c8E633FB50385BfaD1e018b445", "Vester"],
    ["GlpVester", "0x62331A7Bd1dfB3A7642B7db50B5509E57CA3154A", "Vester"],
    // GlpManager methods: isHandler
    ["Old GlpManager", "0xe1ae4d4b06A5Fe1fc288f6B4CD72f9F8323B107F", "GlpManager"],
    ["New GlpManager", "0xD152c7F25db7F4B95b7658323c5F33d176818EE4", "GlpManager"],
    // MintableBaseToken methods: isHandler, isMinter
    ["GLP", "0x01234181085565ed162a948b6a5e88758CD7c7b8", "MintableBaseToken"],
    ["GMX", "0x62edc0692BD897D2295872a9FFCac5425011c661", "MintableBaseToken"],
    ["ES_GMX", "0xFf1489227BbAAC61a9209A08929E4c2a526DdD17", "MintableBaseToken"],
    ["BN_GMX", "0x8087a341D32D445d9aC8aCc9c14F5781E04A26d2", "MintableBaseToken"],
    // USDG methods: vaults
    ["USDG", "0xc0253c3cC6aa5Ab407b5795a04c28fB063273894", "USDG"],
    // Timelock methods: isHandler
    ["Timelock", "0x8Ea12810271a0fD70bBEB8614B8735621abC3718", "Timelock"]
  ]

  return { allContractsList, contractInfoList }
}

async function getValues() {
  if (network === "arbitrum") {
    return getArbValues()
  }

  if (network === "avax") {
    return getAvaxValues()
  }
}

async function getAccessList({ contract, accountList, method }) {
  let index = 0
  const batchSize = 10

  const accessList = []

  while (true) {
    console.log("checking", index)
    const accountListBatch = accountList.slice(index, index + batchSize)
    if (accountListBatch.length === 0) {
      break
    }

    try {
      const promises = accountListBatch.map((account) => contract[method](account.address))
      const results = await Promise.all(promises)

      for (let i = 0; i < results.length; i++) {
        if (results[i] === true) {
          accessList.push(accountListBatch[i].address)
        }
      }
    } catch (e) {
      console.error("error", e)
      await sleep(5000)
    }

    index += batchSize
  }

  return accessList
}

async function main() {
  const {
    allContractsList,
    contractInfoList
  } = await getValues()

  const accessMethods = {
    "Vault": ["isManager"],
    "RewardTracker": ["isHandler"],
    "Vester": ["isHandler"],
    "GlpManager": ["isHandler"],
    "MintableBaseToken": ["isHandler", "isMinter"],
    "USDG": ["vaults"],
    "Timelock": ["isHandler"],
  }

  const contractAccessList = []

  for (let i = 0; i < contractInfoList.length; i++) {
    const contractInfo = contractInfoList[i]
    const [contractLabel, contractAddress, contractName] = contractInfo
    const methods = accessMethods[contractName]
    const contract = await contractAt(contractName, contractAddress)

    for (let j = 0; j < methods.length; j++) {
      const method = methods[j]
      console.log("checking", contractLabel, contractAddress, method)
      const accessList = await getAccessList({
        contract,
        accountList: allContractsList,
        method
      })

      for (let k = 0; k < accessList.length; k++) {
        const accessor = accessList[k]
        console.log(contractLabel, contractAddress, method, accessor)
        contractAccessList.push({
          contractLabel,
          contractAddress,
          method,
          accessor
        })
      }
    }
  }

  console.log("\n")

  for (let i = 0; i < contractAccessList.length; i++) {
    const info = contractAccessList[i]
    console.log([info.contractLabel, info.contractAddress, info.method, info.accessor].join(","))
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
