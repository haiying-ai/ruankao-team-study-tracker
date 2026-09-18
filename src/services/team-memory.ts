import type { TeamMemorySnapshot } from '../types/team-memory'

const TOKEN_KEY = 'ruankao.session-token'
const TEAM_PROOF_KEY = 'ruankao.team-proof'
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? ''

interface TeamMemoryOptions {
  apiBase: string
  storage: () => Pick<Storage, 'getItem'>
  request?: typeof fetch
  timeoutMs?: number
}

const isDate = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value))
const isCount = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0

function validSnapshot(value: unknown): value is TeamMemorySnapshot {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as TeamMemorySnapshot
  if (!isDate(snapshot.generatedAt) || !Array.isArray(snapshot.summaries)) return false
  const ids = new Set<string>()
  const validModule = (module: unknown) => {
    if (!module || typeof module !== 'object') return false
    const item = module as { total: number; reviewed: number; stable: number }
    return [item.total, item.reviewed, item.stable].every(isCount) && item.stable <= item.reviewed && item.reviewed <= item.total
  }
  return snapshot.summaries.every((item) => {
    if (!item || typeof item.memberId !== 'string' || !item.memberId || ids.has(item.memberId)) return false
    ids.add(item.memberId)
    return validModule(item) && validModule(item.process) && validModule(item.processMap)
      && [item.due, item.needsWork, item.reviews].every(isCount)
      && (item.lastReviewedAt === null || isDate(item.lastReviewedAt))
  })
}

/** Read-only team aggregates; never downloads other members' card answers or pending reviews. */
export function createTeamMemoryService(options: TeamMemoryOptions) {
  const request = options.request || ((...args: Parameters<typeof fetch>) => fetch(...args))
  async function loadTeamMemory(signal?: AbortSignal): Promise<TeamMemorySnapshot> {
    const token = options.storage().getItem(TOKEN_KEY)
    if (!token) throw new Error('UNAUTHORIZED')
    if (!options.apiBase) throw new Error('本地演示模式不提供团队背书同步，请使用已部署的网站。')
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) controller.abort()
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, options.timeoutMs ?? 12000)
    const assertCurrent = () => {
      if (options.storage().getItem(TOKEN_KEY) !== token) throw new Error('成员已切换，请重新获取团队进度。')
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
    }
    try {
      assertCurrent()
      const proof = options.storage().getItem(TEAM_PROOF_KEY)
      const response = await request(`${options.apiBase.replace(/\/$/, '')}/memory/team`, {
        method: 'GET', cache: 'no-store', signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, ...(proof ? { 'X-Team-Proof': proof } : {}) }
      })
      assertCurrent()
      if (response.status === 401) throw new Error('UNAUTHORIZED')
      const payload = await response.json() as { data?: unknown; message?: string }
      assertCurrent()
      if (!response.ok) throw new Error(payload.message || '团队背书进度获取失败，请稍后重试。')
      if (!validSnapshot(payload.data)) throw new Error('团队背书数据格式异常，请刷新重试。')
      return payload.data
    } catch (error) {
      if (timedOut && !signal?.aborted) throw new Error('团队背书进度获取超时，请稍后重试。')
      throw error
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
    }
  }
  return { loadTeamMemory }
}

export const { loadTeamMemory } = createTeamMemoryService({ apiBase: API_BASE, storage: () => localStorage })
