import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const envId = process.argv[2]
if (!envId) {
  console.error('Usage: node scripts/set-cloudbase-policy.mjs <env-id>')
  process.exit(1)
}

const policy = process.argv[3]
  ? readFileSync(process.argv[3], 'utf8')
  : readFileSync(new URL('../cloudbase/policy.rego', import.meta.url), 'utf8')
const cliPath = fileURLToPath(new URL('../node_modules/@cloudbase/cli/dist/standalone/cli.js', import.meta.url))
const result = spawnSync(process.execPath, [cliPath, '-e', envId, 'policy', 'set', policy, '--json'], { stdio: 'inherit', shell: false })
if (result.error) console.error(result.error.message)
process.exit(result.status ?? 1)
