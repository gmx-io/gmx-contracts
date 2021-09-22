# Gambit Contracts
Contracts for the GMT Token and GMT Treasury.

## Install Dependencies
If npx is not installed yet:
`npm install -g npx`

Install packages:
`npm i`

## Compile Contracts
`npx hardhat compile`

## Run Tests
`npx hardhat test`

## Vault
The Vault contract handles buying USDG, selling USDG, swapping, increasing positions, decreasing positions and liquidations.
Overview: https://gambit.gitbook.io/gambit/

### Buying USDG
- USDG can be bought with any whitelisted token
- The oracle price is used to determine the amount of USDG that should be minted to the receiver, with 1 USDG being valued at 1 USD
- Fees are collected based on `swapFeeBasisPoints`
- `usdgAmounts` is increased to track the USDG debt of the token
- `poolAmounts` is increased to track the amount of tokens that can be used for swaps or borrowed for margin trading

### Selling USDG
- USDG can be sold for any whitelisted token
- The oracle price is used to determine the amount of tokens that should be sent to the receiver
- For non-stableTokens, the amount of tokens sent out is additionally capped by the redemption collateral
- To calculate the redemption collateral:
  - Convert the value in `guaranteedUsd[token]` from USD to tokens
  - Add `poolAmounts[token]`
  - Subtract `reservedAmounts[token]`
- The reason for this calculation is because traders can open long positions by borrowing non-stable whitelisted tokens, when these tokens are borrowed the USD value in `guaranteedUsd[token]` is guaranteed until the positions are closed or liquidated
- `reservedAmounts[token]` tracks the amount of tokens in the pool reserved for open positions
- The redemption amount is capped by: `(USDG sold) / (USDG debt) * (redemption collateral) * (redemptionBasisPoints[token]) / BASIS_POINTS_DIVISOR`
- redemptionBasisPoints can be adjusted to allow a larger or smaller amount of redemption
- Fees are collected based on `swapFeeBasisPoints`
- `usdgAmounts` is decreased to reduce the USDG debt of the token
- `poolAmounts` is decreased to reflect the reduction in available collateral for redemption

### Swap
- Any whitelisted tokens can be swapped for one another
- The oracle prices are used to determine the amount of tokens that should be sent to the receiver
- USDG debt is transferred from the _tokenOut to the _tokenIn
- Fees are collected based on `swapFeeBasisPoints`
- `poolAmounts` are updated to reflect the change in tokens

### IncreasePosition
- Traders can long and short whitelisted tokens
- For longs, the collateral token must be the same as the index token (the token being longed)
- For shorts, the collateral token must be a stableToken and the index token must not be a stableToken
- For both longs and shorts, the token borrowed from the pool is based on the collateral token
- Fees are collected based on `marginFeeBasisPoints` and funding rates
- Funding rates are calculated based on the `fundingRateFactor` and utilisation of the pool for the token being borrowed
- `reservedAmounts[token]` is increased to ensure there are sufficient tokens to pay profits on the position
- For longs:
  - `guaranteedUsd[token]` is updated based on the difference between the position size and the collateral
  - `poolAmounts[token]` is increased by the collateral received and considered as part of the pool
- For shorts:
  - `guaranteedUsd[token]` is not updated as the collateral token is a stableToken, and no USD amount is additionally guaranteed
  - `poolAmounts[token]` is not increased as the collateral is not considered as part of the pool

### DecreasePosition
- `reservedAmounts[token]` is decreased proportional to the decrease in position size
- For longs:
  - The `guaranteedUsd[token]` is updated based on the new difference between the position size and the collateral
  - `poolAmounts[token]` is decreased by the amount of USD sent out, since the position's collateral and the position's size are treated as a part of the pool
- For shorts:
  - `poolAmounts[token]` is decreased if there are realised profits for the position
  - `poolAmounts[token]` is increased if there are realised losses for the position

### LiquidatePosition
- Any user can liquidate a position if the remaining collateral after losses is lower than `liquidationFeeUsd` or if the `maxLeverage` is exceeded
- `reservedAmounts[token]` is decreased since it is no longer needed for the position
- For longs:
  - `guaranteedUsd[token]` is decreased based on the different between the position size and the collateral
- For shorts:
  - `poolAmounts[token]` is increased to reflect the additional collateral from the position's losses

## Front-Running Protection
Oracle results can be known before the result is finalised on-chain.

This means that a trader could observe oracle results in the mempool or otherwise and enter a favourable position before the result is finalised.

Over time, this could lead to losses in assets for the system.

To guard against this attack vector, the last three oracle results are sampled to determine prices.

This reduces the attack surface as minor fluctuations cannot be exploited for profits.

Additionally, a `minProfitBasisPoints` configuration is allowed per token.

If the oracle is updated on every 0.5% price movement, the `minProfitBasisPoints` for the token could be set to 0.75%.
This means that if the profit on a position is less than 0.75%, then the profit would be considered to be 0.

For buying USDG, selling USDG and swaps, a fee of 0.3% would make trades across a 0.5% price movement unprofitable.

## Governance
Governance will be set to a timelock contract which would require actions to be broadcasted 5 days in advance before they can be executed.

This timelock contract will be upgraded to a DAO based contract once the system is stable.
