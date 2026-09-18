import { createHash } from 'node:crypto'
import { scheduleReview } from './memory-schedule.mjs'

export const MEMORY_STATE_TYPE = 'memory-state-v1'
const EVENT_TYPE = 'memory-event-v1'
const key = (parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex')
const stateId = (memberId, cardId) => `memory-state--${key([memberId, cardId])}`
const eventId = (memberId, id) => `memory-event--${key([memberId, id])}`

function checked(response) {
  if (response?.code) {
    // The SDK retries transaction conflicts by error.code. Preserve it when
    // converting a returned error envelope into a thrown error.
    throw Object.assign(new Error(response.message || String(response.code)), { code: response.code, requestId: response.requestId })
  }
  return response
}

function document(response) {
  const data = checked(response)?.data
  return Array.isArray(data) ? data[0] : data
}

export function validateMemoryReview(input) {
  if (!input || typeof input.correct !== 'boolean') return '请使用对号或错号提交结果'
  if (typeof input.cardId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.cardId)) return '背书卡片编号无效'
  if (typeof input.eventId !== 'string' || !/^[a-zA-Z0-9_-]{12,100}$/.test(input.eventId)) return '复习记录编号无效'
  if (!['daily', 'all'].includes(input.mode)) return '背书模式无效'
  return null
}

export async function listMemoryStates(db, memberId) {
  // Paginate so an expanding deck never silently drops cards after 1,000 records.
  const states = []
  for (let offset = 0; ; offset += 500) {
    const where = { recordType: MEMORY_STATE_TYPE, ...(memberId ? { memberId } : {}) }
    const batch = checked(await db.collection('app_config').where(where).skip(offset).limit(500).get()).data || []
    for (const item of batch) if (item.state?.memberId === item.memberId) states.push(item.state)
    if (batch.length < 500) return states
  }
}

export async function persistMemoryReview(db, memberId, input, now = new Date()) {
  const problem = validateMemoryReview(input)
  if (problem) throw new Error(problem)
  if (!memberId) throw new Error('UNAUTHORIZED')
  return db.runTransaction(async (transaction) => {
    const collection = transaction.collection('app_config')
    const eventRef = collection.doc(eventId(memberId, input.eventId))
    const stateRef = collection.doc(stateId(memberId, input.cardId))
    const event = document(await eventRef.get())
    const current = document(await stateRef.get())
    if (event) {
      if (event.cardId !== input.cardId || event.correct !== input.correct || event.mode !== input.mode) throw new Error('复习记录编号已用于另一条结果')
      return { state: current?.state || event.state, duplicate: true }
    }
    const state = scheduleReview(current?.state, { memberId, cardId: input.cardId, correct: input.correct }, now)
    checked(await stateRef.set({ recordType: MEMORY_STATE_TYPE, memberId, cardId: input.cardId, state }))
    // Keep immutable event receipts: an offline replay cannot apply a review twice,
    // even after other reviews of this card have already been accepted.
    checked(await eventRef.set({
      recordType: EVENT_TYPE, memberId, cardId: input.cardId,
      eventId: input.eventId, correct: input.correct, mode: input.mode,
      acceptedAt: new Date(now).toISOString(), state
    }))
    return { state, duplicate: false }
  })
}
