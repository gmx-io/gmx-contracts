const { format, subWeeks, addWeeks } = require("date-fns");
const { formatAmount } = require("../../test/shared/utilities");

const dayFormat = "dd.MM.yyyy";

async function main() {
  console.log("v1");
  console.log("");
  await processPeriodV1(getPeriod("prev"));
  console.log("");
  await processPeriodV1(getPeriod("current"));
  console.log("");
  console.log("v2");
  console.log("");
  await processPeriodV2(getPeriod("prev"));
  console.log("");
  await processPeriodV2(getPeriod("current"));
}

const fetch = async (...args) => {
  return (await import("node-fetch")).default(...args);
};

async function processPeriodV1([start, end]) {
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

  console.log(
    `Processing period ${format(start, dayFormat)} - ${format(
      end,
      dayFormat
    )} (${where})`
  );
  const response = await fetch(
    "https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/gmx-arbitrum-stats/api",
    {
      body: JSON.stringify({ query: gql }),
      method: "POST",
    }
  );

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

  console.log("total fees:", formatUsd(total));
}

async function processPeriodV2([start, end]) {
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

  console.log(
    `Processing period ${format(start, dayFormat)} - ${format(
      end,
      dayFormat
    )} (${where})`
  );

  const response = await fetch(
    "https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/synthetics-arbitrum-stats/api",
    {
      body: JSON.stringify({ query: gql }),
      method: "POST",
    }
  );

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

  console.log("total fees:", formatUsd(positionFees + swapFees));
}

function dateToSeconds(date) {
  return Math.floor(date.getTime() / 1000);
}

function getPeriod(relativeEpoch) {
  const recentWednesday = getRecentWednesdayStartOfDay();
  const prevWednesday = subWeeks(recentWednesday, 1);
  const nextWednesday = addWeeks(recentWednesday, 1);

  switch (relativeEpoch) {
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

function formatUsd(amount, displayDecimals = 2) {
  return `$${formatAmount(amount, 30, displayDecimals, true)}`;
}

main();
