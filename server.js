import express from 'express'
import { runCode, SUPPORTED } from './executor.js'
import { checkSyntax, SUPPORTED_CHECK } from './runners/syntax/index.js'
import { log } from './logger.js'
import { rateLimit } from './rateLimit.js'

const MAX_CODE_BYTES  = 64 * 1024
const MAX_STDIN_BYTES = 16 * 1024
const PORT            = Number(process.env.PORT || 4000)

// ⚠️ /run EXECUTES ARBITRARY USER CODE. It is only safe when _dockerRun.js
// takes its Docker path, which supplies the actual isolation: --network none,
// a 128m memory cap, --pids-limit, --read-only rootfs and --cap-drop ALL.
//
// The Render deployment sets SANDBOX_MODE=host (no Docker-in-Docker on that
// tier), which bypasses every one of those protections — user code then runs
// as a plain subprocess in the app container, with working outbound network
// access and read access to this source tree. Note that CORS does NOT gate
// this: it is browser-enforced only, so any curl request sails past it.
//
// So /run is OFF unless explicitly enabled. Turning it on is a deliberate act
// that should only happen where dockerRun really uses Docker. /check is
// unaffected — compilers there run in parse-only modes and never execute.
const RUN_ENABLED = process.env.RUN_ENABLED === 'true'
const SANDBOX_MODE = process.env.SANDBOX_MODE || 'docker'

const app = express()
app.use(express.json({ limit: '256kb' }))

// CORS — allow listed origins only. Default is the Cloudflare Pages + GitHub Pages sites +
// localhost dev ports; override at deploy time via ALLOWED_ORIGINS env
// (comma-separated). Locked to GET/POST + JSON, no credentials, so a
// leaked URL can't impersonate the user.
const DEFAULT_ORIGINS = [
  'https://visaug36.github.io',
  'https://lintwick.pages.dev',
  'http://localhost:3030',
  'http://localhost:5173',
]
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean))
    ?? DEFAULT_ORIGINS
)
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Access-Control-Max-Age', '86400')
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

// Advertise only what this deployment will actually serve, so clients don't
// build UI around an endpoint that is going to refuse them.
app.get('/health', (_req, res) => res.json({
  ok: true,
  run:   runAvailable() ? SUPPORTED : [],
  check: SUPPORTED_CHECK,
}))

// /run is available only when it was explicitly enabled AND the executor has
// real isolation behind it. Host mode is a dev-only fallback, so an enabled
// flag there is treated as a misconfiguration rather than consent.
function runAvailable() {
  return RUN_ENABLED && SANDBOX_MODE !== 'host'
}

// Rate-limit /check and /run only. Health stays public for uptime probes.
app.use(['/check', '/run'], rateLimit)

// ── /check — syntax validation only, no execution ─────────────────────────
// Runs g++/javac/ruby in their parse-only modes inside the same Docker
// sandbox. Returns structured diagnostics (line, column, message) parsed
// from real compiler output — perfect for educational use.
app.post('/check', async (req, res) => {
  const { language, code } = req.body ?? {}

  if (!SUPPORTED_CHECK.includes(language)) {
    return res.status(400).json({ error: 'unsupported language', supported: SUPPORTED_CHECK })
  }
  if (typeof code !== 'string' || code.length === 0 || code.length > MAX_CODE_BYTES) {
    return res.status(400).json({ error: 'invalid code (must be 1..65536 chars)' })
  }

  const started = Date.now()
  try {
    const result = await checkSyntax(language, code)
    log({
      event:      'check',
      language,
      bytes:      code.length,
      diagCount:  result.diagnostics.length,
      timedOut:   result.timedOut,
      durationMs: Date.now() - started,
    })
    res.json(result)
  } catch (err) {
    log({
      event:      'check_error',
      language,
      error:      err.message,
      durationMs: Date.now() - started,
    })
    res.status(500).json({ error: 'check failed', detail: err.message })
  }
})

// ── /run — full execution (existing endpoint) ─────────────────────────────
app.post('/run', async (req, res) => {
  // Refuse before touching the body. Two separate reasons, reported
  // distinctly so a misconfigured deploy is obvious in the response.
  if (!RUN_ENABLED) {
    return res.status(403).json({
      error: 'execution disabled',
      hint:  'This deployment serves syntax checking only. Set RUN_ENABLED=true on a host where the Docker sandbox is available to turn execution on.',
    })
  }
  if (SANDBOX_MODE === 'host') {
    return res.status(403).json({
      error: 'execution disabled: unsafe sandbox mode',
      hint:  'RUN_ENABLED=true but SANDBOX_MODE=host, which runs user code without isolation. Refusing to execute.',
    })
  }

  const { language, code, stdin = '' } = req.body ?? {}

  if (!SUPPORTED.includes(language)) {
    return res.status(400).json({ error: 'unsupported language', supported: SUPPORTED })
  }
  if (typeof code !== 'string' || code.length === 0 || code.length > MAX_CODE_BYTES) {
    return res.status(400).json({ error: 'invalid code (must be 1..65536 chars)' })
  }
  if (typeof stdin !== 'string' || stdin.length > MAX_STDIN_BYTES) {
    return res.status(400).json({ error: 'invalid stdin (max 16384 chars)' })
  }

  const started = Date.now()
  try {
    const result = await runCode(language, code, stdin)
    log({
      event:      'run',
      language,
      bytes:      code.length,
      stdinBytes: stdin.length,
      exitCode:   result.exitCode,
      timedOut:   result.timedOut,
      durationMs: Date.now() - started,
    })
    res.json(result)
  } catch (err) {
    log({
      event:      'run_error',
      language,
      error:      err.message,
      durationMs: Date.now() - started,
    })
    res.status(500).json({ error: 'execution failed', detail: err.message })
  }
})

app.listen(PORT, () => {
  process.stdout.write(`sandbox listening on :${PORT}\n`)
})
