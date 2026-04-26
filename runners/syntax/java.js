import { dockerRun } from '../_dockerRun.js'
import { parseJavac } from './_parsers.js'

// javac with -d /tmp emits class files into tmpfs (then discarded with the
// container). This is parse-and-type-check only; nothing executes. -Xlint:all
// makes the diagnostics richer, which is what students need.
export default async ({ code }) => {
  const result = await dockerRun({
    files: { 'Main.java': code },
    cmd: ['sh', '-c',
      'mkdir -p /tmp/out && javac -Xlint:all -d /tmp/out /code/Main.java 2>&1',
    ],
    timeoutMs: 10000,
  })
  return {
    diagnostics: parseJavac(result.stdout + result.stderr),
    raw:         result.stdout + result.stderr,
    timedOut:    result.timedOut,
  }
}
