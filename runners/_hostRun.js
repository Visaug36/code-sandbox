import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// ⚠️ HOST MODE — dev-only fallback. Executes on the host with NO sandbox.
// Do not run untrusted code here. Use dockerRun (SANDBOX_MODE=docker) in
// any real deployment. Kept in-tree so the project is runnable before
// Docker is installed.
const DEFAULT_TIMEOUT_MS = Number(process.env.SANDBOX_TIMEOUT_MS || 4000)
const MAX_OUTPUT         = 64 * 1024

export async function hostRun({ files, cmd, stdin = '', timeoutMs }) {
  const workDir = await mkdtemp(join(tmpdir(), 'sbx-host-'))
  const limitMs = timeoutMs ?? DEFAULT_TIMEOUT_MS
  try {
    for (const [name, content] of Object.entries(files)) {
      await writeFile(join(workDir, name), content, 'utf8')
    }

    // cmd is an array like ['python3', '-u', 'main.py'] — first is program,
    // rest are args. Rewrite every '/code/' and '/tmp/out' reference so the
    // same runner cmds work outside the container.
    const rewrite = (s) => s
      .replaceAll('/code/', `${workDir}/`)
      .replaceAll('/code',   workDir)
      .replaceAll('/tmp/out', `${workDir}/out`)
    const [program, ...args] = cmd.map(rewrite)

    return await new Promise((resolve) => {
      const proc = spawn(program, args, { cwd: workDir })
      let stdout = '', stderr = ''
      let timedOut = false

      const timer = setTimeout(() => {
        timedOut = true
        proc.kill('SIGKILL')
      }, limitMs)

      proc.stdout.on('data', d => { if (stdout.length < MAX_OUTPUT) stdout += d.toString() })
      proc.stderr.on('data', d => { if (stderr.length < MAX_OUTPUT) stderr += d.toString() })
      proc.stdin.on('error', () => {})
      if (stdin) proc.stdin.write(stdin)
      proc.stdin.end()

      proc.on('close', (exitCode) => {
        clearTimeout(timer)
        resolve({ stdout: clip(stdout), stderr: clip(stderr), exitCode: exitCode ?? -1, timedOut })
      })
      proc.on('error', (err) => {
        clearTimeout(timer)
        resolve({ stdout: '', stderr: `spawn error: ${err.message}`, exitCode: -1, timedOut: false })
      })
    })
  } finally {
    rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

function clip(s) {
  return s.length > MAX_OUTPUT ? s.slice(0, MAX_OUTPUT) + '\n…[truncated]' : s
}
