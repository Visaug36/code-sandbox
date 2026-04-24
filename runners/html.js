// HTML is not executed server-side. Return the raw source so the client
// can drop it into a sandboxed <iframe srcdoc>. Shape mirrors the other
// runners so the API response stays uniform.
export default ({ code }) => ({
  stdout:   code,
  stderr:   '',
  exitCode: 0,
  timedOut: false,
  mode:     'iframe',
})
