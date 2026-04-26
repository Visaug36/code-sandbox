import { dockerRun } from '../_dockerRun.js'
import { parseRuby } from './_parsers.js'

// `ruby -c` is "check syntax only" — parses without executing. Prints
// "Syntax OK" on success or `<file>:<line>: <message>` on failure.
export default async ({ code }) => {
  const result = await dockerRun({
    files: { 'main.rb': code },
    cmd: ['ruby', '-c', '/code/main.rb'],
    timeoutMs: 6000,
  })
  return {
    diagnostics: parseRuby(result.stdout + result.stderr),
    raw:         result.stdout + result.stderr,
    timedOut:    result.timedOut,
  }
}
