import express from 'express'
import { runCode, SUPPORTED } from './executor.js'
import { log } from './logger.js'

const MAX_CODE_BYTES  = 64 * 1024
const MAX_STDIN_BYTES = 16 * 1024
const PORT            = Number(process.env.PORT || 4000)

const app = express()
app.use(express.json({ limit: '256kb' }))

app.get('/health', (_req, res) => res.json({ ok: true, languages: SUPPORTED }))

app.post('/run', async (req, res) => {
  const { language, code, stdin = '' } = req.body ?? {}

  // Input validation — reject fast before ever touching docker
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
