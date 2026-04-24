# Code Sandbox

A small Node.js backend that executes user-submitted code across eight languages inside disposable Docker containers — sandboxed, resource-capped, time-limited.

**Languages:** Python · JavaScript · TypeScript · HTML · C++ · Go · Rust · Java

---

## Run it

```bash
./start.sh
```

That's it. The script:

- Uses system Node if available, falls back to a cached Node binary
- Installs dependencies on first run
- Detects Docker — uses secure mode if the daemon is up, host mode otherwise
- Builds the `sandbox-runner` image on first Docker run (~2 min)
- Boots the server on `http://localhost:4000`

### Host vs Docker mode

| Mode | Trigger | Isolation | Use for |
|------|---------|-----------|---------|
| **Docker** (default) | Docker daemon running | Full sandbox — network off, read-only FS, memory/CPU/PID caps | Anything untrusted |
| **Host** (fallback) | No Docker, or `SANDBOX_MODE=host` | None — runs directly on your machine | Local dev only |

---

## API

### `POST /run`

```json
{
  "language": "python",
  "code": "print(input())",
  "stdin": "hello\n"
}
```

Returns:

```json
{
  "stdout": "hello\n",
  "stderr": "",
  "exitCode": 0,
  "timedOut": false
}
```

HTML is a special case — it's returned as-is with `mode: "iframe"` so the caller can render it in a sandboxed `<iframe srcdoc>`. No execution happens server-side.

### `GET /health`

Returns `{ ok: true, languages: [...] }`.

---

## Security

Every request runs inside a fresh `docker run --rm` container with:

| Flag | Why |
|------|-----|
| `--network none` | No outbound traffic |
| `--read-only` | Rootfs immutable |
| `--tmpfs /tmp:rw,size=16m` | Scratch space for compilers |
| `--memory 128m --memory-swap 128m` | Hard cap, no swap |
| `--cpus 0.5` | Half a core |
| `--pids-limit 64` | Blocks fork bombs |
| `--cap-drop ALL` | No Linux capabilities |
| `--security-opt no-new-privileges` | Prevents setuid escalation |
| Non-root user (`sandbox`) | Defense in depth |
| Per-language timeout (4-10s) | `docker kill` on expiry |

Input is also validated at the API boundary: allowlisted languages, code ≤ 64 KB, stdin ≤ 16 KB.

---

## Architecture

```
server.js                    # Express, validation, logging
executor.js                  # Language → runner dispatch
logger.js                    # JSON-lines → executions.log
runners/
├── _dockerRun.js            # Shared docker primitive
├── _hostRun.js              # Dev-only host fallback
├── python.js · javascript.js · typescript.js · html.js
└── cpp.js · go.js · rust.js · java.js
Dockerfile                   # node:20-alpine + python3 + go + rust + openjdk17
```

Adding a language is ~10 lines: a new file in `runners/`, a line in `executor.js`, and the toolchain in the Dockerfile.

---

## Logging

Every execution appends a JSON line to `executions.log`:

```json
{"ts":"2026-04-24T15:23:10.111Z","event":"run","language":"python","bytes":32,"stdinBytes":6,"exitCode":0,"timedOut":false,"durationMs":49}
```

Safe to tail/grep/ship to any log aggregator.

---

## Quirks

- **Java** — the class must be named `Main` (we force the file to `Main.java`). Write `class Main { public static void main(String[] args) { … } }`.
- **Go** — needs the full `package main` + `func main()` form. No `go.mod` needed (`GOFLAGS=-mod=mod` is set).
- **Rust / Java / Go** — first-run compile takes several seconds. Timeouts are set to 10s for these.

---

## Stack

Node 20 · Express 4 · Docker · TypeScript (for the TS runner) · Python 3 · g++ (C++17) · Go · rustc (2021 edition) · OpenJDK 17
