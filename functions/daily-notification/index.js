'use strict'

const cloudbase = require('@cloudbase/node-sdk')
const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV })
const db = app.database()

const rows = async (collection, where = {}) => (await db.collection(collection).where(where).limit(1000).get()).data || []
const dateKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const parse = (key) => new Date(`${key}T00:00:00+08:00`)
const countdown = (from, to) => Math.max(0, Math.ceil((parse(to) - parse(from)) / 86400000))

function buildDigest({ config, members, tasks, completions, today }) {
  const stageTask = [...tasks].filter((task) => task.plannedDate <= today).sort((a, b) => b.sequence - a.sequence)[0]
  const lines = [
    `<h2>软考中项团队晨报 · ${today}</h2>`,
    `<p><b>距离考试：</b>${countdown(today, config.examDate)}天　<b>当前阶段：</b>${stageTask?.stage || '预备阶段'}</p>`,
    '<hr/><h3>成员学习位置</h3>'
  ]
  for (const member of members.filter((item) => item.active)) {
    const memberId = member.id || member._id
    const done = new Set(completions.filter((item) => item.memberId === memberId && item.status === 'done').map((item) => item.taskId))
    const backlog = tasks.filter((task) => task.required && task.plannedDate <= today && !done.has(task.id || task._id)).length
    const current = [...tasks].sort((a, b) => a.sequence - b.sequence).find((task) => task.required && !done.has(task.id || task._id))
    const warning = backlog >= 7 ? '🔴' : backlog >= 3 ? '🟡' : '🟢'
    lines.push(`<p>${warning} <b>${member.displayName}</b>：${current?.title || '全部完成'}（欠账${backlog}项）</p>`)
  }
  const fixed = tasks.filter((task) => task.datePolicy === 'fixed' && task.plannedDate === today)
  if (fixed.length) lines.push(`<h3>今日固定节点</h3>${fixed.map((task) => `<p>📌 ${task.title}</p>`).join('')}`)
  lines.push(`<p><a href="${process.env.SITE_URL || '#'}">打开学习网站</a></p><p style="color:#777">先清欠账，再做新任务；完整套卷可连续计时或拆分完成。</p>`)
  return lines.join('')
}

exports.main = async (event = {}) => {
  const today = dateKey()
  const manual = Boolean(event.manual)
  const previousSuccess = await rows('notification_logs', { date: today, status: 'success' })
  if (!manual && previousSuccess.length) return { message: '今日晨报已成功发送，无需重试' }
  const [configDoc, members, tasks, completions] = await Promise.all([
    db.collection('app_config').doc('main').get(), rows('members'), rows('plan_tasks'), rows('completions')
  ])
  const config = configDoc.data?.[0]
  if (!config) throw new Error('尚未初始化AppConfig')
  if (!process.env.PUSHPLUS_TOKEN || !process.env.PUSHPLUS_TOPIC) throw new Error('缺少PUSHPLUS_TOKEN或PUSHPLUS_TOPIC环境变量')
  const normalizedTasks = tasks.map((item) => ({ id: item.id || item._id, ...item }))
  const content = buildDigest({ config, members, tasks: normalizedTasks, completions, today })
  const logId = `${today}-${manual ? `manual-${Date.now()}` : 'scheduled'}`
  try {
    const response = await fetch('https://www.pushplus.plus/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: process.env.PUSHPLUS_TOKEN, topic: process.env.PUSHPLUS_TOPIC, title: `软考晨报｜距考试${countdown(today, config.examDate)}天`, content, template: 'html' })
    })
    const payload = await response.json()
    if (!response.ok || Number(payload.code) !== 200) throw new Error(payload.msg || `HTTP ${response.status}`)
    await db.collection('notification_logs').doc(logId).set({ id: logId, date: today, status: 'success', manual, sentAt: new Date().toISOString(), responseCode: payload.code })
    return { message: manual ? 'PushPlus测试通知发送成功' : '团队晨报发送成功' }
  } catch (error) {
    await db.collection('notification_logs').doc(logId).set({ id: logId, date: today, status: 'failed', manual, failedAt: new Date().toISOString(), error: String(error.message || error).slice(0, 500) })
    throw error
  }
}

exports.buildDigest = buildDigest
