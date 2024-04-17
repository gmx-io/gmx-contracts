const { contractAt , sendTxn, sleep } = require("../shared/helpers")
const { signExternally } = require("../shared/signer")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

const ACTION = {
  REMOVE_HANDLER: "REMOVE_HANDLER",
  REMOVE_MINTER: "REMOVE_MINTER"
}

async function getArbValues() {
  const actionList = [
    {
      action: ACTION.REMOVE_HANDLER,
      target: "0x908C4D94D34924765f1eDc22A1DD098397c59dD4",
      account: "0xc73d553473dC65CE56db96c58e6a091c20980fbA"
    },
    {
      action: ACTION.REMOVE_HANDLER,
      target: "0x908C4D94D34924765f1eDc22A1DD098397c59dD4",
      account: "0xA906F338CB21815cBc4Bc87ace9e68c87eF8d8F1"
    },
    {
      action: ACTION.REMOVE_HANDLER,
      target: "0x4d268a7d4C16ceB5a606c173Bd974984343fea13",
      account: "0xc73d553473dC65CE56db96c58e6a091c20980fbA"
    },
    {
      action: ACTION.REMOVE_HANDLER,
      target: "0x4d268a7d4C16ceB5a606c173Bd974984343fea13",
      account: "0xA906F338CB21815cBc4Bc87ace9e68c87eF8d8F1"
    },
    {
      action: ACTION.REMOVE_HANDLER,
      target: "0xd2D1162512F927a7e282Ef43a362659E4F2a728F",
      account: "0xc73d553473dC65CE56db96c58e6a091c20980fbA"
    },
    {
      action: ACTION.REMOVE_HANDLER,
      target: "0xd2D1162512F927a7e282Ef43a362659E4F2a728F",
      account: "0xA906F338CB21815cBc4Bc87ace9e68c87eF8d8F1"
    },
    {
      action: ACTION.REMOVE_HANDLER,
      target: "0x1aDDD80E6039594eE970E5872D247bf0414C8903",
      account: "0xc73d553473dC65CE56db96c58e6a091c20980fbA"
    },
    {
      action: ACTION.REMOVE_HANDLER,
      target: "0x1aDDD80E6039594eE970E5872D247bf0414C8903",
      account: "0xA906F338CB21815cBc4Bc87ace9e68c87eF8d8F1"
    },
    {
      action: ACTION.REMOVE_HANDLER,
      target: "0x4e971a87900b931fF39d1Aad67697F49835400b6",
      account: "0xc73d553473dC65CE56db96c58e6a091c20980fbA"
    },
    {
      action: ACTION.REMOVE_HANDLER,
      target: "0x4e971a87900b931fF39d1Aad67697F49835400b6",
      account: "0xA906F338CB21815cBc4Bc87ace9e68c87eF8d8F1"
    },
    {
      action: ACTION.REMOVE_HANDLER,
      target: "0x199070DDfd1CFb69173aa2F7e20906F26B363004",
      account: "0xA906F338CB21815cBc4Bc87ace9e68c87eF8d8F1"
    },
    {
      action: ACTION.REMOVE_HANDLER,
      target: "0xA75287d2f8b217273E7FCD7E86eF07D33972042E",
      account: "0xA906F338CB21815cBc4Bc87ace9e68c87eF8d8F1"
    },
    {
      action: ACTION.REMOVE_HANDLER,
      target: "0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA",
      account: "0xA906F338CB21815cBc4Bc87ace9e68c87eF8d8F1"
    },
    {
      action: ACTION.REMOVE_MINTER,
      target: "0x35247165119B69A40edD5304969560D0ef486921",
      account: "0xc73d553473dC65CE56db96c58e6a091c20980fbA"
    },
    {
      action: ACTION.REMOVE_MINTER,
      target: "0x35247165119B69A40edD5304969560D0ef486921",
      account: "0xA906F338CB21815cBc4Bc87ace9e68c87eF8d8F1"
    },
  ]

  return { actionList }
}

async function getAvaxValues() {
  return { actionList: [] }
}

async function getValues() {
  if (network === "arbitrum") {
    return getArbValues()
  }

  if (network === "avax") {
    return getAvaxValues()
  }
}

async function main() {
  const { actionList } = await getValues()
  const phase = process.env.PHASE
  if (phase !== "signal" && phase !== "finalize") {
    throw new Error("Invalid PHASE")
  }

  const signal = phase === "signal"

  for (let i = 0; i < actionList.length; i++) {
    const item = actionList[i]

    const governable = await contractAt("Governable", item.target)
    const timelock = await contractAt("Timelock", await governable.gov())

    if (item.action === ACTION.REMOVE_HANDLER) {
      const method = signal ? "signalSetHandler" : "setHandler"
      console.log(`${method}(${item.target}, ${item.account}, false)`)
      await signExternally(await timelock.populateTransaction[method](item.target, item.account, false))
    } else if (item.action === ACTION.REMOVE_MINTER) {
      const method = signal ? "signalSetMinter" : "setMinter"
      console.log(`${method}(${item.target}, ${item.account}, false)`)
      await signExternally(await timelock.populateTransaction[method](item.target, item.account, false))
    } else {
      throw new Error("Unsupported action")
    }
  }
}

main().catch((ex) => {
  console.error(ex);
  process.exit(1);
});
