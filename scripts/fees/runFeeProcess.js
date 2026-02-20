const { createFeePlan } = require("./createFeePlanUtils")
const { distributeFees } = require("./distributeFees")
const { sendPushMessage } = require("../shared/helpers");

async function main() {
  try {
    await sendPushMessage("Fee distribution: running fee process")
    // await createFeePlan()
    await distributeFees({ write: true, steps: "1,2,3,4,5" })
  } catch (e) {
    console.error(`error encountered: ${e}`)
    await sendPushMessage(`Fee distribution error encountered: ${e.message}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
