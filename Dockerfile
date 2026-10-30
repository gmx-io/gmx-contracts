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

ARG TARGETARCH
ARG SUPERCRONIC_VERSION=v0.2.51

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl tzdata \
  && case "$TARGETARCH" in \
       amd64) SUPERCRONIC_SHA1SUM=1692066e350a88ff4d7d6474fe3c7a6c41ec5e89 ;; \
       arm64) SUPERCRONIC_SHA1SUM=9d4c2000493215a1898502b2fc2dada3e8ea8c7a ;; \
       *) echo "unsupported architecture: $TARGETARCH" >&2; exit 1 ;; \
     esac \
  && curl -fsSL -o /usr/local/bin/supercronic \
       "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-${TARGETARCH}" \
  && echo "${SUPERCRONIC_SHA1SUM}  /usr/local/bin/supercronic" | sha1sum -c - \
  && chmod +x /usr/local/bin/supercronic \
  && rm -rf /var/lib/apt/lists/*

ENV TZ=UTC
WORKDIR /app

COPY --from=build /app /app
COPY docker/entrypoint.sh /entrypoint.sh
COPY docker/run-fee-process.sh /app/docker/run-fee-process.sh
RUN chmod +x /entrypoint.sh /app/docker/run-fee-process.sh

ENTRYPOINT ["/entrypoint.sh"]
