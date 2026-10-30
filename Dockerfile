# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
  npm ci --no-audit --no-fund --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000

COPY . .
RUN node docker/write-compile-env.js \
  && npx hardhat compile \
  && rm -f env.json

FROM node:22-bookworm-slim

WORKDIR /app

COPY --from=build /app /app
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["./node_modules/.bin/hardhat", "run", "scripts/fees/runFeeProcess.js", "--network", "arbitrum"]
