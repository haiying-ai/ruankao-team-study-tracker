import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const envId = process.argv[2]
if (!envId) throw new Error('Environment ID is required')

const cliPath = fileURLToPath(new URL('../node_modules/@cloudbase/cli/bin/tcb', import.meta.url))
const getResult = spawnSync(process.execPath, [cliPath, '-e', envId, 'policy', 'get', '--json'], { encoding: 'utf8' })
if (getResult.status !== 0) throw new Error('Unable to read the current policy')

const currentPolicy = JSON.parse(getResult.stdout).data.Item.Value
const hash = currentPolicy.match(/X-Team-Proof"\]\s*==\s*"([0-9a-f]{64})"/i)?.[1]
if (!hash) throw new Error('Existing team proof was not found')

const template = readFileSync(new URL('../cloudbase/policy.rego', import.meta.url), 'utf8')
const policy = template.replaceAll('__TEAM_CODE_SHA256__', hash)
const setResult = spawnSync(process.execPath, [cliPath, '-y', '-e', envId, 'policy', 'set', policy, '--json'], { encoding: 'utf8' })
if (setResult.status !== 0) throw new Error('Unable to update the team policy')

console.log(JSON.stringify({ updated: true, apiScoped: true, hasDeny: policy.includes('deny contains') }))
