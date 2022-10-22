const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const {
  ARBITRUM_SERVER_ADMIN_API_KEY,
  ARBITRUM_FEE_URL,
  AVAX_SERVER_ADMIN_API_KEY,
  AVAX_FEE_URL,
} = require("../../env.json")

const { postFees } = require("./updateFees")

async function getArbValues() {
  const apiKey = ARBITRUM_SERVER_ADMIN_API_KEY
  const feeUrl = ARBITRUM_FEE_URL
  const feeUsdRows = [
    { to: 1630514845, feeUsd: "32.47" },
    { to: 1631074048, feeUsd: "50681" },
    { to: 1631677736, feeUsd: "124400.69" },
    { to: 1632278435, feeUsd: "395299.56" },
    { to: 1632885416, feeUsd: "348555.88" },
    { to: 1633507067, feeUsd: "302888.51" },
    { to: 1634095073, feeUsd: "325532.14" },
    { to: 1634701754, feeUsd: "524688.53" },
    { to: 1635301669, feeUsd: "727989.27" },
    { to: 1635914306, feeUsd: "815838.37" },
    { to: 1636517248, feeUsd: "1017108.52" },
    { to: 1637118096, feeUsd: "1195695.02" },
    { to: 1637728323, feeUsd: "611495.04" },
    { to: 1638330376, feeUsd: "1002226.96" },
    { to: 1638931348, feeUsd: "1225801.74" },
    { to: 1639538283, feeUsd: "638755.06" },
    { to: 1640135388, feeUsd: "692132.12" },
    { to: 1640740756, feeUsd: "653857.89" },
    { to: 1641353998, feeUsd: "932273.45" },
    { to: 1641954606, feeUsd: "2010194.53" },
    { to: 1642557002, feeUsd: "1424176.23" },
    { to: 1643166233, feeUsd: "2131480.58" },
    { to: 1643765386, feeUsd: "1184435.13" },
    { to: 1644371345, feeUsd: "1205134.15" },
    { to: 1644979161, feeUsd: "1206960.25" },
    { to: 1645579656, feeUsd: "527326.47" },
    { to: 1646182611, feeUsd: "2007742.56" },
    { to: 1646788756, feeUsd: "2181383.87" },
    { to: 1647402638, feeUsd: "1060151.47" },
    { to: 1648000826, feeUsd: "1386779.30" },
    { to: 1648611300, feeUsd: "1474852.84" },
    { to: 1649207110, feeUsd: "1882364.25" },
    { to: 1649814371, feeUsd: "2225265.28" },
    { to: 1650420021, feeUsd: "1135279.21" },
    { to: 1651028602, feeUsd: "716772.48" },
    { to: 1651635145, feeUsd: "820730.6" },
    { to: 1652236772, feeUsd: "1833127.03" },
    { to: 1652840724, feeUsd: "1931425.93" },
    { to: 1653430967, feeUsd: "877425.89" },
    { to: 1654053714, feeUsd: "1413630.45" },
    { to: 1654653280, feeUsd: "461654.58" },
    { to: 1655259566, feeUsd: "1517706.31" },
    { to: 1655866071, feeUsd: "1039442.84" },
    { to: 1656472723, feeUsd: "493000.42" },
    { to: 1657074613, feeUsd: "721743.61" },
    { to: 1657678876, feeUsd: "695772.71" },
    { to: 1658283954, feeUsd: "1252312.35" },
    { to: 1658886078, feeUsd: "1058461.3" },
    { to: 1659494426, feeUsd: "1772773.67" },
    { to: 1660095134, feeUsd: "877279.21" },
    { to: 1660698120, feeUsd: "1729561.45" },
    { to: 1661309954, feeUsd: "2163583.24" },
    { to: 1661907895, feeUsd: "2245327.53" },
    { to: 1662518119, feeUsd: "2097773.87" },
    { to: 1663124371, feeUsd: "3151643.25" },
    { to: 1663724917, feeUsd: "3338906.37" },
    { to: 1664330339, feeUsd: "2335882.78" },
    { to: 1664940505, feeUsd: "1599769.02" },
  ]

  return { apiKey, feeUrl, feeUsdRows }
}

async function getAvaxValues() {
  const apiKey = AVAX_SERVER_ADMIN_API_KEY
  const feeUrl = AVAX_FEE_URL
  const feeUsdRows = [
    { to: 1641430800, feeUsd: "10" },
    { to: 1641954606, feeUsd: "506934.29" },
    { to: 1642557082, feeUsd: "871367.91" },
    { to: 1643166266, feeUsd: "1416130.81" },
    { to: 1643765429, feeUsd: "996296.58" },
    { to: 1644371345, feeUsd: "869493.46" },
    { to: 1644979198, feeUsd: "644299.54" },
    { to: 1645579694, feeUsd: "559829.67" },
    { to: 1646182633, feeUsd: "1041033.13" },
    { to: 1646788780, feeUsd: "525648.29" },
    { to: 1647402672, feeUsd: "491566.54" },
    { to: 1648000896, feeUsd: "523412.47" },
    { to: 1648611331, feeUsd: "482364.71" },
    { to: 1649207157, feeUsd: "819772.21" },
    { to: 1649814371, feeUsd: "536680.30" },
    { to: 1650420021, feeUsd: "297644.50" },
    { to: 1651028602, feeUsd: "329239.03" },
    { to: 1651635172, feeUsd: "344748.08" },
    { to: 1652236772, feeUsd: "809852.39" },
    { to: 1652840724, feeUsd: "850963.06" },
    { to: 1653430967, feeUsd: "306245.8" },
    { to: 1654053714, feeUsd: "539435.12" },
    { to: 1654653280, feeUsd: "840894.12" },
    { to: 1655259566, feeUsd: "506009.43" },
    { to: 1655866071, feeUsd: "526660.33" },
    { to: 1656472723, feeUsd: "448733.62" },
    { to: 1657074613, feeUsd: "392029.38" },
    { to: 1657678876, feeUsd: "348157.7" },
    { to: 1658283954, feeUsd: "475489.0" },
    { to: 1658886078, feeUsd: "528324.14" },
    { to: 1659494426, feeUsd: "411807.72" },
    { to: 1660095134, feeUsd: "373497.82" },
    { to: 1660698120, feeUsd: "484879.32" },
    { to: 1661309954, feeUsd: "426656.64" },
    { to: 1661907895, feeUsd: "494117.94" },
    { to: 1662518119, feeUsd: "310085.65" },
    { to: 1663124371, feeUsd: "435866.01" },
    { to: 1663724917, feeUsd: "515306.4" },
    { to: 1664330339, feeUsd: "296691.45" },
    { to: 1664940505, feeUsd: "203684.13" },
  ]

  return { apiKey, feeUrl, feeUsdRows }
}

async function getNetworkValues() {
  return [
    await getArbValues(),
    // await getAvaxValues()
  ]
}

async function main() {
  const networkValues = await getNetworkValues()
  for (let i = 0; i < networkValues.length; i++) {
    const { apiKey, feeUrl, feeUsdRows } = networkValues[i]
    for (let j = 0; j < feeUsdRows.length; j++) {
      const feeUsdRow = feeUsdRows[j]

      await postFees({
        apiKey,
        feeUrl,
        feeUsd: feeUsdRow.feeUsd,
        timestamp: feeUsdRow.to
      })
    }
  }
}

main()
