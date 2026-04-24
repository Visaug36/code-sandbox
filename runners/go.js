import { dockerRun } from './_dockerRun.js'

// go run needs GOCACHE + GOPATH writable. tmpfs/mktemp covers both.
// GOFLAGS=-mod=mod lets single-file programs run without a go.mod.
export default ({ code, stdin }) => dockerRun({
  files: { 'main.go': code },
  cmd: ['sh', '-c',
    'export GOCACHE=$(mktemp -d) GOPATH=$(mktemp -d) GOFLAGS=-mod=mod && ' +
    'go run /code/main.go',
  ],
  stdin,
  timeoutMs: 10000, // first-run cache warm-up is slow
})
