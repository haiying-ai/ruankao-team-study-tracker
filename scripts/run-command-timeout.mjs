import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const requestPath = process.argv[2]
if (!requestPath) throw new Error('Missing command request path')
const request = JSON.parse(readFileSync(requestPath, 'utf8'))
for (const key of ['filePath', 'cwd', 'stdoutPath', 'stderrPath', 'resultPath']) {
  if (!request[key]) throw new Error(`Missing request field: ${key}`)
}

mkdirSync(dirname(request.stdoutPath), { recursive: true })
mkdirSync(dirname(request.stderrPath), { recursive: true })
mkdirSync(dirname(request.resultPath), { recursive: true })
const stdout = openSync(request.stdoutPath, 'w')
const stderr = openSync(request.stderrPath, 'w')
const startedAt = Date.now()
let timedOut = false
let spawnError = null

const child = spawn(request.filePath, request.args ?? [], {
  cwd: request.cwd,
  shell: false,
  windowsHide: true,
  stdio: ['ignore', stdout, stderr]
})

child.on('error', (error) => { spawnError = error.message })
const timer = setTimeout(() => {
  timedOut = true
  if (process.platform === 'win32' && child.pid) {
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
      timeout: 1500
    })
  }
  if (!child.killed) child.kill('SIGKILL')
}, Math.max(1, Number(request.timeoutSeconds ?? 90)) * 1000)

child.on('close', (code, signal) => {
  clearTimeout(timer)
  closeSync(stdout)
  closeSync(stderr)
  writeFileSync(request.resultPath, JSON.stringify({
    exitCode: Number.isInteger(code) ? code : -1,
    timedOut,
    signal: signal ?? null,
    error: spawnError,
    elapsedMs: Date.now() - startedAt
  }), 'utf8')
})
