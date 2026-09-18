import { scheduleReview } from '../../shared/memory-schedule.mjs'
import type { MemoryReviewEvent, MemoryReviewInput, MemoryReviewResult, MemoryReviewState, MemorySnapshot } from '../types/memory'

const TOKEN_KEY = 'ruankao.session-token'
const TEAM_PROOF_KEY = 'ruankao.team-proof'
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? ''

interface MemoryCache {
  states: MemoryReviewState[]
  pending: MemoryReviewEvent[]
  sessionFingerprint: string
  localEvents: string[]
}

interface Session { memberId: string; token: string; fingerprint: string }

interface MemoryServiceOptions {
  apiBase: string
  storage: () => Pick<Storage, 'getItem' | 'setItem'>
  request?: typeof fetch
  now?: () => Date
  namespace?: string
}

const networkFailure = (error: unknown) => error instanceof TypeError || (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name))

/** Separate instance/export also makes member-switch and offline behavior testable. */
export function createMemoryService(options: MemoryServiceOptions) {
  const remote = Boolean(options.apiBase)
  const request = options.request || ((...args: Parameters<typeof fetch>) => fetch(...args))
  const now = options.now || (() => new Date())
  const prefix = `ruankao.memory.v1:${encodeURIComponent(options.namespace || options.apiBase || 'demo')}:`
  const locks = new Map<string, Promise<unknown>>()
  const activeReviews = new Map<string, Promise<MemoryReviewResult>>()

  const key = (memberId: string) => prefix + encodeURIComponent(memberId)
  const read = (memberId: string): MemoryCache => {
    try {
      const cache = JSON.parse(options.storage().getItem(key(memberId)) || 'null') as MemoryCache | null
      if (cache && Array.isArray(cache.states) && Array.isArray(cache.pending)) {
        return { ...cache, states: cache.states.filter((state) => state.memberId === memberId), localEvents: cache.localEvents || [] }
      }
    } catch { /* A malformed cache must not break an online reload. */ }
    return { states: [], pending: [], sessionFingerprint: '', localEvents: [] }
  }
  const save = (memberId: string, cache: MemoryCache) => options.storage().setItem(key(memberId), JSON.stringify(cache))
  const currentToken = () => options.storage().getItem(TOKEN_KEY) || ''

  async function session(memberId: string): Promise<Session> {
    const token = currentToken()
    if (!memberId || !token || (!remote && token !== `local-${memberId}`)) throw new Error('UNAUTHORIZED')
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
    const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
    if (token !== currentToken()) throw new Error('成员已切换，请重新进入背书')
    return { memberId, token, fingerprint }
  }

  function assertSession(owner: Session) {
    if (currentToken() !== owner.token) throw new Error('成员已切换，请重新进入背书')
  }

  function assertOfflineOwner(owner: Session, cache: MemoryCache) {
    assertSession(owner)
    if (remote && cache.sessionFingerprint !== owner.fingerprint) throw new Error('本次登录需先联网打开背书，才能使用离线记录')
  }

  async function api<T extends { memberId: string }>(owner: Session, path: string, body?: unknown): Promise<T> {
    assertSession(owner)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 12000)
    let response: Response
    try { response = await request(`${options.apiBase}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}`,
        'X-Memory-Member': owner.memberId,
        ...(options.storage().getItem(TEAM_PROOF_KEY) ? { 'X-Team-Proof': options.storage().getItem(TEAM_PROOF_KEY)! } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal
    }) } finally { clearTimeout(timer) }
    assertSession(owner)
    if (response.status === 401) throw new Error('UNAUTHORIZED')
    const payload = await response.json() as { data?: T; message?: string }
    if (!response.ok) throw new Error(payload.message || '背书进度同步失败')
    if (!payload.data || payload.data.memberId !== owner.memberId) throw new Error('成员身份不匹配，请重新登录')
    return payload.data
  }

  function projected(owner: Session, cache: MemoryCache): MemoryReviewState[] {
    const byId = new Map(cache.states.map((state) => [state.cardId, state]))
    for (const event of cache.pending) {
      byId.set(event.cardId, scheduleReview(byId.get(event.cardId), { ...event, memberId: owner.memberId }, event.reviewedAt))
    }
    return [...byId.values()]
  }

  function snapshot(owner: Session, cache: MemoryCache, offline: boolean): MemorySnapshot {
    return { states: projected(owner, cache), pendingSyncCount: cache.pending.length, offline }
  }

  async function flush(owner: Session, cache: MemoryCache): Promise<boolean> {
    while (cache.pending.length) {
      const event = cache.pending[0]!
      try {
        const response = await api<{ memberId: string; state: MemoryReviewState }>(owner, '/memory/review', event)
        if (response.state.memberId !== owner.memberId || response.state.cardId !== event.cardId) throw new Error('复习记录身份不匹配')
        cache.states = cache.states.filter((state) => state.cardId !== event.cardId).concat(response.state)
        cache.pending.shift()
        cache.sessionFingerprint = owner.fingerprint
        save(owner.memberId, cache)
      } catch (error) {
        if (!networkFailure(error)) throw error
        assertOfflineOwner(owner, cache)
        return true
      }
    }
    return false
  }

  async function load(owner: Session): Promise<MemorySnapshot> {
    const cache = read(owner.memberId)
    if (!remote) return snapshot(owner, cache, false)
    try {
      const response = await api<{ memberId: string; states: MemoryReviewState[] }>(owner, '/memory')
      cache.sessionFingerprint = owner.fingerprint
      save(owner.memberId, cache)
      // An earlier timed-out POST may already exist on the server. Until its
      // receipt is acknowledged, project over the old cache, not fresh states
      // that might already contain the same review.
      const hadPending = cache.pending.length > 0
      if (hadPending && await flush(owner, cache)) return snapshot(owner, cache, true)
      const finalResponse = hadPending
        ? await api<{ memberId: string; states: MemoryReviewState[] }>(owner, '/memory')
        : response
      cache.states = finalResponse.states.filter((state) => state.memberId === owner.memberId)
      save(owner.memberId, cache)
    } catch (error) {
      if (!networkFailure(error)) throw error
      assertOfflineOwner(owner, cache)
      return snapshot(owner, cache, true)
    }
    return snapshot(owner, cache, false)
  }

  function exclusive<T>(memberId: string, action: () => Promise<T>): Promise<T> {
    const prior = locks.get(memberId) || Promise.resolve()
    const next = prior.catch(() => {}).then(action)
    locks.set(memberId, next)
    void next.finally(() => { if (locks.get(memberId) === next) locks.delete(memberId) }).catch(() => {})
    return next
  }

  const loadMemory = (memberId: string) => exclusive(memberId, async () => load(await session(memberId)))
  const syncMemory = (memberId: string) => loadMemory(memberId)

  function reviewMemory(memberId: string, input: MemoryReviewInput): Promise<MemoryReviewResult> {
    const reviewKey = `${currentToken()}:${memberId}:${input.cardId}:${input.mode}:${input.correct}:${input.eventId || ''}`
    const inFlight = activeReviews.get(reviewKey)
    if (inFlight) return inFlight
    const promise = exclusive(memberId, async () => {
      if (typeof input.correct !== 'boolean') throw new Error('请选择对号或错号')
      const owner = await session(memberId)
      let cache = read(memberId)
      if (remote && cache.sessionFingerprint !== owner.fingerprint) {
        await load(owner)
        cache = read(memberId)
      }
      const event: MemoryReviewEvent = { ...input, eventId: input.eventId || crypto.randomUUID(), reviewedAt: now().toISOString() }
      if (!remote) {
        const previous = cache.states.find((state) => state.cardId === input.cardId)
        if (cache.localEvents.includes(event.eventId) && previous) return { state: previous, pendingSyncCount: 0, offline: false }
        const state = scheduleReview(previous, { ...input, memberId }, now())
        cache.states = cache.states.filter((item) => item.cardId !== input.cardId).concat(state)
        cache.localEvents.push(event.eventId)
        save(memberId, cache)
        return { state, pendingSyncCount: 0, offline: false }
      }
      const appended = !cache.pending.some((item) => item.eventId === event.eventId)
      if (appended) cache.pending.push(event)
      save(memberId, cache)
      let offline: boolean
      try { offline = await flush(owner, cache) }
      catch (error) {
        // A rejected/expired session is not reported as a successful offline save.
        // Earlier genuine offline records remain queued for the same member.
        if (appended) cache.pending = cache.pending.filter((item) => item.eventId !== event.eventId)
        save(memberId, cache)
        throw error
      }
      const state = projected(owner, cache).find((item) => item.cardId === input.cardId)!
      return { state, pendingSyncCount: cache.pending.length, offline }
    })
    activeReviews.set(reviewKey, promise)
    void promise.finally(() => activeReviews.delete(reviewKey)).catch(() => {})
    return promise
  }

  return { loadMemory, reviewMemory, syncMemory }
}

const service = createMemoryService({ apiBase: API_BASE, storage: () => localStorage })
export const loadMemory = service.loadMemory
export const reviewMemory = service.reviewMemory
export const syncMemory = service.syncMemory
