const { getAllFiles } = require("get-all-files");
const { SolidityMetricsContainer } = require("solidity-code-metrics");

const options = {
  basePath: "",
  inputFileGlobExclusions: undefined,
  inputFileGlob: undefined,
  inputFileGlobLimit: undefined,
  debug: false,
  repoInfo: {
    branch: undefined,
    commit: undefined,
    remote: undefined,
  },
};

const metrics = new SolidityMetricsContainer("metricsContainerName", options);

async function run() {
  const files = await getAllFiles("./contracts").toArray();

  const skipFiles = [
    "./contracts/amm",
    "./contracts/gambit-token",
    "./contracts/core/test",
    "./contracts/gmx/GmxFloor.sol",
    "./contracts/gmx/GmxIou.sol",
    "./contracts/gmx/GmxMigrator.sol",
    "./contracts/gmx/MigrationHandler.sol",
    // the libraries contracts are from https://github.com/OpenZeppelin/openzeppelin-contracts/releases/tag/v3.2.0
    "./contracts/libraries",
    "./contracts/tokens/FaucetToken.sol",
  ];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    let shouldSkip = false;

    for (let j = 0; j < skipFiles.length; j++) {
      if (file.includes(skipFiles[j])) {
        shouldSkip = true;
        break;
      }
    }

    if (shouldSkip) {
      console.info("skipping", file);
      continue;
    }

    console.info(i, file);
    await metrics.analyze(files[i]);
  }

  let patternedFilesSourceCount = 0;

  console.info(metrics.seenFiles);
  console.info("contract,source,total,comment");
  for (let i = 0; i < metrics.metrics.length; i++) {
    const metric = metrics.metrics[i];

    console.info(
      [metric.filename, metric.metrics.nsloc.source, metric.metrics.nsloc.total, metric.metrics.nsloc.comment].join(",")
    );
  }

  console.info("nsloc:", metrics.totals().totals.nsloc);
}

run();
