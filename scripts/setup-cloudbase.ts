import { APP_CONFIG, STUDY_PLAN } from '../src/data/plan'

const apiBase = process.env.CLOUDBASE_API_URL?.replace(/\/$/, '')
const setupToken = process.env.SETUP_TOKEN
const teamCode = process.env.TEAM_CODE
const adminPin = process.env.ADMIN_PIN
const adminName = process.env.ADMIN_NAME || '管理员'

if (!apiBase || !setupToken || !teamCode || !adminPin) {
  console.error('缺少环境变量：CLOUDBASE_API_URL、SETUP_TOKEN、TEAM_CODE、ADMIN_PIN')
  process.exit(1)
}

const response = await fetch(`${apiBase}/setup`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-setup-token': setupToken },
  body: JSON.stringify({ teamCode, adminName, adminPin, tasks: STUDY_PLAN, appConfig: APP_CONFIG })
})
const payload = await response.json() as { data?: { message?: string }; message?: string }
if (!response.ok) {
  console.error(payload.message || `初始化失败：HTTP ${response.status}`)
  process.exit(1)
}
console.log(payload.data?.message || 'CloudBase初始化完成')
