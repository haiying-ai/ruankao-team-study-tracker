import { describe, expect, it } from 'vitest'
import { chinaDay, compareMemoryPriority, scheduleReview } from '../shared/memory-schedule.mjs'
import { listMemoryStates, persistMemoryReview, validateMemoryReview } from '../shared/memory-store.mjs'
import type { MemoryReviewEvent, MemoryReviewState } from '../src/types/memory'

const input = { memberId: 'alice', cardId: 'formula-pv', correct: true }
const event: MemoryReviewEvent = { cardId: input.cardId, eventId: 'review-00000000001', correct: true, mode: 'daily', reviewedAt: '2000-01-01T00:00:00Z' }

describe('背书间隔与上海日期', () => {
  it('按上海午夜切换日期，跨月跨年次日排期正确', () => {
    expect(chinaDay('2026-09-18T15:59:59Z')).toBe('2026-09-18')
    expect(chinaDay('2026-09-18T16:00:00Z')).toBe('2026-09-19')
    expect(scheduleReview(null, input, '2026-12-31T12:00:00Z').nextReviewAt).toBe('2027-01-01')
    expect(scheduleReview(null, input, '2028-02-28T12:00:00Z').nextReviewAt).toBe('2028-02-29')
  })

  it('跨日连续答对依次为1、3、7、14、30天，错误重置到次日', () => {
    let state: MemoryReviewState | undefined
    const dates = ['2026-09-18', '2026-09-19', '2026-09-22', '2026-09-29', '2026-10-13', '2026-11-12']
    const intervals = dates.map((date) => {
      state = scheduleReview(state, input, `${date}T09:00:00+08:00`)
      return state.intervalDays
    })
    expect(intervals).toEqual([1, 3, 7, 14, 30, 30])
    const wrong = scheduleReview(state, { ...input, correct: false }, '2026-11-13T09:00:00+08:00')
    expect(wrong).toMatchObject({ streak: 0, lapses: 1, reviews: 7, intervalDays: 1, nextReviewAt: '2026-11-14', lastCorrect: false })
  })

  it('同日反复全量自测不会提高保持天数', () => {
    const first = scheduleReview(null, input, '2026-09-18T01:00:00Z')
    const again = scheduleReview(first, input, '2026-09-18T14:00:00Z')
    expect(again).toMatchObject({ streak: 1, intervalDays: 1, reviews: 2, nextReviewAt: '2026-09-19' })
  })

  it('拒绝字符串布尔与不同成员的旧状态', () => {
    expect(() => scheduleReview(null, { ...input, correct: 'false' as unknown as boolean })).toThrow()
    const previous = scheduleReview(null, input)
    expect(() => scheduleReview(previous, { ...input, memberId: 'bob' })).toThrow('identity mismatch')
  })

  it('到期错题优先于普通复习，新卡最后', () => {
    const states = {
      wrong: scheduleReview(null, { ...input, cardId: 'wrong', correct: false }, '2026-09-17'),
      known: scheduleReview(null, { ...input, cardId: 'known' }, '2026-09-16')
    }
    expect([{ id: 'new' }, { id: 'known' }, { id: 'wrong' }].sort((a, b) => compareMemoryPriority(a, b, states)).map((card) => card.id)).toEqual(['wrong', 'known', 'new'])
  })
})

// Transaction mock commits only after the callback succeeds; requests serialize
// as if conflicts were retried by CloudBase runTransaction.
function database() {
  let documents = new Map<string, Record<string, unknown>>()
  let lock = Promise.resolve<unknown>(undefined)
  const collection = (store: Map<string, Record<string, unknown>>) => ({
    doc: (id: string) => ({
      get: async () => ({ data: store.get(id) || null }),
      set: async (value: Record<string, unknown>) => { store.set(id, structuredClone(value)); return {} }
    }),
    where: (where: Record<string, unknown>) => {
      let offset = 0; let count = 500
      const query = {
        skip(value: number) { offset = value; return query },
        limit(value: number) { count = value; return query },
        async get() { return { data: [...store.values()].filter((item) => Object.entries(where).every(([key, value]) => item[key] === value)).slice(offset, offset + count) } }
      }
      return query
    }
  })
  return {
    collection: (_name: string) => collection(documents),
    runTransaction<T>(action: (transaction: { collection: (name: string) => ReturnType<typeof collection> }) => Promise<T>) {
      const result = lock.catch(() => {}).then(async () => {
        const draft = structuredClone(documents)
        const output = await action({ collection: () => collection(draft) })
        documents = draft
        return output
      })
      lock = result
      return result
    }
  }
}

describe('云端背书记录', () => {
  it('空记录返回空列表', async () => { expect(await listMemoryStates(database(), 'alice')).toEqual([]) })

  it('重放同一event不会重复累加，也不回退后续状态', async () => {
    const db = database()
    const [first, duplicate] = await Promise.all([
      persistMemoryReview(db, 'alice', event, new Date('2026-09-18T09:00:00Z')),
      persistMemoryReview(db, 'alice', event, new Date('2026-09-18T09:00:00Z'))
    ])
    expect(first.state.reviews).toBe(1)
    expect(duplicate.duplicate).toBe(true)
    await persistMemoryReview(db, 'alice', { ...event, eventId: 'review-00000000002', correct: false }, new Date('2026-09-19T09:00:00Z'))
    const oldReplay = await persistMemoryReview(db, 'alice', event)
    expect(oldReplay.state).toMatchObject({ reviews: 2, streak: 0, lapses: 1 })
  })

  it('同卡、同eventId不同用户隔离；客户端时间与身份不能覆盖会话用户', async () => {
    const db = database()
    const spoof = { ...event, memberId: 'bob', reviewedAt: '2099-01-01T00:00:00Z' }
    await persistMemoryReview(db, 'alice', spoof, new Date('2026-09-18T15:59:59Z'))
    await persistMemoryReview(db, 'bob', { ...event, correct: false }, new Date('2026-09-18T16:00:00Z'))
    expect(await listMemoryStates(db, 'alice')).toMatchObject([{ memberId: 'alice', reviews: 1, nextReviewAt: '2026-09-19', lapses: 0 }])
    expect(await listMemoryStates(db, 'bob')).toMatchObject([{ memberId: 'bob', reviews: 1, nextReviewAt: '2026-09-20', lapses: 1 }])
    expect(await listMemoryStates(db)).toHaveLength(2)
  })

  it('严格验证bool、模式、ID；相同eventId不同结果拒绝覆盖', async () => {
    expect(validateMemoryReview({ ...event, correct: 'false' })).toBeTruthy()
    expect(validateMemoryReview({ ...event, mode: 'admin' })).toBeTruthy()
    expect(validateMemoryReview({ ...event, cardId: '../main' })).toBeTruthy()
    const db = database()
    await persistMemoryReview(db, 'alice', event)
    await expect(persistMemoryReview(db, 'alice', { ...event, correct: false })).rejects.toThrow('已用于另一条结果')
    expect((await listMemoryStates(db, 'alice'))[0]?.reviews).toBe(1)
  })
})
