import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const script = fileURLToPath(new URL('./deploy-cloudbase.ps1', import.meta.url))
const planOnly = process.argv.includes('--plan-only')
const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Target', 'Api']
if (planOnly) args.push('-PlanOnly')

const result = spawnSync('powershell.exe', args, {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: false,
  windowsHide: true
})
if (result.error) throw result.error
process.exit(result.status ?? 1)
