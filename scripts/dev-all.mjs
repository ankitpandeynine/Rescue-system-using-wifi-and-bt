import { spawn } from 'node:child_process'

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const children = [
  spawn(npm, ['run', 'backend'], { stdio: 'inherit', shell: process.platform === 'win32' }),
  spawn(npm, ['run', 'dev', '--', '--host', '0.0.0.0'], { stdio: 'inherit', shell: process.platform === 'win32' }),
]

function stop() {
  for (const child of children) child.kill()
}

process.on('SIGINT', () => { stop(); process.exit(0) })
process.on('SIGTERM', () => { stop(); process.exit(0) })
for (const child of children) child.on('exit', (code) => { if (code && code !== 0) process.exitCode = code })
