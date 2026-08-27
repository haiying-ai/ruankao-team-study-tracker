import { STUDY_PLAN, APP_CONFIG } from '../data/plan'
import type {
  AppSnapshot,
  Checkin,
  ExamAttempt,
  LoginPayload,
  Member,
  MemberAdminInput,
  PlanTask,
  TaskProgressInput,
  TeamVerification
} from '../types'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? ''
const TOKEN_KEY = 'ruankao.session-token'
const TEAM_PROOF_KEY = 'ruankao.team-proof'
const LOCAL_DB_KEY = 'ruankao.local-db.v1'
const OFFLINE_QUEUE_KEY = 'ruankao.offline-queue.v1'
const SNAPSHOT_CACHE_KEY = 'ruankao.snapshot-cache.v1'

interface LocalDb {
  members: Member[]
  pins: Record<string, string>
  completions: AppSnapshot['completions']
  checkins: Checkin[]
  attempts: ExamAttempt[]
  tasks: PlanTask[]
  currentMemberId?: string
}

interface QueuedMutation {
  id: string
  path: string
  method: string
  body?: unknown
  createdAt: string
}

export interface StudyApi {
  readonly remote: boolean
  verifyTeam(teamCode: string): Promise<TeamVerification>
  login(payload: LoginPayload): Promise<{ token: string; member: Member }>
  logout(): Promise<void>
  snapshot(): Promise<AppSnapshot>
  setTaskProgress(input: TaskProgressInput): Promise<void>
  addCheckin(minutes: number, note?: string): Promise<void>
  addAttempt(attempt: Omit<ExamAttempt, 'id' | 'memberId' | 'attemptedAt'>): Promise<void>
  saveTask(task: PlanTask): Promise<void>
  deleteTask(taskId: string): Promise<void>
  saveMember(input: MemberAdminInput): Promise<void>
  exportData(): Promise<string>
  importPlan(tasks: PlanTask[]): Promise<void>
  testNotification(): Promise<{ message: string }>
}

const demoMembers: Member[] = [
  { id: 'admin', displayName: '管理员', role: 'admin', active: true, streak: 0 },
  { id: 'partner-1', displayName: '学习伙伴1', role: 'member', active: true, streak: 0 },
  { id: 'partner-2', displayName: '学习伙伴2', role: 'member', active: true, streak: 0 }
]

const freshLocalDb = (): LocalDb => ({
  members: demoMembers,
  pins: {
    admin: (import.meta.env.VITE_DEMO_ADMIN_PIN as string | undefined) || '123456',
    'partner-1': '111111',
    'partner-2': '222222'
  },
  completions: [],
  checkins: [],
  attempts: [],
  tasks: STUDY_PLAN
})

const loadLocalDb = (): LocalDb => {
  const raw = localStorage.getItem(LOCAL_DB_KEY)
  if (!raw) return freshLocalDb()
  try {
    const parsed = JSON.parse(raw) as LocalDb
    return { ...freshLocalDb(), ...parsed, tasks: parsed.tasks?.length ? parsed.tasks : STUDY_PLAN }
  } catch {
    return freshLocalDb()
  }
}

const saveLocalDb = (db: LocalDb) => localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(db))

class LocalStudyApi implements StudyApi {
  readonly remote = false

  async verifyTeam(teamCode: string) {
    const expectedTeamCode = (import.meta.env.VITE_DEMO_TEAM_CODE as string | undefined) || 'demo2026'
    if (teamCode !== expectedTeamCode) throw new Error('团队口令不正确')
    localStorage.setItem(TEAM_PROOF_KEY, 'local-team-verified')
    return {
      teamToken: 'local-team-verified',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      members: loadLocalDb().members.filter((member) => member.active)
    }
  }

  async login(payload: LoginPayload) {
    const expectedTeamCode = (import.meta.env.VITE_DEMO_TEAM_CODE as string | undefined) || 'demo2026'
    const db = loadLocalDb()
    const member = db.members.find((item) => item.id === payload.memberId && item.active)
    if (payload.teamCode !== expectedTeamCode || !member || db.pins[payload.memberId] !== payload.pin) {
      throw new Error('成员身份或个人PIN不正确')
    }
    db.currentMemberId = member.id
    saveLocalDb(db)
    const token = `local-${member.id}`
    localStorage.setItem(TOKEN_KEY, token)
    return { token, member }
  }

  async logout() {
    const db = loadLocalDb()
    delete db.currentMemberId
    saveLocalDb(db)
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(TEAM_PROOF_KEY)
  }

  async snapshot(): Promise<AppSnapshot> {
    const db = loadLocalDb()
    const member = db.members.find((item) => item.id === db.currentMemberId)
    if (!member) throw new Error('UNAUTHORIZED')
    return {
      currentMember: member,
      members: db.members.filter((item) => item.active),
      tasks: db.tasks,
      completions: db.completions,
      checkins: db.checkins,
      attempts: db.attempts,
      config: APP_CONFIG,
      pendingSyncCount: 0
    }
  }

  async setTaskProgress(input: TaskProgressInput) {
    const db = loadLocalDb()
    if (!db.currentMemberId) throw new Error('UNAUTHORIZED')
    db.completions = db.completions.filter((item) => !(item.memberId === db.currentMemberId && item.taskId === input.taskId))
    if (input.done || input.completedQuestions || input.actualMinutes) {
      db.completions.push({
        memberId: db.currentMemberId,
        taskId: input.taskId,
        status: input.done ? 'done' : 'partial',
        completedAt: new Date().toISOString(),
        completedQuestions: input.completedQuestions,
        actualMinutes: input.actualMinutes,
        note: input.note
      })
    }
    saveLocalDb(db)
  }

  async addCheckin(minutes: number, note?: string) {
    const db = loadLocalDb()
    if (!db.currentMemberId) throw new Error('UNAUTHORIZED')
    db.checkins.push({ id: crypto.randomUUID(), memberId: db.currentMemberId, date: new Date().toISOString().slice(0, 10), minutes, note })
    saveLocalDb(db)
  }

  async addAttempt(attempt: Omit<ExamAttempt, 'id' | 'memberId' | 'attemptedAt'>) {
    const db = loadLocalDb()
    if (!db.currentMemberId) throw new Error('UNAUTHORIZED')
    db.attempts.push({ ...attempt, id: crypto.randomUUID(), memberId: db.currentMemberId, attemptedAt: new Date().toISOString() })
    saveLocalDb(db)
  }

  async saveTask(task: PlanTask) {
    const db = loadLocalDb()
    const index = db.tasks.findIndex((item) => item.id === task.id)
    if (index >= 0) db.tasks[index] = task
    else db.tasks.push(task)
    db.tasks.sort((a, b) => a.sequence - b.sequence)
    saveLocalDb(db)
  }

  async deleteTask(taskId: string) {
    const db = loadLocalDb()
    db.tasks = db.tasks.filter((item) => item.id !== taskId)
    db.completions = db.completions.filter((item) => item.taskId !== taskId)
    saveLocalDb(db)
  }

  async saveMember(input: MemberAdminInput) {
    const db = loadLocalDb()
    const id = input.id || `member-${crypto.randomUUID().slice(0, 8)}`
    const member: Member = { id, displayName: input.displayName, role: input.role, active: input.active, streak: 0 }
    const index = db.members.findIndex((item) => item.id === id)
    if (index >= 0) db.members[index] = { ...db.members[index], ...member }
    else db.members.push(member)
    if (input.pin) db.pins[id] = input.pin
    saveLocalDb(db)
  }

  async exportData() {
    const db = loadLocalDb()
    const safeDb = { ...db, pins: undefined }
    return JSON.stringify({ exportedAt: new Date().toISOString(), data: safeDb }, null, 2)
  }

  async importPlan(tasks: PlanTask[]) {
    const db = loadLocalDb()
    db.tasks = tasks
    saveLocalDb(db)
  }

  async testNotification() {
    return { message: '本地演示模式：通知内容已生成，但未向PushPlus发送。' }
  }
}

class RemoteStudyApi implements StudyApi {
  readonly remote = true

  private token() {
    return localStorage.getItem(TOKEN_KEY) || ''
  }

  private queueMutation(path: string, method: string, body?: unknown) {
    const queue = this.readQueue()
    queue.push({ id: crypto.randomUUID(), path, method, body, createdAt: new Date().toISOString() })
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue))
  }

  private readQueue(): QueuedMutation[] {
    try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]') as QueuedMutation[] } catch { return [] }
  }

  private async request<T>(path: string, options: RequestInit = {}, queueOnFailure = false): Promise<T> {
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(this.token() ? { Authorization: `Bearer ${this.token()}` } : {}),
          ...(localStorage.getItem(TEAM_PROOF_KEY) ? { 'X-Team-Proof': localStorage.getItem(TEAM_PROOF_KEY)! } : {}),
          ...(options.headers || {})
        }
      })
      const payload = await response.json() as { data?: T; message?: string }
      if (response.status === 401) throw new Error(payload.message || 'UNAUTHORIZED')
      if (!response.ok) throw new Error(payload.message || '请求失败')
      return payload.data as T
    } catch (error) {
      if (queueOnFailure && error instanceof TypeError) {
        this.queueMutation(path, options.method || 'POST', options.body ? JSON.parse(String(options.body)) : undefined)
        return undefined as T
      }
      throw error
    }
  }

  private async flushQueue() {
    const queue = this.readQueue()
    if (!queue.length) return
    const remaining: QueuedMutation[] = []
    for (const item of queue) {
      try {
        await this.request(item.path, { method: item.method, body: item.body ? JSON.stringify(item.body) : undefined })
      } catch {
        remaining.push(item)
      }
    }
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining))
  }

  async verifyTeam(teamCode: string) {
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(teamCode))
      const proof = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
      const members = await this.request<Member[]>('/public/members', {
        headers: { 'X-Team-Proof': proof, 'Cache-Control': 'no-cache' }
      })
      localStorage.setItem(TEAM_PROOF_KEY, proof)
      return {
        teamToken: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        members
      }
    } catch {
      throw new Error('团队口令不正确')
    }
  }

  async login(payload: LoginPayload) {
    const result = await this.request<{ token: string; member: Member }>('/auth/login', { method: 'POST', body: JSON.stringify(payload) })
    localStorage.setItem(TOKEN_KEY, result.token)
    return result
  }

  async logout() {
    try { await this.request('/auth/logout', { method: 'POST' }) } finally {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(TEAM_PROOF_KEY)
    }
  }

  async snapshot() {
    try {
      await this.flushQueue()
      const snapshot = await this.request<AppSnapshot>('/snapshot')
      snapshot.pendingSyncCount = this.readQueue().length
      localStorage.setItem(SNAPSHOT_CACHE_KEY, JSON.stringify(snapshot))
      return snapshot
    } catch (error) {
      if (!(error instanceof TypeError)) throw error
      const cached = localStorage.getItem(SNAPSHOT_CACHE_KEY)
      if (!cached) throw error
      const snapshot = JSON.parse(cached) as AppSnapshot
      snapshot.pendingSyncCount = this.readQueue().length
      return snapshot
    }
  }

  setTaskProgress(input: TaskProgressInput) { return this.request<void>('/progress', { method: 'POST', body: JSON.stringify(input) }, true) }
  addCheckin(minutes: number, note?: string) { return this.request<void>('/checkins', { method: 'POST', body: JSON.stringify({ minutes, note }) }, true) }
  addAttempt(attempt: Omit<ExamAttempt, 'id' | 'memberId' | 'attemptedAt'>) { return this.request<void>('/exam-attempts', { method: 'POST', body: JSON.stringify(attempt) }, true) }
  saveTask(task: PlanTask) { return this.request<void>('/admin/tasks', { method: 'PUT', body: JSON.stringify(task) }) }
  deleteTask(taskId: string) { return this.request<void>(`/admin/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' }) }
  saveMember(input: MemberAdminInput) { return this.request<void>('/admin/members', { method: 'PUT', body: JSON.stringify(input) }) }
  exportData() { return this.request<string>('/admin/export') }
  importPlan(tasks: PlanTask[]) { return this.request<void>('/admin/import-plan', { method: 'POST', body: JSON.stringify({ tasks }) }) }
  testNotification() { return this.request<{ message: string }>('/admin/notification/test', { method: 'POST' }) }
}

export const studyApi: StudyApi = API_BASE ? new RemoteStudyApi() : new LocalStudyApi()
export const hasStoredSession = () => Boolean(localStorage.getItem(TOKEN_KEY) && localStorage.getItem(TEAM_PROOF_KEY))
export const clearStoredSession = () => {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(TEAM_PROOF_KEY)
}
