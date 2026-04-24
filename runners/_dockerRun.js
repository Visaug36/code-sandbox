import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { hostRun } from './_hostRun.js'

// Shared docker-exec primitive. Writes the caller's files into a host temp
// dir, mounts it read-only into the container, wires stdin, and kills the
// container on timeout. Returns {stdout, stderr, exitCode, timedOut}.
const IMAGE              = process.env.SANDBOX_IMAGE || 'sandbox-runner:latest'
const DEFAULT_TIMEOUT_MS = Number(process.env.SANDBOX_TIMEOUT_MS || 4000)
const MAX_OUTPUT         = 64 * 1024

// Dev escape hatch: when SANDBOX_MODE=host, bypass Docker and run on the
// host directly. Only for local iteration before Docker is installed.
const USE_HOST = process.env.SANDBOX_MODE === 'host'

export async function dockerRun(opts) {
  if (USE_HOST) return hostRun(opts)
  return _dockerRun(opts)
}

async function _dockerRun({ files, cmd, stdin = '', timeoutMs }) {
  const workDir       = await mkdtemp(join(tmpdir(), 'sbx-'))
  const containerName = `sbx-${randomUUID().slice(0, 12)}`
  const limitMs       = timeoutMs ?? DEFAULT_TIMEOUT_MS

  try {
    // Stage user code into the host dir we'll mount RO into the container
    for (const [name, content] of Object.entries(files)) {
      await writeFile(join(workDir, name), content, 'utf8')
    }

    const args = [
      'run', '--rm', '-i',
      '--name', containerName,
      '--network', 'none',                           // no outbound net
      '--memory', '128m', '--memory-swap', '128m',   // hard cap, no swap
      '--cpus', '0.5',
      '--pids-limit', '64',                          // fork-bomb guard
      '--read-only',                                 // rootfs immutable
      '--tmpfs', '/tmp:rw,size=16m,mode=1777',       // scratch for tsc etc.
      '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges',
      '-v', `${workDir}:/code:ro`,
      '-w', '/code',
      IMAGE,
      ...cmd,
    ]

    return await new Promise((resolve) => {
      const proc = spawn('docker', args)
      let stdout = '', stderr = ''
      let timedOut = false

      const timer = setTimeout(() => {
        timedOut = true
        // Fire-and-forget kill; `docker run --rm` handles cleanup
        const kill = spawn('docker', ['kill', containerName])
        kill.on('error', () => {})
      }, limitMs)

      proc.stdout.on('data', d => {
        if (stdout.length < MAX_OUTPUT) stdout += d.toString()
      })
      proc.stderr.on('data', d => {
        if (stderr.length < MAX_OUTPUT) stderr += d.toString()
      })

      proc.stdin.on('error', () => {}) // swallow EPIPE when container exits early
      if (stdin) proc.stdin.write(stdin)
      proc.stdin.end()

      proc.on('close', (exitCode) => {
        clearTimeout(timer)
        resolve({
          stdout:   clip(stdout),
          stderr:   clip(stderr),
          exitCode: exitCode ?? -1,
          timedOut,
        })
      })

      proc.on('error', (err) => {
        clearTimeout(timer)
        resolve({
          stdout:   '',
          stderr:   `spawn error: ${err.message}`,
          exitCode: -1,
          timedOut: false,
        })
      })
    })
  } finally {
    rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

function clip(s) {
  return s.length > MAX_OUTPUT ? s.slice(0, MAX_OUTPUT) + '\n…[truncated]' : s
}
