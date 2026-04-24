import { dockerRun } from './_dockerRun.js'

// python3 -u forces unbuffered stdout so logs stream even on short runs
export default ({ code, stdin }) => dockerRun({
  files: { 'main.py': code },
  cmd:   ['python3', '-u', '/code/main.py'],
  stdin,
})
