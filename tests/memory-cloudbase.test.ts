import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import { listMemoryStates, persistMemoryReview } from '../shared/memory-store.mjs'
import type { MemoryReviewEvent } from '../src/types/memory'

// Exercise the actual installed CloudBase document, query and transaction
// implementations. Only the wire transport is replaced; no cloud writes occur.
const require = createRequire(import.meta.url)
const { Db } = require('@cloudbase/database')
const { EJSON } = createRequire(require.resolve('@cloudbase/database'))('bson')
const originalRequester = Db.reqClass
afterEach(() => { Db.reqClass = originalRequester })

function sdkDatabase({ conflictOnce = false, denied = false } = {}) {
  let documents = new Map<string, Record<string, unknown>>()
  const transactions = new Map<string, Map<string, Record<string, unknown>>>()
  const calls: { action: string; params: Record<string, unknown> }[] = []
  let transactionNumber = 0
  let conflictSent = false
  class WireTransport {
    async send(action: string, params: Record<string, unknown> = {}) {
      calls.push({ action, params })
      if (action === 'database.startTransaction') {
        const id = `sdk-tx-${++transactionNumber}`
        transactions.set(id, structuredClone(documents))
        return { transactionId: id }
      }
      const id = params.transactionId as string | undefined
      const store = id ? transactions.get(id)! : documents
      if (action === 'database.getDocument') {
        if (denied) return { code: 'PERMISSION_DENIED', message: 'Permission denied' }
        const query = EJSON.parse(String(params.query || '{}')) as Record<string, unknown>
        const matching = [...store.values()].filter((doc) => Object.entries(query).every(([field, value]) => doc[field] === value))
        const offset = Number(params.offset || 0)
        const selected = matching.slice(offset, offset + Number(params.limit || 1000))
        return { data: { list: selected.map((doc) => EJSON.stringify(doc)) }, requestId: 'read-id' }
      }
      if (action === 'database.modifyDocument') {
        if (conflictOnce && !conflictSent) { conflictSent = true; return { code: 'DATABASE_TRANSACTION_CONFLICT', message: 'Conflict' } }
        const query = EJSON.parse(String(params.query)) as { _id: string }
        const data = EJSON.parse(String(params.data)) as Record<string, unknown>
        // These assertions run on the real SDK's serialized request.
        expect(params).toMatchObject({ collectionName: 'app_config', merge: false, upsert: true, multi: false })
        expect(data).not.toHaveProperty('_id')
        store.set(query._id, { ...data, _id: query._id })
        return { data: { updated: 1, upsert_id: query._id }, requestId: 'write-id' }
      }
      if (action === 'database.commitTransaction') {
        documents = store
        transactions.delete(id!)
        return { requestId: 'commit-id' }
      }
      if (action === 'database.abortTransaction') { transactions.delete(id!); return { requestId: 'rollback-id' } }
      throw new Error(`Unexpected SDK request: ${action}`)
    }
  }
  Db.reqClass = WireTransport
  return { db: new Db({ throwOnCode: false }), calls }
}

const event: MemoryReviewEvent = { eventId: 'review-sdk-000000001', cardId: 'concept-pv', correct: true, mode: 'daily', reviewedAt: '2000-01-01T00:00:00Z' }

describe('实际 CloudBase SDK 持久化契约', () => {
  it('首次新文档get返回null，set自动upsert，重放仍只保存一次', async () => {
    const { db, calls } = sdkDatabase()
    expect(await listMemoryStates(db, 'alice')).toEqual([])
    const saved = await persistMemoryReview(db, 'alice', event, new Date('2026-09-18T10:00:00Z'))
    expect(saved).toMatchObject({ duplicate: false, state: { reviews: 1, nextReviewAt: '2026-09-19' } })
    const duplicate = await persistMemoryReview(db, 'alice', event)
    expect(duplicate).toMatchObject({ duplicate: true, state: { reviews: 1 } })
    expect(await listMemoryStates(db, 'alice')).toHaveLength(1)
    expect(await listMemoryStates(db, 'bob')).toEqual([])
    expect(calls.filter((call) => call.action === 'database.modifyDocument')).toHaveLength(2)
    expect(calls.filter((call) => call.action === 'database.getDocument' && !call.params.transactionId).every((call) => call.params.limit === 500)).toBe(true)
  })

  it('保留写入冲突错误码，真实runTransaction自动重试', async () => {
    const { db, calls } = sdkDatabase({ conflictOnce: true })
    expect((await persistMemoryReview(db, 'alice', event)).state.reviews).toBe(1)
    expect(calls.filter((call) => call.action === 'database.startTransaction')).toHaveLength(2)
    expect(calls.filter((call) => call.action === 'database.commitTransaction')).toHaveLength(1)
  })

  it('读取错误不误判为空文档，也不吞成首次成功', async () => {
    const { db, calls } = sdkDatabase({ denied: true })
    await expect(listMemoryStates(db, 'alice')).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    await expect(persistMemoryReview(db, 'alice', event)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    expect(calls.filter((call) => call.action === 'database.modifyDocument')).toHaveLength(0)
    expect(calls.filter((call) => call.action === 'database.abortTransaction')).toHaveLength(1)
  })
})
