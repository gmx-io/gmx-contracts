const fetch = require("node-fetch");
const { format, subWeeks, addWeeks } = require("date-fns");

const dayFormat = "dd.MM.yyyy";

const headersV1 = {
  accept: "application/json, multipart/mixed",
  "accept-language": "en,en-US;q=0.9,ru;q=0.8,de;q=0.7",
  "cache-control": "no-cache",
  "content-type": "application/json",
  pragma: "no-cache",
  priority: "u=1, i",
  "sec-ch-ua":
    '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  Referer:
    "https://subgraph.satsuma-prod.com/gmx/gmx-arbitrum-stats/playground",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  origin: "https://subgraph.satsuma-prod.com",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
};

const headersV2 = {
  ...headersV1,
  Referer:
    "https://subgraph.satsuma-prod.com/gmx/synthetics-arbitrum-stats/playground",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

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

async function processPeriodV1([start, end]) {
  const where = `id_gte: ${dateToSeconds(start)}, id_lt: ${dateToSeconds(
    end
  )}, period: daily`;
  const gql = `
    {
        feeStats(where: { ${where} }) {
            id
            margin
            swap
            liquidation
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
    "https://subgraph.satsuma-prod.com/gmx/gmx-arbitrum-stats/api",
    {
      headers: headersV1,
      body: JSON.stringify({ query: gql }),
      method: "POST",
    }
  );

  const json = await response.json();
  const stats = json.data.feeStats;
  const total = stats.reduce(
    (acc, { margin, swap, liquidation, mint, burn }) => {
      return (
        acc +
        BigInt(margin) +
        BigInt(swap) +
        BigInt(liquidation) +
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
      headers: headersV2,
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
  const decimals = 30;
  const amountStr = amount.toString();

  if (amountStr.length <= decimals) {
    const leadingZeros = "0".repeat(decimals - amountStr.length);
    return `0.${leadingZeros}${amountStr}`;
  }

  const integerPart = amountStr.slice(0, -decimals);
  const fractionalPart = amountStr.slice(-decimals, -decimals + 14);

  const formattedIntegerPart = integerPart.replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ","
  );

  return `$${formattedIntegerPart}.${fractionalPart.slice(0, displayDecimals)}`;
}

main();
