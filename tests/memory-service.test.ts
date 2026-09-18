import { describe, expect, it } from 'vitest'
import { createMemoryService } from '../src/services/memory'
import { scheduleReview } from '../shared/memory-schedule.mjs'
import type { MemoryReviewEvent, MemoryReviewState } from '../src/types/memory'

function harness() {
  const values = new Map<string, string>([['ruankao.session-token', 'alice-token']])
  const storage = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value) } }
  const states = new Map<string, MemoryReviewState[]>()
  const receipts = new Set<string>()
  const calls: { owner: string; body: MemoryReviewEvent }[] = []
  let offline = false; let expired = false; let losePostResponse = false
  const request: typeof fetch = async (url, init) => {
    if (offline) throw new TypeError('Failed to fetch')
    if (expired) return Response.json({ message: '登录已过期' }, { status: 401 })
    const headers = init!.headers as Record<string, string>
    const owner = headers.Authorization!.includes('alice') ? 'alice' : 'bob'
    if (headers['X-Memory-Member'] !== owner) return Response.json({ message: '成员已切换' }, { status: 403 })
    if (String(url).endsWith('/memory')) return Response.json({ data: { memberId: owner, states: states.get(owner) || [] } })
    const body = JSON.parse(String(init?.body)) as MemoryReviewEvent
    calls.push({ owner, body })
    const ownStates = states.get(owner) || []
    const receiptId = `${owner}:${body.eventId}`
    if (receipts.has(receiptId)) {
      if (losePostResponse) throw new TypeError('Response lost')
      return Response.json({ data: { memberId: owner, state: ownStates.find((item) => item.cardId === body.cardId) } })
    }
    const state = scheduleReview(ownStates.find((item) => item.cardId === body.cardId), { ...body, memberId: owner }, '2026-09-18T10:00:00Z')
    states.set(owner, ownStates.filter((item) => item.cardId !== body.cardId).concat(state))
    receipts.add(receiptId)
    if (losePostResponse) throw new TypeError('Response lost')
    return Response.json({ data: { memberId: owner, state } })
  }
  const service = createMemoryService({ apiBase: 'https://example.test/api', storage: () => storage, request, now: () => new Date('2026-09-18T10:00:00Z') })
  return { service, storage, values, calls, setOffline: (value: boolean) => { offline = value }, setExpired: (value: boolean) => { expired = value }, setLosePostResponse: (value: boolean) => { losePostResponse = value } }
}

const answer = { cardId: 'concept-pv', correct: false, mode: 'daily' as const, eventId: 'review-00000000001' }

describe('背书离线同步', () => {
  it('网络失败记录离线，恢复网络按原eventId同步一次', async () => {
    const h = harness()
    expect((await h.service.loadMemory('alice')).states).toEqual([])
    h.setOffline(true)
    const saved = await h.service.reviewMemory('alice', answer)
    expect(saved).toMatchObject({ offline: true, pendingSyncCount: 1, state: { reviews: 1, lapses: 1 } })
    h.setOffline(false)
    const synced = await h.service.syncMemory('alice')
    expect(synced).toMatchObject({ pendingSyncCount: 0, offline: false, states: [{ memberId: 'alice', reviews: 1 }] })
    await h.service.syncMemory('alice')
    expect(h.calls.map((call) => call.body.eventId)).toEqual([answer.eventId])
  })

  it('切换成员不读取或重放上一位成员的队列，重新登录原成员才同步', async () => {
    const h = harness()
    await h.service.loadMemory('alice')
    h.setOffline(true)
    await h.service.reviewMemory('alice', answer)
    h.storage.setItem('ruankao.session-token', 'bob-token')
    h.setOffline(false)
    expect((await h.service.loadMemory('bob')).states).toEqual([])
    expect(h.calls).toHaveLength(0)
    await expect(h.service.syncMemory('alice')).rejects.toThrow('成员已切换')
    expect(h.calls).toHaveLength(0)
    h.storage.setItem('ruankao.session-token', 'alice-token-new-login')
    await h.service.loadMemory('alice')
    expect(h.calls).toHaveLength(1)
    expect(h.calls[0]?.owner).toBe('alice')
  })

  it('服务器已提交但响应丢失，再次GET成功而POST仍失败时不重复投影计数', async () => {
    const h = harness()
    await h.service.loadMemory('alice')
    h.setLosePostResponse(true)
    expect((await h.service.reviewMemory('alice', answer)).state.reviews).toBe(1)
    const retry = await h.service.loadMemory('alice')
    expect(retry).toMatchObject({ pendingSyncCount: 1, offline: true, states: [{ reviews: 1 }] })
    h.setLosePostResponse(false)
    expect(await h.service.syncMemory('alice')).toMatchObject({ pendingSyncCount: 0, offline: false, states: [{ reviews: 1 }] })
  })

  it('401显示失效而非保存成功，新点击不写成成功或待同步', async () => {
    const h = harness()
    await h.service.loadMemory('alice')
    h.setExpired(true)
    await expect(h.service.reviewMemory('alice', answer)).rejects.toThrow('UNAUTHORIZED')
    h.setExpired(false)
    expect(await h.service.loadMemory('alice')).toMatchObject({ states: [], pendingSyncCount: 0 })
  })

  it('连续双击共用请求，严格按成员隔离缓存', async () => {
    const h = harness()
    await h.service.loadMemory('alice')
    const first = h.service.reviewMemory('alice', answer)
    const second = h.service.reviewMemory('alice', answer)
    expect(first).toBe(second)
    await first
    expect(h.calls).toHaveLength(1)
    const cacheEntries = [...h.values].filter(([key]) => key.startsWith('ruankao.memory.'))
    expect(cacheEntries).toHaveLength(1)
    expect(cacheEntries[0]?.[0]).toContain(':alice')
    expect(cacheEntries[0]?.[1]).not.toContain('alice-token')
  })

  it('未经在线验证的新会话不使用其他会话留下的离线数据', async () => {
    const h = harness()
    await h.service.loadMemory('alice')
    h.storage.setItem('ruankao.session-token', 'bob-token')
    h.setOffline(true)
    await expect(h.service.loadMemory('alice')).rejects.toThrow('需先联网')
  })

  it('本地演示模式也限制当前成员，重复event只记一次', async () => {
    const h = harness()
    h.storage.setItem('ruankao.session-token', 'local-alice')
    const local = createMemoryService({ apiBase: '', storage: () => h.storage })
    await expect(local.loadMemory('bob')).rejects.toThrow('UNAUTHORIZED')
    await local.reviewMemory('alice', answer)
    await local.reviewMemory('alice', answer)
    expect((await local.loadMemory('alice')).states[0]?.reviews).toBe(1)
  })
})
