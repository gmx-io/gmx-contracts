const { format, subWeeks, addWeeks } = require("date-fns");
const { formatAmount, bigNumberify } = require("../../test/shared/utilities");
const Table = require("easy-table");

const dayFormat = "dd.MM.yyyy";

async function main() {
  for (const relativePeriodName of ["prev", "current"]) {
    printPeriod(relativePeriodName);
    const table = new Table();
    const arbitrumV1 = await processPeriodV1(relativePeriodName, "arbitrum");
    const arbitrumV2 = await processPeriodV2(relativePeriodName, "arbitrum");
    const avalancheV1 = await processPeriodV1(relativePeriodName, "avalanche");
    const avalancheV2 = await processPeriodV2(relativePeriodName, "avalanche");
    table.cell("Chain", "Arbitrum");
    table.cell("Version", "v1");
    table.cell("Fees", arbitrumV1.fees, formatUsd);
    table.cell("Where", arbitrumV1.where);
    table.newRow();
    table.cell("Chain", "Arbitrum");
    table.cell("Version", "v2");
    table.cell("Fees", arbitrumV2.fees, formatUsd);
    table.cell("Where", arbitrumV2.where);
    table.newRow();
    table.cell("Chain", "Avalanche");
    table.cell("Version", "v1");
    table.cell("Fees", avalancheV1.fees, formatUsd);
    table.cell("Where", avalancheV1.where);
    table.newRow();
    table.cell("Chain", "Avalanche");
    table.cell("Version", "v2");
    table.cell("Fees", avalancheV2.fees, formatUsd);
    table.cell("Where", avalancheV2.where);
    table.newRow();

    console.log(table.toString());
    console.log();
  }
}

const fetch = async (...args) => {
  return (await import("node-fetch")).default(...args);
};

const fetchGql = async (url, gql) => {
  return fetch(
    `https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/${url}/api`,
    {
      body: JSON.stringify({ query: gql }),
      method: "POST",
    }
  );
};

function printPeriod(relativePeriodName) {
  const [start, end] = getPeriod(relativePeriodName);
  console.log(
    `${relativePeriodName} epoch ${format(start, dayFormat)} - ${format(
      end,
      dayFormat
    )}`
  );
}

async function processPeriodV1(relativePeriodName, chainName) {
  const [start, end] = getPeriod(relativePeriodName);
  const where = `id_gte: ${dateToSeconds(start)}, id_lt: ${dateToSeconds(
    end
  )}, period: daily`;
  const gql = `
    {
        feeStats(where: { ${where} }) {
            id
            marginAndLiquidation
            swap
            mint
            burn
            period
        }
    }
  `;

  const response = await fetchGql(`gmx-${chainName}-stats`, gql);

  const json = await response.json();
  const stats = json.data.feeStats;
  const total = stats.reduce(
    (acc, { marginAndLiquidation, swap, mint, burn }) => {
      return (
        acc +
        BigInt(marginAndLiquidation) +
        BigInt(swap) +
        BigInt(mint) +
        BigInt(burn)
      );
    },
    0n
  );

  return bigNumberify(total)
}

async function processPeriodV2(relativePeriodName, chainName) {
  const [start, end] = getPeriod(relativePeriodName);
  const where = `id_gte: ${dateToSeconds(start)}, id_lt: ${dateToSeconds(
    end
  )},  period: "1d"`;
  const gql = `
    query  {
        position: positionFeesInfoWithPeriods(where: { ${where} }) {
            totalBorrowingFeeUsd
            totalPositionFeeUsd
        }

        swap: swapFeesInfoWithPeriods(where: { ${where} }) {
            totalFeeReceiverUsd
            totalFeeUsdForPool
        }
    }`;

  const response = await fetchGql(`synthetics-${chainName}-stats`, gql);

  const json = await response.json();
  const positionStats = json.data.position;
  const swapStats = json.data.swap;

  const positionFees = positionStats.reduce((acc, stat) => {
    return (
      acc + BigInt(stat.totalBorrowingFeeUsd) + BigInt(stat.totalPositionFeeUsd)
    );
  }, 0n);

  const swapFees = swapStats.reduce((acc, stat) => {
    return (
      acc + BigInt(stat.totalFeeReceiverUsd) + BigInt(stat.totalFeeUsdForPool)
    );
  }, 0n);

  return bigNumberify(positionFees + swapFees)
}

function dateToSeconds(date) {
  return Math.floor(date.getTime() / 1000);
}

function getPeriod(relativePeriodName) {
  const recentWednesday = getRecentWednesdayStartOfDay();
  const prevWednesday = subWeeks(recentWednesday, 1);
  const nextWednesday = addWeeks(recentWednesday, 1);

  switch (relativePeriodName) {
    case "prev":
      return [prevWednesday, recentWednesday];
    case "current":
      return [recentWednesday, nextWednesday];
  }
}

function getRecentWednesdayStartOfDay() {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const daysSinceWednesday = (dayOfWeek + 4) % 7;

  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysSinceWednesday,
      0,
      0,
      0
    )
  );
}

function formatUsd(amount) {
  return `$${formatAmount(amount, 30, 2, true)}`;
}

module.exports = {
  processPeriodV1,
  processPeriodV2,
  getPeriod,
};
