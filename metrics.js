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

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

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
