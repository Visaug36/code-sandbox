import { appendFile } from 'node:fs/promises'

// JSON-lines log. One line per execution. Safe to tail/grep/ship to any
// log aggregator. Failures to write are swallowed — logging must never
// break the request path.
const LOG_PATH = process.env.LOG_PATH || './executions.log'

export function log(entry) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n'
  appendFile(LOG_PATH, line).catch(() => {})
  if (process.env.NODE_ENV !== 'test') process.stdout.write(line)
}
