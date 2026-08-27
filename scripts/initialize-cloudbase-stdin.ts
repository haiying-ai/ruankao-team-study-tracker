import { APP_CONFIG, STUDY_PLAN } from '../src/data/plan'

const chunks: Buffer[] = []
for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
const [apiBase, setupToken, teamCode, adminPin, adminName = '管理员'] = Buffer.concat(chunks).toString('utf8').split(/\r?\n/)

if (!apiBase || !setupToken || !teamCode || !adminPin) {
  console.error('Expected five input lines: API URL, setup token, team code, admin PIN, admin name')
  process.exit(1)
}

const response = await fetch(`${apiBase.replace(/\/$/, '')}/setup`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-setup-token': setupToken },
  body: JSON.stringify({ teamCode, adminName, adminPin, tasks: STUDY_PLAN, appConfig: APP_CONFIG })
})
const payload = await response.json() as { data?: { message?: string }; message?: string }
if (!response.ok) {
  console.error(payload.message || `Initialization failed: HTTP ${response.status}`)
  process.exit(1)
}
console.log(payload.data?.message || 'CloudBase initialized')
