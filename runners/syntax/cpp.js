import { dockerRun } from '../_dockerRun.js'
import { parseGcc } from './_parsers.js'

// -fsyntax-only: parse + check, but DON'T compile/link/run. Safe to feed
// arbitrary code through. -w suppresses ALL warnings — for an educational
// syntax checker we only want to surface real errors, not 'unused variable'
// or other quality nags that will distract students who are just learning.
// Combine stdout+stderr (gcc emits diagnostics on stderr).
export default async ({ code }) => {
  const result = await dockerRun({
    files: { 'main.cpp': code },
    cmd: ['sh', '-c',
      'g++ -fsyntax-only -std=c++17 -w /code/main.cpp 2>&1',
    ],
    timeoutMs: 8000,
  })
  // Defense-in-depth: even if a warning slipped through, drop non-errors.
  const diagnostics = parseGcc(result.stdout + result.stderr)
    .filter(d => d.severity === 'error')
  return {
    diagnostics,
    raw:         result.stdout + result.stderr,
    timedOut:    result.timedOut,
  }
}
