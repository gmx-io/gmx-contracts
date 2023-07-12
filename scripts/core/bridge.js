async function bridgeTokens({ signer, inputAmount }) {
  const { Bridge, ChainId, Networks, BaseToken } = await import("@synapseprotocol/sdk");
  const { JsonRpcProvider } = await import("@ethersproject/providers");
  const { parseUnits } = await import("@ethersproject/units");
  const { BigNumber } = await import("@ethersproject/bignumber");

  const USDC = new BaseToken({
    name: "USD Circle",
    symbol: "USDC",
    decimals: {
      [ChainId.AVALANCHE]: 6,
      [ChainId.ARBITRUM]:  6,
    },
    addresses: {
      [ChainId.ARBITRUM]:  "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      [ChainId.AVALANCHE]: "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
    },
    swapType:    "USD",
    coingeckoId: "usd-coin",
  })

  // Initialize dummy Ethers Provider
  const AVAX_PROVIDER = new JsonRpcProvider(
    "https://api.avax.network/ext/bc/C/rpc"
  );
  // Use SDK Data about different chains
  const AVAX_NETWORK = Networks.AVALANCHE;

  // Initialize Bridge
  const SYNAPSE_BRIDGE = new Bridge.SynapseBridge({
    network: AVAX_NETWORK,
  });

  // Set up some variables to prepare a Avalanche USDC -> BSC USDT quote
  const TOKEN_IN = USDC,
    TOKEN_OUT = USDC,
    ON_CHAIN = ChainId.AVALANCHE,
    CHAIN_OUT = ChainId.ARBITRUM;

  // get minimum desired output
  const { amountToReceive } = await SYNAPSE_BRIDGE.estimateBridgeTokenOutput({
    tokenFrom: TOKEN_IN, // token to send from the source chain, in this case nUSD on Avalanche
    chainIdTo: CHAIN_OUT, // Chain ID of the destination chain, in this case BSC
    tokenTo: TOKEN_OUT, // Token to be received on the destination chain, in this case USDC
    amountFrom: inputAmount, // Amount of `tokenFrom` being sent
  });

  try {
    // build and execute an ERC20 Approve transaction so that the Synapse Bridge contract
    // can do its thing.
    // If desired, `amount` can be passed in the args object, which overrides
    // the default behavior of "infinite approval" for the token.
    let approveTxn = await SYNAPSE_BRIDGE.executeApproveTransaction(
      {
        token: TOKEN_IN,
      },
      signer
    );

    // Wait for at least one confirmation on the sending chain, this is an optional
    // step and can be either omitted or implemented in a custom manner.
    await approveTxn.wait(2);

    console.log(`ERC20 Approve transaction hash: ${approveTxn.hash}`);
    console.log(
      `ERC20 Approve transaction block number: ${approveTxn.blockNumber}`
    );
  } catch (err) {
    // deal with the caught error accordingly
  }

  try {
    // executeBridgeTokenTransaction requires an ethers Signer instance to be
    // passed to it in order to actually do the bridge transaction.
    // An optional field `addressTo` can be passed, which will send tokens
    // on the output chain to an address other than the address of the Signer instance.
    //
    // NOTE: executeBridgeTokenTransaction performs the step of actually sending/broadcasting the signed
    // transaction on the source chain.
    let bridgeTxn = await SYNAPSE_BRIDGE.executeBridgeTokenTransaction(
      {
        tokenFrom: TOKEN_IN, // token to send from the source chain, in this case nUSD on Avalanche
        chainIdTo: CHAIN_OUT, // Chain ID of the destination chain, in this case BSC
        tokenTo: TOKEN_OUT, // Token to be received on the destination chain, in this case USDC
        amountFrom: inputAmount, // Amount of `tokenFrom` being sent
        amountTo: amountToReceive, // minimum desired amount of `tokenTo` to receive on the destination chain
      },
      signer
    );

    // Wait for at least one confirmation on the sending chain, this is an optional
    // step and can be either omitted or implemented in a custom manner.
    await bridgeTxn.wait(2);

    console.log(`Bridge transaction hash: ${bridgeTxn.hash}`);
    console.log(`Bridge transaction block number: ${bridgeTxn.blockNumber}`);
  } catch (err) {
    // deal with the caught error accordingly
  }

  // You're done!
}

module.exports = {
  bridgeTokens
}
