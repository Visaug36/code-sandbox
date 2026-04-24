import { dockerRun } from './_dockerRun.js'

export default ({ code, stdin }) => dockerRun({
  files: { 'main.js': code },
  cmd:   ['node', '/code/main.js'],
  stdin,
})
