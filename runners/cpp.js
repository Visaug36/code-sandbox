import { dockerRun } from './_dockerRun.js'

// g++ compiles to a mktemp path inside the writable tmpfs, then executes.
// -O0 keeps compile fast; we're not benchmarking.
export default ({ code, stdin }) => dockerRun({
  files: { 'main.cpp': code },
  cmd: ['sh', '-c',
    'BIN=$(mktemp) && g++ -O0 -std=c++17 /code/main.cpp -o $BIN && $BIN',
  ],
  stdin,
  timeoutMs: 8000, // compile + run
})
