// Each compiler/interpreter prints errors in its own format. These parsers
// turn raw stdout/stderr into structured diagnostics the frontend can render.
//
// Diagnostic shape (mirrors syntax-inspector's checkers):
//   { line, column, severity, message, type }

// ── GCC / Clang (C++, C) ─────────────────────────────────────────────────
// Format: <path>:<line>:<col>: <severity>: <message>
//         <path>:<line>:<col>: error: missing terminating " character
const GCC_RE = /^(?:[^:\n]+):(\d+):(\d+):\s+(error|warning|note|fatal error):\s+(.+?)$/

// ── Javac ────────────────────────────────────────────────────────────────
// Format: <path>:<line>: error: <message>
//           <source line>
//           <caret>
// No column number; we infer it from the caret line that follows.
const JAVAC_RE = /^(?:[^:\n]+):(\d+):\s+(error|warning):\s+(.+?)$/

// ── Ruby ─────────────────────────────────────────────────────────────────
// Format: <path>:<line>: <message> (when -c flag is used)
const RUBY_RE = /^(?:[^:\n]+):(\d+):\s+(.+?)$/

export function parseGcc(output) {
  const errors = []
  for (const line of output.split('\n')) {
    const m = line.match(GCC_RE)
    if (!m) continue
    const [, l, c, sev, msg] = m
    if (sev === 'note') continue // notes follow real errors, skip noise
    errors.push({
      line:     parseInt(l),
      column:   Math.max(0, parseInt(c) - 1),
      severity: sev.includes('error') ? 'error' : 'warning',
      message:  msg.trim(),
      type:     'Compile',
    })
  }
  return dedupe(errors)
}

export function parseJavac(output) {
  const errors = []
  const lines = output.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(JAVAC_RE)
    if (!m) continue
    const [, l, sev, msg] = m
    // javac points at the column with a caret on the line N+2 (offset varies)
    let column = 0
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const caret = lines[j].indexOf('^')
      if (caret >= 0) { column = caret; break }
    }
    errors.push({
      line:     parseInt(l),
      column,
      severity: sev === 'error' ? 'error' : 'warning',
      message:  msg.trim(),
      type:     'Compile',
    })
  }
  return dedupe(errors)
}

export function parseRuby(output) {
  const errors = []
  for (const line of output.split('\n')) {
    if (line.startsWith('Syntax OK')) return [] // ruby -c success marker
    const m = line.match(RUBY_RE)
    if (!m) continue
    const [, l, msg] = m
    errors.push({
      line:     parseInt(l),
      column:   0, // ruby -c doesn't report columns
      severity: 'error',
      message:  msg.trim(),
      type:     'Syntax',
    })
  }
  return dedupe(errors)
}

function dedupe(errors) {
  const seen = new Set()
  return errors.filter(e => {
    const k = `${e.line}:${e.column}:${e.message}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
