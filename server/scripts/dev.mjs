import { spawn } from 'node:child_process'

const tsc = spawn(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json', '--watch', '--preserveWatchOutput'], { stdio: ['inherit', 'pipe', 'inherit'] })
let api
let output = ''
tsc.stdout.on('data', chunk => {
  const text = String(chunk)
  process.stdout.write(text)
  output = (output + text).slice(-1000)
  if (!api && /Found 0 errors\. Watching for file changes\./.test(output)) {
    api = spawn(process.execPath, ['--watch', 'dist/src/main.js'], { stdio: 'inherit' })
  }
})
const stop = () => { api?.kill('SIGTERM'); tsc.kill('SIGTERM') }
process.once('SIGTERM', stop)
process.once('SIGINT', stop)
tsc.once('exit', code => { api?.kill('SIGTERM'); process.exit(code ?? 1) })
