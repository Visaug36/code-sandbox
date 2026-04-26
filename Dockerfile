# Multi-toolchain image. Debian-slim instead of Alpine because Alpine's
# package matrix changes between releases and broke Render's build on
# `openjdk17`. Debian's apt repos are stable and well-known.
FROM node:20-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        python3 \
        build-essential \
        default-jdk-headless \
        golang-go \
        rustc \
        cargo \
        ruby \
        ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g typescript@5.4.5 \
 && useradd -m -u 1001 sandbox \
 && mkdir -p /code && chown sandbox:sandbox /code

# Cache locations for Go + Rust. tmpfs mounts override these at runtime
# (per /run request), but having them set keeps host-mode + tests sane.
ENV GOCACHE=/tmp/gocache \
    GOPATH=/tmp/gopath \
    CARGO_HOME=/tmp/cargo

EXPOSE 4000

# Render mode runs everything inside this single container — no nested
# Docker — so the executor falls back to host-mode subprocess calls.
# That's safe for /check (compilers parse only, never execute code).
ENV SANDBOX_MODE=host \
    LOG_PATH=/tmp/executions.log

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .

USER sandbox
CMD ["node", "server.js"]
