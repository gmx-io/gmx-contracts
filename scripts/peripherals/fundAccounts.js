async function main() {
  const frame = new ethers.providers.JsonRpcProvider("http://127.0.0.1:1248")
  const signer = frame.getSigner()

  const transfers = [
    {
      address: "0x67F1B9E91D7bB46556ba013c1B187C461e2a1Ffd", // price sender
      amount: "1.6"
    },
    {
      address: "0xd4266F8F82F7405429EE18559e548979D49160F3", // order keeper
      amount: "0"
    },
    {
      address: "0x44311c91008DDE73dE521cd25136fD37d616802c", // liquidator
      amount: "0.2"
    }
  ]

  for (let i = 0; i < transfers.length; i++) {
    const transferItem = transfers[i]
    if (parseFloat(transferItem.amount) === 0) {
      continue
    }
    await signer.sendTransaction({
      to: transferItem.address,
      value: ethers.utils.parseEther(transferItem.amount)
    })
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
