Notes for the Guardian Audit

VLT-1 | Increased Insolvency Risk

This is intended behaviour, adding more details to the example:

1. The price of ETH is $5,000
2. There is 10 ETH deposited into the pool, so worth of the pool is $50,000
3. A user opens a $10,000 long position, with 1 ETH as collateral, collateral is stored as a snapshot of 5000 USD
4. guaranteedUSD: 10,000 - 5000 = 5000
5. poolAmount: 11 ETH (as mentioned in the code "treat the deposited collateral as part of the pool")
6. reservedAmount: 2 ETH

worth of pool is: guaranteedUsd + (poolAmount - reservedAmount) * price = 5000 + (11 - 2) * 5000 = $50,000

if the price of ETH decreases to $3000

worth of pool is: 5000 + (11 - 2) * 3000 = $32,000

if the user closes the position now, they realize a loss of (5000 - 3000) / 5000 * 10,000 = 4000

so they would receive (5000 - 4000) / 3000 = 0.33333333333 ETH

after closing the position

worth of pool is: (11 - 0.3333) * 3000 = $32,000
