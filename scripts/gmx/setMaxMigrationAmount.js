const { contractAt, sendTxn } = require("../shared/helpers");

async function main() {
  const account = "0xcD4e87bc4c646214b688DCe5d7BBc85b66d2361E";
  const shouldApprove = true;
  const migrationTokens = ["GMT"];
  // const migrationTokens = ["GMT", "XGMT", "GMT_USDG", "XGMT_USDG"]

  const gmxMigrator = await contractAt(
    "GmxMigrator",
    "0x0472F402EA8E301D7595545884Ad4C420E9865d6"
  );
  const gmt = {
    name: "GMT",
    contract: await contractAt(
      "Token",
      "0x99e92123eB77Bc8f999316f622e5222498438784"
    ),
  };
  const xgmt = {
    name: "XGMT",
    contract: await contractAt(
      "Token",
      "0xe304ff0983922787Fd84BC9170CD21bF78B16B10"
    ),
  };
  const gmtUsdg = {
    name: "GMT_USDG",
    contract: await contractAt(
      "Token",
      "0xa41e57459f09a126F358E118b693789d088eA8A0"
    ),
  };
  const xgmtUsdg = {
    name: "XGMT_USDG",
    contract: await contractAt(
      "Token",
      "0x0b622208fc0691C2486A3AE6B7C875b4A174b317"
    ),
  };
  const tokens = [gmt, xgmt, gmtUsdg, xgmtUsdg];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!migrationTokens.includes(token.name)) {
      continue;
    }
    const balance = await token.contract.balanceOf(account);
    console.log(
      `${account} ${token.name}: ${ethers.utils.formatUnits(balance, 18)}`
    );
  }

  if (shouldApprove) {
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!migrationTokens.includes(token.name)) {
        continue;
      }

      const balance = await token.contract.balanceOf(account);
      if (balance.eq(0)) {
        continue;
      }

      const migratedAmount = await gmxMigrator.migratedAmounts(
        account,
        token.contract.address
      );
      const totalAmount = balance.add(migratedAmount);

      const message = `approve ${account} ${
        token.name
      }: ${ethers.utils.formatUnits(balance, 18)}, ${ethers.utils.formatUnits(
        totalAmount,
        18
      )}`;
      await sendTxn(
        gmxMigrator.setMaxMigrationAmount(
          account,
          token.contract.address,
          totalAmount
        ),
        message
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
