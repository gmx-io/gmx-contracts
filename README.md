# GMX Contracts
Contracts for GMX.

Docs at https://gmxio.gitbook.io/gmx/contracts.

## Install Dependencies
If npx is not installed yet:
`npm install -g npx`

Install packages:
`npm i`

## Compile Contracts
`npx hardhat compile`

## Run Tests
`npx hardhat test`

## Run Fee Processing in Docker

Provide `env.json` and `keys/credentials.json`, then set `CRON_SCHEDULE` in
your environment or put the following in a local `.env` file to run daily at
05:00 UTC:

```sh
CRON_SCHEDULE='0 5 * * *'
TZ=UTC
```

Fee state is stored in `fee-state/` on the host. Before switching an existing
installation, stop the old fee processor and copy its latest state files:

```sh
mkdir -p fee-state
for file in fee-plan.json fee-steps.json; do
  if [ -f "$file" ]; then
    cp "$file" fee-state/
  fi
done
```

Keep both state files when restarting or upgrading to preserve the plan and
completed steps. For a fresh installation, start with an empty `fee-state/`.

```sh
docker compose up --build -d fee-process
docker compose logs -f fee-process
```

The container mounts credentials read-only and only mounts `fee-state/` for
persistent writes. Local `.env` files and fee state are excluded from the image.
