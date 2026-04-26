import cpp  from './cpp.js'
import java from './java.js'
import ruby from './ruby.js'

const CHECKERS = { cpp, java, ruby }

export const SUPPORTED_CHECK = Object.keys(CHECKERS)

export async function checkSyntax(language, code) {
  const fn = CHECKERS[language]
  if (!fn) throw new Error(`unsupported language: ${language}`)
  return fn({ code })
}
