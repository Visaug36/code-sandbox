import { dockerRun } from '../_dockerRun.js'
import { parseGcc } from './_parsers.js'

// -fsyntax-only: parse + check, but DON'T compile/link/run. Safe to feed
// arbitrary code through. Combine stdout+stderr (gcc emits diagnostics on
// stderr but we want a single stream).
export default async ({ code }) => {
  const result = await dockerRun({
    files: { 'main.cpp': code },
    cmd: ['sh', '-c',
      'g++ -fsyntax-only -std=c++17 -Wall /code/main.cpp 2>&1',
    ],
    timeoutMs: 8000,
  })
  return {
    diagnostics: parseGcc(result.stdout + result.stderr),
    raw:         result.stdout + result.stderr,
    timedOut:    result.timedOut,
  }
}
