const hre = require("hardhat");
const { sendTxn } = require("../shared/helpers");
const { formatAmount } = require("../../test/shared/utilities");

const tokens = require("../core/tokens")["avax"];

const LFJ_LB_ROUTER = "0x18556DA13313f3532c54711497A8FedAC273220E";
const LFJ_LB_QUOTER = "0x9A550a522BBaDFB69019b0432800Ed17855A51C3";
const FLY_API = "https://api.fly.trade";
const LIFI_API = "https://li.quest/v1/quote";
const WAVAX = tokens.nativeToken.address;
const USDC = tokens.usdc.address;
const USDT = "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7";
const USDCE = tokens.usdce.address;
const WETH_E = "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB";
const WAVAX_DECIMALS = tokens.nativeToken.decimals;
const USDC_DECIMALS = tokens.usdc.decimals;
const DEFAULT_SLIPPAGE_BPS = 100; // 1%
const DEADLINE_SECONDS = 300;
const API_TIMEOUT_MS = 20_000;
const MAX_UINT128 = hre.ethers.BigNumber.from("0xffffffffffffffffffffffffffffffff");

const VERSION_LABELS = ["V1", "V2", "V2_1", "V2_2"];

const LB_QUOTER_ABI = [
  "function findBestPathFromAmountIn(address[] route, uint128 amountIn) view returns (tuple(address[] route, address[] pairs, uint256[] binSteps, uint8[] versions, uint128[] amounts, uint128[] virtualAmountsWithoutSlippage, uint128[] fees) quote)",
];

const LB_ROUTER_ABI = [
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, tuple(uint256[] pairBinSteps, uint8[] versions, address[] tokenPath) path, address to, uint256 deadline) returns (uint256 amountOut)",
];

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

const CANDIDATE_ROUTES = [
  [WAVAX, USDC],
  [WAVAX, USDT, USDC],
  [WAVAX, USDCE, USDC],
  [WAVAX, WETH_E, USDC],
];

function getShouldWrite(write) {
  if (write !== undefined) {
    return write;
  }
  return process.env.WRITE === "true";
}

function parseAmount(amount) {
  if (amount === undefined || amount === null || amount === "") {
    return undefined;
  }
  if (hre.ethers.BigNumber.isBigNumber(amount)) {
    return amount;
  }
  return hre.ethers.utils.parseUnits(String(amount), WAVAX_DECIMALS);
}

function slippageDecimal(slippageBps) {
  return String(slippageBps / 10000);
}

async function httpGetJson(url) {
  const fetch = (await import("node-fetch")).default;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timeout);
  }
}

function parseQuotedAmount(value) {
  if (value === undefined || value === null || value === "") {
    return hre.ethers.constants.Zero;
  }
  return hre.ethers.BigNumber.from(value.toString());
}

async function quoteFlyTrade({ amountIn, fromAddress, toAddress, slippageBps }) {
  const params = new URLSearchParams({
    network: "avalanche",
    fromTokenAddress: WAVAX,
    toTokenAddress: USDC,
    sellAmount: amountIn.toString(),
    fromAddress,
    toAddress,
    slippage: slippageDecimal(slippageBps),
    gasless: "false",
  });
  const quote = await httpGetJson(`${FLY_API}/aggregator/quote?${params.toString()}`);
  const amountOut = parseQuotedAmount(quote.amountOut);
  if (amountOut.lte(0) || !quote.id || !quote.targetAddress) {
    throw new Error("fly.trade returned an incomplete quote");
  }
  return {
    aggregator: "flytrade",
    amountOut,
    spender: quote.targetAddress,
    getSwapTx: async () => {
      const tx = await httpGetJson(`${FLY_API}/aggregator/transaction?quoteId=${quote.id}&estimateGas=false`);
      if (!tx || !tx.to || !tx.data) {
        throw new Error("fly.trade did not return swap calldata");
      }
      return {
        to: tx.to,
        data: tx.data,
        value: tx.value || 0,
        gas: tx.gasLimit,
      };
    },
  };
}

async function quoteLifi({ amountIn, fromAddress, slippageBps }) {
  const params = new URLSearchParams({
    fromChain: "43114",
    toChain: "43114",
    fromToken: WAVAX,
    toToken: USDC,
    fromAmount: amountIn.toString(),
    fromAddress,
    slippage: slippageDecimal(slippageBps),
  });
  const quote = await httpGetJson(`${LIFI_API}?${params.toString()}`);
  const tx = quote.transactionRequest || {};
  const amountOut = parseQuotedAmount(quote.estimate && quote.estimate.toAmount);
  if (amountOut.lte(0) || !tx.to || !tx.data) {
    throw new Error("LI.FI returned an incomplete quote");
  }
  return {
    aggregator: `lifi:${quote.tool || "aggregator"}`,
    amountOut,
    spender: tx.to,
    getSwapTx: async () => ({
      to: tx.to,
      data: tx.data,
      value: tx.value || 0,
      gas: tx.gasLimit || tx.gas,
    }),
  };
}

async function buildAggregatorTxRequest(wallet, swapTx) {
  const txRequest = {
    to: swapTx.to,
    data: swapTx.data,
    value: swapTx.value || 0,
  };

  let gasLimit;
  try {
    if (swapTx.gas != null && swapTx.gas !== "") {
      const quotedGas = hre.ethers.BigNumber.from(swapTx.gas);
      if (quotedGas.gt(0)) {
        gasLimit = quotedGas;
      }
    }
  } catch (error) {
    console.log("aggregator gasLimit parse failed: %s", error.message);
  }

  if (!gasLimit) {
    gasLimit = await wallet.estimateGas(txRequest);
  }

  txRequest.gasLimit = gasLimit.mul(120).div(100);
  console.log("aggregator gasLimit: %s", txRequest.gasLimit.toString());
  return txRequest;
}

async function quoteAggregators({ amountIn, fromAddress, toAddress, slippageBps }) {
  const results = await Promise.allSettled([
    quoteFlyTrade({ amountIn, fromAddress, toAddress, slippageBps }),
    quoteLifi({ amountIn, fromAddress, slippageBps }),
  ]);
  const names = ["flytrade", "lifi"];
  let best;
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status !== "fulfilled") {
      console.log("%s quote failed: %s", names[i], result.reason && result.reason.message);
      continue;
    }
    console.log(
      "%s quoted out: %s USDC",
      result.value.aggregator,
      formatAmount(result.value.amountOut, USDC_DECIMALS, 6, true)
    );
    if (!best || result.value.amountOut.gt(best.amountOut)) {
      best = result.value;
    }
  }
  return best;
}

async function swapWavaxToUsdc({
  signer,
  amount,
  slippageBps = DEFAULT_SLIPPAGE_BPS,
  recipient,
  write,
} = {}) {
  const shouldWrite = getShouldWrite(write);
  const [defaultSigner] = await hre.ethers.getSigners();
  const wallet = signer || defaultSigner;
  const to = recipient || wallet.address;

  const wavax = new hre.ethers.Contract(WAVAX, ERC20_ABI, wallet);
  const usdc = new hre.ethers.Contract(USDC, ERC20_ABI, wallet);
  const quoter = new hre.ethers.Contract(LFJ_LB_QUOTER, LB_QUOTER_ABI, wallet);
  const router = new hre.ethers.Contract(LFJ_LB_ROUTER, LB_ROUTER_ABI, wallet);

  const wavaxBalance = await wavax.balanceOf(wallet.address);
  const usdcBalanceBefore = await usdc.balanceOf(to);
  const amountIn = parseAmount(amount) || wavaxBalance;

  if (amountIn.lte(0)) {
    throw new Error("WAVAX amount to swap should be greater than 0");
  }
  if (amountIn.gt(wavaxBalance)) {
    throw new Error(
      `insufficient WAVAX balance: amount ${formatAmount(amountIn, WAVAX_DECIMALS, 6, true)} > balance ${formatAmount(wavaxBalance, WAVAX_DECIMALS, 6, true)}`
    );
  }
  if (amountIn.gt(MAX_UINT128)) {
    throw new Error("WAVAX amount exceeds uint128 max for LFJ quoter");
  }

  const [aggregatorQuote] = await Promise.all([
    quoteAggregators({
      amountIn,
      fromAddress: wallet.address,
      toAddress: to,
      slippageBps,
    }),
    // quoteLbRouter(quoter, amountIn),
  ]);

  if (!aggregatorQuote ) {
    throw new Error("no WAVAX -> USDC quote from aggregators");
  }

  const amountOut = aggregatorQuote.amountOut;
  const amountOutMin = amountOut.mul(10000 - slippageBps).div(10000);

  console.log("network: %s", hre.network.name);
  console.log("signer: %s", wallet.address);
  console.log("recipient: %s", to);
  console.log("write: %s", shouldWrite);
  console.log("WAVAX: %s", WAVAX);
  console.log("USDC: %s", USDC);
  console.log("WAVAX balance: %s", formatAmount(wavaxBalance, WAVAX_DECIMALS, 6, true));
  console.log("amount in: %s WAVAX", formatAmount(amountIn, WAVAX_DECIMALS, 6, true));
  if (aggregatorQuote) {
    console.log("best aggregator out: %s USDC (%s)", formatAmount(aggregatorQuote.amountOut, USDC_DECIMALS, 6, true), aggregatorQuote.aggregator);
  }
  console.log("selected: %s", aggregatorQuote.aggregator);
  console.log("quoted out: %s USDC", formatAmount(amountOut, USDC_DECIMALS, 6, true));
  console.log("min out (%s bps slippage): %s USDC", slippageBps, formatAmount(amountOutMin, USDC_DECIMALS, 6, true));

  if (!shouldWrite) {
    console.log("skipping swap, set WRITE=true to send");
    return {
      amountIn,
      amountOut,
      amountOutMin,
      aggregator: aggregatorQuote.aggregator,
      path: undefined,
    };
  }

  const allowance = await wavax.allowance(wallet.address, aggregatorQuote.spender);
  if (allowance.lt(amountIn)) {
    await sendTxn(wavax.approve(aggregatorQuote.spender, amountIn), `WAVAX.approve(${aggregatorQuote.spender})`);
  }

  const swapTx = await aggregatorQuote.getSwapTx();
  console.log("aggregator swap to: %s", swapTx.to);
  const txRequest = await buildAggregatorTxRequest(wallet, swapTx);
  await sendTxn(wallet.sendTransaction(txRequest), `${aggregatorQuote.aggregator} WAVAX -> USDC`);

  const wavaxBalanceAfter = await wavax.balanceOf(wallet.address);
  const usdcBalanceAfter = await usdc.balanceOf(to);
  const usdcReceived = usdcBalanceAfter.sub(usdcBalanceBefore);

  console.log("WAVAX balance after: %s", formatAmount(wavaxBalanceAfter, WAVAX_DECIMALS, 6, true));
  console.log("USDC received: %s", formatAmount(usdcReceived, USDC_DECIMALS, 6, true));
  console.log("USDC balance after: %s", formatAmount(usdcBalanceAfter, USDC_DECIMALS, 6, true));

  return {
    amountIn,
    amountOut,
    amountOutMin,
    usdcReceived,
    aggregator: aggregatorQuote.aggregator,
    path: undefined,
  };
}

async function main() {
  await swapWavaxToUsdc({
    amount: process.env.AMOUNT,
  });
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  swapWavaxToUsdc,
};
