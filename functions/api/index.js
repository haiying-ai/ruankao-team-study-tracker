'use strict'

const crypto = require('node:crypto')
const express = require('express')
const cors = require('cors')
const serverless = require('serverless-http')
const cloudbase = require('@cloudbase/node-sdk')
const memoryStore = import('../../shared/memory-store.mjs')
const memoryTeam = import('../../shared/memory-team.mjs')
const memoryCards = require('../../src/data/memory-cards.json')

const tcb = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV })
const db = tcb.database()
const app = express()
const COLLECTIONS = ['app_config', 'members', 'sessions', 'plan_tasks', 'completions', 'checkins', 'exam_attempts', 'notification_logs']
const SESSION_MS = 30 * 24 * 60 * 60 * 1000
const LOGIN_WINDOW_MS = 10 * 60 * 1000
const LOGIN_MAX_ATTEMPTS = 8
const loginAttempts = new Map()

app.use(cors({ origin: true, credentials: false }))
app.use(express.json({ limit: '8mb' }))
app.use((req, _res, next) => { if (req.url === '/api') req.url = '/'; else if (req.url.startsWith('/api/')) req.url = req.url.slice(4); next() })

const result = (res, data, status = 200) => res.status(status).json({ data })
const fail = (res, message, status = 400) => res.status(status).json({ message })
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex')
const safeEqual = (a, b) => {
  const left = Buffer.from(String(a)); const right = Buffer.from(String(b))
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}
const hashSecret = (secret, salt = crypto.randomBytes(16).toString('hex')) => ({
  salt,
  hash: crypto.scryptSync(String(secret), salt, 64).toString('hex')
})
const verifySecret = (secret, salt, hash) => safeEqual(hashSecret(secret, salt).hash, hash)
const loginAttemptKey = (req, memberId) => `${String(req.headers['x-forwarded-for'] || req.ip || 'unknown').split(',')[0].trim()}--${memberId || 'unknown'}`
const loginAttempt = (key) => {
  const current = loginAttempts.get(key)
  if (!current || Date.now() - current.startedAt >= LOGIN_WINDOW_MS) {
    const fresh = { count: 0, startedAt: Date.now() }; loginAttempts.set(key, fresh); return fresh
  }
  return current
}
const rows = async (collection, where = {}) => (await db.collection(collection).where(where).limit(1000).get()).data || []
const cleanDoc = (doc) => { const { _id, pinHash, pinSalt, ...safe } = doc; return { id: safe.id || _id, ...safe } }
const chinaDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

async function ensureCollections() {
  for (const name of COLLECTIONS) {
    try { await db.createCollection(name) } catch (error) {
      if (!/exist|存在|duplicate/i.test(String(error?.message || error))) throw error
    }
  }
}

async function config() {
  try { return (await db.collection('app_config').doc('main').get()).data?.[0] } catch { return null }
}

async function authenticate(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return fail(res, 'UNAUTHORIZED', 401)
  try {
    const session = (await db.collection('sessions').doc(sha256(token)).get()).data?.[0]
    if (!session || new Date(session.expiresAt).getTime() <= Date.now()) return fail(res, 'UNAUTHORIZED', 401)
    const memberDoc = (await db.collection('members').doc(session.memberId).get()).data?.[0]
    if (!memberDoc?.active) return fail(res, 'UNAUTHORIZED', 401)
    req.sessionToken = token; req.member = cleanDoc(memberDoc); next()
  } catch { return fail(res, 'UNAUTHORIZED', 401) }
}

const requireAdmin = (req, res, next) => req.member?.role === 'admin' ? next() : fail(res, '仅管理员可执行此操作', 403)

app.get('/health', (_req, res) => result(res, { ok: true, time: new Date().toISOString() }))

app.post('/setup', async (req, res) => {
  try {
    await ensureCollections()
    if (await config()) return fail(res, '环境已经初始化', 409)
    if (!process.env.SETUP_TOKEN || !safeEqual(req.headers['x-setup-token'] || '', process.env.SETUP_TOKEN)) return fail(res, '初始化令牌无效', 403)
    const { teamCode, adminName, adminPin, tasks, appConfig } = req.body || {}
    if (!teamCode || !adminName || !adminPin || !Array.isArray(tasks) || !tasks.length) return fail(res, '缺少团队口令、管理员、PIN或学习计划')
    const team = hashSecret(teamCode); const pin = hashSecret(adminPin)
    await db.collection('app_config').doc('main').set({
      teamCodeSalt: team.salt, teamCodeHash: team.hash,
      examDate: '2026-10-24', planStartDate: '2026-08-27', dailyMinutes: 120, flexMinutes: 30,
      playbackRate: 1.5, appName: '软考中项团队学习站', notificationTime: '07:00', ...appConfig,
      createdAt: new Date().toISOString()
    })
    await db.collection('members').doc('admin').set({ id: 'admin', displayName: adminName, role: 'admin', active: true, streak: 0, pinSalt: pin.salt, pinHash: pin.hash, createdAt: new Date().toISOString() })
    for (const task of tasks) await db.collection('plan_tasks').doc(task.id).set(task)
    return result(res, { message: `初始化完成，共导入${tasks.length}项任务`, adminId: 'admin' }, 201)
  } catch (error) { return fail(res, `初始化失败：${error.message}`, 500) }
})

app.get('/public/members', async (_req, res) => {
  try { return result(res, (await rows('members', { active: true })).map((item) => cleanDoc(item))) }
  catch { return result(res, []) }
})

app.post('/auth/login', async (req, res) => {
  try {
    const { teamCode, memberId, pin } = req.body || {}; const cfg = await config()
    const attemptKey = loginAttemptKey(req, memberId); const attempt = loginAttempt(attemptKey)
    if (attempt.count >= LOGIN_MAX_ATTEMPTS) return fail(res, '尝试次数过多，请10分钟后再试', 429)
    const member = memberId ? (await db.collection('members').doc(memberId).get()).data?.[0] : null
    if (!cfg || !member?.active || !member.pinSalt || !member.pinHash || !verifySecret(teamCode || '', cfg.teamCodeSalt, cfg.teamCodeHash) || !verifySecret(pin || '', member.pinSalt, member.pinHash)) {
      attempt.count += 1; return fail(res, '成员身份或个人PIN不正确', 401)
    }
    loginAttempts.delete(attemptKey)
    const token = crypto.randomBytes(32).toString('base64url'); const expiresAt = new Date(Date.now() + SESSION_MS).toISOString()
    await db.collection('sessions').doc(sha256(token)).set({ memberId, expiresAt, createdAt: new Date().toISOString() })
    return result(res, { token, expiresAt, member: cleanDoc(member) })
  } catch (error) { return fail(res, `登录失败：${error.message}`, 500) }
})

app.post('/auth/logout', authenticate, async (req, res) => {
  await db.collection('sessions').doc(sha256(req.sessionToken)).remove(); return result(res, { ok: true })
})

app.get('/snapshot', authenticate, async (req, res) => {
  try {
    const cfg = await config(); const [members, tasks, completions, checkins, attempts] = await Promise.all([
      rows('members', { active: true }), rows('plan_tasks'), rows('completions'), rows('checkins'), rows('exam_attempts')
    ])
    return result(res, {
      currentMember: req.member, members: members.map(cleanDoc),
      tasks: tasks.map(cleanDoc).sort((a, b) => a.sequence - b.sequence),
      completions: completions.map(cleanDoc), checkins: checkins.map(cleanDoc), attempts: attempts.map(cleanDoc),
      config: { examDate: cfg.examDate, planStartDate: cfg.planStartDate, dailyMinutes: cfg.dailyMinutes, flexMinutes: cfg.flexMinutes, playbackRate: cfg.playbackRate, appName: cfg.appName, notificationTime: cfg.notificationTime, environmentExpiresAt: cfg.environmentExpiresAt },
      pendingSyncCount: 0
    })
  } catch (error) { return fail(res, `读取失败：${error.message}`, 500) }
})

app.post('/progress', authenticate, async (req, res) => {
  const { taskId, done, completedQuestions, actualMinutes, note } = req.body || {}
  if (!taskId) return fail(res, '缺少taskId')
  const docId = `${req.member.id}--${taskId}`
  if (!done && !completedQuestions && !actualMinutes) await db.collection('completions').doc(docId).remove().catch(() => {})
  else await db.collection('completions').doc(docId).set({ memberId: req.member.id, taskId, status: done ? 'done' : 'partial', completedAt: new Date().toISOString(), completedQuestions, actualMinutes, note })
  return result(res, { ok: true })
})

app.post('/checkins', authenticate, async (req, res) => {
  const { minutes, note } = req.body || {}; if (!Number.isFinite(minutes) || minutes <= 0) return fail(res, '学习分钟必须大于0')
  const id = `${req.member.id}--${chinaDate()}`; await db.collection('checkins').doc(id).set({ id, memberId: req.member.id, date: chinaDate(), minutes, note, updatedAt: new Date().toISOString() })
  return result(res, { ok: true })
})

app.post('/exam-attempts', authenticate, async (req, res) => {
  const attempt = req.body || {}; if (!attempt.taskId || !attempt.paperKey || !['continuous', 'split'].includes(attempt.mode)) return fail(res, '套卷记录不完整')
  const id = crypto.randomUUID(); await db.collection('exam_attempts').doc(id).set({ ...attempt, id, memberId: req.member.id, attemptedAt: new Date().toISOString(), errorTags: Array.isArray(attempt.errorTags) ? attempt.errorTags : [] })
  return result(res, { id }, 201)
})

// The optional owner header is only an assertion against the authenticated
// identity. It prevents an old browser queue from being replayed after logout.
const requireMemoryOwner = (req, res, next) => {
  const expected = req.headers['x-memory-member']
  if (expected && expected !== req.member.id) return fail(res, '成员已切换，请重新进入背书', 403)
  next()
}

app.get('/memory', authenticate, requireMemoryOwner, async (req, res) => {
  try {
    const { listMemoryStates } = await memoryStore
    return result(res, { memberId: req.member.id, states: await listMemoryStates(db, req.member.id) })
  } catch (error) { return fail(res, `读取背书进度失败：${error.message}`, 500) }
})

// Team members can compare aggregate progress, but cannot read another
// member's card states, review events, PIN data or application configuration.
app.get('/memory/team', authenticate, async (_req, res) => {
  res.set('Cache-Control', 'no-store')
  try {
    const [{ listMemoryStates }, { buildMemoryTeamSummary }] = await Promise.all([memoryStore, memoryTeam])
    const [members, states] = await Promise.all([rows('members', { active: true }), listMemoryStates(db)])
    return result(res, buildMemoryTeamSummary(members, memoryCards, states))
  } catch (error) { return fail(res, `读取团队背书进度失败：${error.message}`, 500) }
})

app.post('/memory/review', authenticate, requireMemoryOwner, async (req, res) => {
  try {
    const { validateMemoryReview, persistMemoryReview } = await memoryStore
    const problem = validateMemoryReview(req.body)
    if (problem) return fail(res, problem)
    // Client memberId/reviewedAt are deliberately ignored. Only the session
    // owner and server clock determine the stored review and its due date.
    const saved = await persistMemoryReview(db, req.member.id, req.body, new Date())
    return result(res, { memberId: req.member.id, ...saved })
  } catch (error) { return fail(res, `保存背书进度失败：${error.message}`, 500) }
})

app.put('/admin/tasks', authenticate, requireAdmin, async (req, res) => {
  const task = req.body || {}; if (!task.id || !task.title || !task.plannedDate) return fail(res, '任务字段不完整')
  await db.collection('plan_tasks').doc(task.id).set(task); return result(res, { ok: true })
})
app.delete('/admin/tasks/:id', authenticate, requireAdmin, async (req, res) => {
  await db.collection('plan_tasks').doc(req.params.id).remove(); const linked = await rows('completions', { taskId: req.params.id }); for (const item of linked) await db.collection('completions').doc(item._id).remove(); return result(res, { ok: true })
})
app.put('/admin/members', authenticate, requireAdmin, async (req, res) => {
  const input = req.body || {}; if (!input.displayName) return fail(res, '成员显示名不能为空')
  const id = input.id || `member-${crypto.randomUUID().slice(0, 8)}`; let existing = null
  try { existing = (await db.collection('members').doc(id).get()).data?.[0] } catch {}
  const { _id: _internalId, _openid: _internalOpenId, ...safeExisting } = existing || {}
  const next = { ...safeExisting, id, displayName: input.displayName, role: input.role === 'admin' ? 'admin' : 'member', active: input.active !== false, streak: existing?.streak || 0 }
  if (input.pin) { const pin = hashSecret(input.pin); next.pinSalt = pin.salt; next.pinHash = pin.hash }
  if (!next.pinHash) return fail(res, '新增成员必须填写PIN')
  await db.collection('members').doc(id).set(next); return result(res, { id })
})

app.get('/admin/export', authenticate, requireAdmin, async (_req, res) => {
  const [members, tasks, completions, checkins, attempts] = await Promise.all([rows('members'), rows('plan_tasks'), rows('completions'), rows('checkins'), rows('exam_attempts')])
  const { listMemoryStates } = await memoryStore
  const memoryStates = await listMemoryStates(db)
  return result(res, JSON.stringify({ exportedAt: new Date().toISOString(), data: { members: members.map(cleanDoc), tasks: tasks.map(cleanDoc), completions: completions.map(cleanDoc), checkins: checkins.map(cleanDoc), attempts: attempts.map(cleanDoc), memoryStates } }, null, 2))
})
app.post('/admin/import-plan', authenticate, requireAdmin, async (req, res) => {
  const tasks = req.body?.tasks; if (!Array.isArray(tasks) || !tasks.length) return fail(res, '计划JSON无有效任务')
  for (const task of tasks) { if (!task.id) return fail(res, '每个任务都必须有id'); await db.collection('plan_tasks').doc(task.id).set(task) }
  return result(res, { imported: tasks.length })
})
app.post('/admin/notification/test', authenticate, requireAdmin, async (_req, res) => {
  try {
    const response = await tcb.callFunction({ name: 'daily-notification', data: { manual: true } })
    return result(res, { message: response.result?.message || '测试通知已触发' })
  } catch (error) { return fail(res, `测试通知失败：${error.message}`, 500) }
})

app.use((_req, res) => fail(res, '接口不存在', 404))
app.use((error, _req, res, _next) => fail(res, error.message || '服务器错误', 500))

exports.main = serverless(app)

if (require.main === module) {
  const port = Number(process.env.PORT || 9000)
  app.listen(port, '0.0.0.0', () => console.log(`ruankao api listening on ${port}`))
}
