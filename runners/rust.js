import { dockerRun } from './_dockerRun.js'

// rustc compiles to a scratch binary, then runs it. Edition 2021 is
// the modern default; no -O so compile stays fast.
export default ({ code, stdin }) => dockerRun({
  files: { 'main.rs': code },
  cmd: ['sh', '-c',
    'BIN=$(mktemp) && rustc --edition 2021 /code/main.rs -o $BIN 2>&1 && $BIN',
  ],
  stdin,
  timeoutMs: 10000, // rustc is not fast
})
