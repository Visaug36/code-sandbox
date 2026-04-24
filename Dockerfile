# Single image carrying all runtimes. Built once via `npm run build:image`
# and reused for every execution — the server spawns disposable containers
# from this base with `docker run --rm`.
#
# Layers are ordered by churn: stable OS packages first, then language
# toolchains, then tiny per-language installs (typescript via npm) — so
# iterating on any one language only rebuilds the tail.
FROM node:20-alpine

RUN apk add --no-cache \
        python3 \
        build-base \
        go \
        rust \
        cargo \
        openjdk17 \
 && npm install -g typescript@5.4.5 \
 && adduser -D -u 1000 sandbox \
 && mkdir -p /code && chown sandbox:sandbox /code

# Give Go + Rust pre-populated cache dirs so per-run compiles are faster.
# tmpfs mounts override these at runtime, but the fallback keeps host mode
# and unprivileged tests happy.
ENV GOCACHE=/tmp/gocache \
    GOPATH=/tmp/gopath  \
    CARGO_HOME=/tmp/cargo

USER sandbox
WORKDIR /code
