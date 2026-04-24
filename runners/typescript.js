import { dockerRun } from './_dockerRun.js'

// /code is mounted RO, so tsc must emit into /tmp (tmpfs, writable).
// Compile + run happen in one shell invocation so the whole pipeline
// lives inside a single container.
export default ({ code, stdin }) => dockerRun({
  files: { 'main.ts': code },
  cmd: [
    'sh', '-c',
    'tsc --target es2022 --module commonjs --outDir /tmp/out /code/main.ts && node /tmp/out/main.js',
  ],
  stdin,
})
