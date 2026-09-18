import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import * as memoryStore from '../shared/memory-store.mjs'
import * as memoryTeam from '../shared/memory-team.mjs'
import type { MemoryReviewState } from '../src/types/memory'

const require = createRequire(import.meta.url)
// Resolve the real HTTP framework once, outside per-test timeouts. Windows
// filesystem/antivirus startup can make the initial CJS dependency load slow.
const httpModules: Record<string, unknown> = {
  express: require('express'), cors: require('cors'), 'serverless-http': require('serverless-http')
}

const cards = [
  { id: 'p1', category: 'process' }, { id: 'p2', category: 'process' },
  { id: 'map1', category: 'process-map' }, { id: 'concept1', category: 'concept' }
]
const members = [{ id: 'alice', active: true }, { id: 'bob', active: true }, { id: 'disabled', active: false }]
const state = (overrides: Partial<MemoryReviewState> = {}): MemoryReviewState => ({
  memberId: 'alice', cardId: 'p1', streak: 3, lapses: 0, reviews: 3,
  lastReviewedAt: '2026-09-18T10:00:00Z', nextReviewAt: '2026-09-19',
  intervalDays: 7, lastCorrect: true, ...overrides
})

describe('团队背书统计口径', () => {
  it('所有启用成员均返回，未背成员为0，类别分母取当前题库', () => {
    const result = memoryTeam.buildMemoryTeamSummary(members, cards, [], '2026-09-18T16:00:00Z')
    expect(result.generatedAt).toBe('2026-09-18T16:00:00.000Z')
    expect(result.summaries).toHaveLength(2)
    expect(result.summaries[1]).toEqual({
      memberId: 'bob', total: 4, reviewed: 0, stable: 0, due: 0, needsWork: 0,
      reviews: 0, lastReviewedAt: null,
      process: { total: 2, reviewed: 0, stable: 0 }, processMap: { total: 1, reviewed: 0, stable: 0 }
    })
  })

  it('去重同成员同卡，删除题与禁用成员不计，已背张数和作答次数分开', () => {
    const states = [
      state(), state({ reviews: 1, streak: 1, lastReviewedAt: '2026-09-17T10:00:00Z' }),
      state({ cardId: 'map1', reviews: 4, streak: 4 }),
      state({ cardId: 'p2', lastCorrect: false, reviews: 5, streak: 0 }),
      state({ cardId: 'deleted-card', reviews: 999 }),
      state({ memberId: 'disabled', reviews: 999 }), state({ memberId: 'outsider' }),
      state({ memberId: 'bob', streak: 2, reviews: 2 })
    ]
    const [alice, bob] = memoryTeam.buildMemoryTeamSummary(members, cards, states, '2026-09-18T16:00:00Z').summaries
    expect(alice).toMatchObject({ total: 4, reviewed: 3, stable: 2, needsWork: 1, reviews: 12, due: 3,
      process: { total: 2, reviewed: 2, stable: 1 }, processMap: { total: 1, reviewed: 1, stable: 1 } })
    expect(bob).toMatchObject({ reviewed: 1, stable: 0, reviews: 2 })
  })

  it('到期比较上海日期，答错即使残留高streak也不算已巩固', () => {
    const states = [state(), state({ cardId: 'p2', lastCorrect: false, streak: 10 })]
    expect(memoryTeam.buildMemoryTeamSummary(members, cards, states, '2026-09-18T15:59:59Z').summaries[0]).toMatchObject({ due: 0, stable: 1, needsWork: 1 })
    expect(memoryTeam.buildMemoryTeamSummary(members, cards, states, '2026-09-18T16:00:00Z').summaries[0]).toMatchObject({ due: 2, stable: 1 })
  })

  it('忽略坏记录，去重题库/成员，最近复习使用真实时间而非字符串时区', () => {
    const states = [state({ reviews: 0 }), state({ cardId: 'p2', lastReviewedAt: 'bad' }),
      state({ cardId: 'map1', lastReviewedAt: '2026-09-18T20:00:00+08:00' }),
      state({ cardId: 'concept1', lastReviewedAt: '2026-09-18T13:00:00Z' })]
    const result = memoryTeam.buildMemoryTeamSummary([...members, members[0]!], [...cards, cards[0]!], states)
    expect(result.summaries).toHaveLength(2)
    expect(result.summaries[0]).toMatchObject({ total: 4, reviewed: 2, reviews: 6, lastReviewedAt: '2026-09-18T13:00:00.000Z' })
  })
})

// Run the production Express/serverless-http handler without a socket or cloud
// writes. Only CloudBase transport and CJS dynamic-import loading are injected.
function api({ expired = false, disabled = false } = {}) {
  const collections: Record<string, Record<string, unknown>[]> = {
    sessions: [{ _id: createHash('sha256').update('valid-token').digest('hex'), memberId: 'alice', expiresAt: new Date(Date.now() + (expired ? -60_000 : 60_000)).toISOString() }],
    members: members.map((member) => ({ ...member, _id: member.id, role: 'member', active: member.id === 'alice' ? !disabled : member.active, pinHash: 'PIN_SECRET', pinSalt: 'SALT_SECRET' })),
    app_config: [
      { _id: 'main', teamCodeHash: 'TEAM_SECRET' },
      { recordType: memoryStore.MEMORY_STATE_TYPE, memberId: 'alice', cardId: 'p1', state: state() },
      { recordType: memoryStore.MEMORY_STATE_TYPE, memberId: 'alice', cardId: 'map1', state: state({ memberId: 'bob', cardId: 'map1' }) },
      { recordType: memoryStore.MEMORY_STATE_TYPE, memberId: 'alice', cardId: 'deleted', state: state({ cardId: 'deleted' }) },
      { recordType: 'memory-event-v1', memberId: 'alice', eventId: 'PRIVATE_EVENT', state: state() }
    ]
  }
  let reads = 0
  const db = { collection(name: string) {
    return {
      doc(id: string) { return { async get() { reads++; return { data: (collections[name] || []).filter((doc) => doc._id === id) } } } },
      where(where: Record<string, unknown>) {
        let offset = 0; let limit = 1000
        const query = {
          skip(value: number) { offset = value; return query },
          limit(value: number) { limit = value; return query },
          async get() { reads++; return { data: (collections[name] || []).filter((doc) => Object.entries(where).every(([key, value]) => doc[key] === value)).slice(offset, offset + limit) } }
        }
        return query
      }
    }
  } }
  const modules: Record<string, unknown> = {
    '../../shared/memory-store.mjs': memoryStore, '../../shared/memory-team.mjs': memoryTeam
  }
  const source = readFileSync(new URL('../functions/api/index.js', import.meta.url), 'utf8').replace(/\bimport\(/g, 'importModule(')
  const exports: { main?: (event: unknown, context: unknown) => Promise<{ statusCode: number; body: string }> } = {}
  const mockedRequire = (name: string) => name === '@cloudbase/node-sdk' ? { init: () => ({ database: () => db }) }
    : name === '../../src/data/memory-cards.json' ? cards : httpModules[name] || require(name)
  new Function('require', 'exports', 'module', 'importModule', source)(mockedRequire, exports, { exports }, (name: string) => Promise.resolve(modules[name]))
  return {
    reads: () => reads,
    async request(path = '/api/memory/team', token = 'valid-token', method = 'GET', body?: unknown, extraHeaders = {}) {
      const response = await exports.main!({
        httpMethod: method, path, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json', ...extraHeaders },
        requestContext: { identity: { sourceIp: '127.0.0.1' } }, body: body ? JSON.stringify(body) : undefined, isBase64Encoded: false
      }, {})
      return { status: response.statusCode, body: JSON.parse(response.body) }
    }
  }
}

describe('GET /memory/team 权限和最小披露', () => {
  it('未登录、过期会话和禁用成员均拒绝', async () => {
    const anonymous = api()
    expect((await anonymous.request('/api/memory/team', '')).status).toBe(401)
    expect(anonymous.reads()).toBe(0)
    expect((await api({ expired: true }).request()).status).toBe(401)
    expect((await api({ disabled: true }).request()).status).toBe(401)
  })

  it('普通成员可读聚合，不能读私密配置/事件/逐卡状态，污染记录不计', async () => {
    const result = await api().request()
    expect(result.status).toBe(200)
    expect(result.body.data.summaries).toHaveLength(2)
    expect(result.body.data.summaries[0]).toMatchObject({ memberId: 'alice', reviewed: 1, reviews: 3 })
    expect(result.body.data.summaries[1]).toMatchObject({ memberId: 'bob', reviewed: 0, reviews: 0 })
    expect(Object.keys(result.body.data).sort()).toEqual(['generatedAt', 'summaries'])
    expect(Object.keys(result.body.data.summaries[0]).sort()).toEqual(['memberId', 'total', 'reviewed', 'stable', 'due', 'needsWork', 'reviews', 'lastReviewedAt', 'process', 'processMap'].sort())
    expect(JSON.stringify(result.body)).not.toMatch(/PIN_SECRET|SALT_SECRET|TEAM_SECRET|PRIVATE_EVENT|cardId|states|pinHash/)
  })

  it('已有本人读写接口仍阻止跨成员队列，普通成员不能改成员', async () => {
    const server = api()
    expect((await server.request('/api/memory', 'valid-token', 'GET', undefined, { 'x-memory-member': 'bob' })).status).toBe(403)
    expect((await server.request('/api/memory/review', 'valid-token', 'POST', { memberId: 'bob' }, { 'x-memory-member': 'bob' })).status).toBe(403)
    expect((await server.request('/api/admin/members', 'valid-token', 'PUT', {})).status).toBe(403)
  })
})
