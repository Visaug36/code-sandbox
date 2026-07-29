import { dockerRun } from '../_dockerRun.js'
import { parseJavac } from './_parsers.js'

// javac with -d /tmp emits class files into tmpfs (then discarded with the
// container). This is parse-and-type-check only; nothing executes.
//
// No -Xlint. It surfaced warnings like "[rawtypes] found raw type: List" on
// programs that compile perfectly, which read as three errors in a tool whose
// whole claim is telling you what is broken. Warnings are filtered out for the
// same reason the C++ runner passes -w: this is a syntax checker, not a linter.
export default async ({ code }) => {
  const result = await dockerRun({
    files: { 'Main.java': code },
    cmd: ['sh', '-c',
      'mkdir -p /tmp/out && javac -d /tmp/out /code/Main.java 2>&1',
    ],
    timeoutMs: 10000,
  })
  const diagnostics = parseJavac(result.stdout + result.stderr)
    .filter(d => d.severity === 'error')
  return {
    diagnostics,
    raw:         result.stdout + result.stderr,
    timedOut:    result.timedOut,
  }
}
