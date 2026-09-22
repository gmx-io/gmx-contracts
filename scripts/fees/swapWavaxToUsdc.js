const hre = require("hardhat");
const { sendTxn } = require("../shared/helpers");
const { formatAmount } = require("../../test/shared/utilities");

const tokens = require("../core/tokens")["avax"];

const LFJ_LB_ROUTER = "0x18556DA13313f3532c54711497A8FedAC273220E";
const LFJ_LB_QUOTER = "0x9A550a522BBaDFB69019b0432800Ed17855A51C3";
const WAVAX = tokens.nativeToken.address;
const USDC = tokens.usdc.address;
const WAVAX_DECIMALS = tokens.nativeToken.decimals;
const USDC_DECIMALS = tokens.usdc.decimals;
const DEFAULT_SLIPPAGE_BPS = 100; // 1%
const DEADLINE_SECONDS = 300;
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
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
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

  const quote = await quoter.findBestPathFromAmountIn([WAVAX, USDC], amountIn);
  const amountOut = quote.amounts[quote.amounts.length - 1];
  if (!quote.pairs.length || quote.pairs.some((pair) => pair === hre.ethers.constants.AddressZero) || amountOut.lte(0)) {
    throw new Error("LFJ quoter did not find a WAVAX -> USDC path");
  }

  const amountOutMin = amountOut.mul(10000 - slippageBps).div(10000);
  const path = {
    pairBinSteps: quote.binSteps,
    versions: quote.versions,
    tokenPath: quote.route,
  };

  console.log("network: %s", hre.network.name);
  console.log("signer: %s", wallet.address);
  console.log("recipient: %s", to);
  console.log("write: %s", shouldWrite);
  console.log("WAVAX: %s", WAVAX);
  console.log("USDC: %s", USDC);
  console.log("LBRouter: %s", LFJ_LB_ROUTER);
  console.log("LBQuoter: %s", LFJ_LB_QUOTER);
  console.log("WAVAX balance: %s", formatAmount(wavaxBalance, WAVAX_DECIMALS, 6, true));
  console.log("amount in: %s WAVAX", formatAmount(amountIn, WAVAX_DECIMALS, 6, true));
  console.log("quoted out: %s USDC", formatAmount(amountOut, USDC_DECIMALS, 6, true));
  console.log("min out (%s bps slippage): %s USDC", slippageBps, formatAmount(amountOutMin, USDC_DECIMALS, 6, true));
  console.log("path: %s", quote.route.join(" -> "));
  console.log("pairs: %s", quote.pairs.join(", "));
  console.log(
    "binSteps: %s",
    quote.binSteps.map((binStep) => binStep.toString()).join(", ")
  );
  console.log(
    "versions: %s",
    quote.versions.map((version) => VERSION_LABELS[version] || version).join(", ")
  );

  if (!shouldWrite) {
    console.log("skipping swap, set WRITE=true to send");
    return {
      amountIn,
      amountOut,
      amountOutMin,
      path,
    };
  }

  const allowance = await wavax.allowance(wallet.address, LFJ_LB_ROUTER);
  if (allowance.lt(amountIn)) {
    await sendTxn(wavax.approve(LFJ_LB_ROUTER, amountIn), "WAVAX.approve(LBRouter)");
  }

  const deadline = Math.floor(Date.now() / 1000) + DEADLINE_SECONDS;
  await sendTxn(
    router.swapExactTokensForTokens(amountIn, amountOutMin, path, to, deadline),
    "LBRouter.swapExactTokensForTokens(WAVAX -> USDC)"
  );

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
    path,
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
