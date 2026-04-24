import { dockerRun } from './_dockerRun.js'

// Java insists that a public class Foo live in Foo.java. We force the name
// Main so users write `class Main { public static void main(String[] args) }`
// and the mapping is deterministic. javac won't write next to /code (RO),
// so compile + run in a scratch dir.
export default ({ code, stdin }) => dockerRun({
  files: { 'Main.java': code },
  cmd: ['sh', '-c',
    'DIR=$(mktemp -d) && cp /code/Main.java $DIR/ && cd $DIR && ' +
    'javac Main.java && java -cp . Main',
  ],
  stdin,
  timeoutMs: 10000, // JVM warm-up
})
