import { dockerRun } from '../_dockerRun.js'

// Python's real parser via the built-in compile() builtin. Catches every
// syntax error CPython would catch — indentation, missing colons, await
// outside async, return at module level, identifiers starting with digits,
// f-string expression errors, etc.
//
// Python's compile() reports only the FIRST error then bails. To surface
// MULTIPLE errors per file we run a retry-mask loop in the probe: capture
// the error, blank out that line, recompile. Same trick the JS checker
// uses with @babel/parser. Caps at 10 errors and bails if location stops
// advancing (prevents infinite loops on unrecoverable code).
const PROBE = `
import sys, json

src = sys.stdin.read()
errors = []
working = src
last_loc = None

for _ in range(10):
    try:
        compile(working, '<input>', 'exec')
        break
    except SyntaxError as e:
        loc = (e.lineno, e.offset)
        if loc == last_loc:
            break
        last_loc = loc
        errors.append({
            'line':    e.lineno or 1,
            'column':  max(0, (e.offset or 1) - 1),
            'message': e.msg or 'Syntax error',
        })
        # Mask the offending line so the next iteration finds the next bug
        if e.lineno:
            lines = working.split('\\n')
            if 1 <= e.lineno <= len(lines):
                lines[e.lineno - 1] = ' ' * len(lines[e.lineno - 1])
                working = '\\n'.join(lines)
            else:
                break
        else:
            break
    except (IndentationError, TabError) as e:
        errors.append({
            'line':    e.lineno or 1,
            'column':  max(0, (e.offset or 1) - 1),
            'message': e.msg or 'Indentation error',
        })
        break

print(json.dumps(errors))
`

export default async ({ code }) => {
  const result = await dockerRun({
    files: { 'probe.py': PROBE, 'main.py': code },
    cmd: ['sh', '-c', 'python3 /code/probe.py < /code/main.py 2>&1'],
    timeoutMs: 5000,
  })

  const out = result.stdout.trim()

  // Python printed our JSON line; everything else (e.g. interpreter crash)
  // is surfaced as a single fallback diagnostic so the user still sees something.
  let diagnostics = []
  try {
    const lastLine = out.split('\n').filter(Boolean).pop() ?? '[]'
    const parsed = JSON.parse(lastLine)
    diagnostics = parsed.map(d => ({
      line:     d.line,
      column:   d.column,
      severity: 'error',
      message:  d.message,
      type:     'Syntax',
    }))
  } catch {
    if (out) {
      diagnostics = [{
        line: 1, column: 0, severity: 'error',
        message: 'Python parser error: ' + out.slice(0, 200),
        type: 'Syntax',
      }]
    }
  }

  return {
    diagnostics,
    raw:      out,
    timedOut: result.timedOut,
  }
}
