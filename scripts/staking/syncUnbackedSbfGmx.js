const fs = require("fs");
const { ethers } = require("ethers");
const { GcpSigner } = require("@gmx-io/ethers-kms-signer");

const {
  ARBITRUM_URL,
  GCP_PROJECT_ID,
  GCP_LOCATION_ID,
  GCP_KEY_RING_ID,
  GCP_KEY_ID,
  GCP_KEY_VERSION,
} = require("../../env.json");

const VESTER_CAP = "0x57866d65ACbb7Ba3269807Bf7af4019366789b60";
const FEE_GMX_TRACKER = "0xd2D1162512F927a7e282Ef43a362659E4F2a728F";
const GMX_VESTER = "0x199070DDfd1CFb69173aa2F7e20906F26B363004";
const INPUT = "safe-txs/unbacked-sbfgmx.json";
const PROGRESS = "safe-txs/sync-unbacked-sbfgmx-progress.json";

const vesterCapAbi = [
  "function gov() view returns (address)",
  "function gmxVester() view returns (address)",
  "function syncFeeGmxTrackerBalance(address _account)",
];
const trackerAbi = [
  "function balanceOf(address) view returns (uint256)",
  "function stakedAmounts(address) view returns (uint256)",
  "function isHandler(address) view returns (bool)",
];

function loadProgress() {
  if (!fs.existsSync(PROGRESS)) return {};
  return JSON.parse(fs.readFileSync(PROGRESS, "utf8"));
}

function saveProgress(progress) {
  const tmp = PROGRESS + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(progress, null, 2) + "\n");
  fs.renameSync(tmp, PROGRESS);
}

function loadAccounts() {
  const report = JSON.parse(fs.readFileSync(INPUT, "utf8"));
  return report.accounts
    .filter((row) => row.syncTarget !== false)
    .map((row) => ethers.utils.getAddress(row.account))
    .filter((account) => account !== GMX_VESTER);
}

async function main() {
  const dryRun = process.env.DRY_RUN === "1";
  const provider = new ethers.providers.JsonRpcProvider(ARBITRUM_URL);
  const signer = new GcpSigner({
    projectId: GCP_PROJECT_ID,
    locationId: GCP_LOCATION_ID,
    keyRingId: GCP_KEY_RING_ID,
    keyId: GCP_KEY_ID,
    keyVersion: GCP_KEY_VERSION,
    keyFilename: process.env.GCP_KEY_FILENAME,
  }).connect(provider);

  const signerAddress = await signer.getAddress();
  const vesterCap = new ethers.Contract(VESTER_CAP, vesterCapAbi, signer);
  const tracker = new ethers.Contract(FEE_GMX_TRACKER, trackerAbi, provider);
  const [gov, gmxVester, isHandler] = await Promise.all([
    vesterCap.gov(),
    vesterCap.gmxVester(),
    tracker.isHandler(VESTER_CAP),
  ]);

  if (signerAddress !== gov) {
    throw new Error(`signer ${signerAddress} is not VesterCap gov ${gov}`);
  }
  if (gmxVester !== GMX_VESTER) {
    throw new Error(`unexpected gmxVester ${gmxVester}`);
  }
  if (!isHandler) {
    throw new Error("VesterCap is not a feeGmxTracker handler");
  }

  const accounts = loadAccounts();
  const progress = loadProgress();
  console.log("signer", signerAddress);
  console.log("vesterCap", VESTER_CAP);
  console.log("accounts", accounts.length, "dryRun", dryRun);

  let sent = 0;
  let skipped = 0;
  for (const account of accounts) {
    if (progress[account] && progress[account].status === "sent") {
      skipped++;
      continue;
    }

    const [balance, staked] = await Promise.all([
      tracker.balanceOf(account),
      tracker.stakedAmounts(account),
    ]);
    if (balance.lte(staked)) {
      progress[account] = { status: "skipped", reason: "balance <= staked" };
      saveProgress(progress);
      skipped++;
      console.log("skip", account);
      continue;
    }

    const excess = balance.sub(staked);
    console.log("sync", account, ethers.utils.formatEther(excess));
    if (dryRun) continue;

    const tx = await vesterCap.syncFeeGmxTrackerBalance(account);
    console.log("sent", account, tx.hash);
    const receipt = await tx.wait(1);
    progress[account] = {
      status: "sent",
      hash: receipt.transactionHash,
      excess: excess.toString(),
    };
    saveProgress(progress);
    sent++;
  }

  console.log("done sent", sent, "skipped", skipped);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
