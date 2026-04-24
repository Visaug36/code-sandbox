import python     from './runners/python.js'
import javascript from './runners/javascript.js'
import typescript from './runners/typescript.js'
import html       from './runners/html.js'
import cpp        from './runners/cpp.js'
import go         from './runners/go.js'
import rust       from './runners/rust.js'
import java       from './runners/java.js'

const RUNNERS = { python, javascript, typescript, html, cpp, go, rust, java }

export const SUPPORTED = Object.keys(RUNNERS)

export async function runCode(language, code, stdin) {
  const runner = RUNNERS[language]
  if (!runner) throw new Error(`unsupported language: ${language}`)
  return runner({ code, stdin })
}
