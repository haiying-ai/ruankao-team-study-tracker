import { describe, expect, it, vi } from 'vitest'
import { createTeamMemoryService } from '../src/services/team-memory'

const snapshot = {
  generatedAt: '2026-09-18T12:00:00Z',
  summaries: [{ memberId: 'alice', total: 234, reviewed: 18, stable: 3, due: 7, needsWork: 5, reviews: 24,
    lastReviewedAt: '2026-09-18T11:00:00Z', process: { total: 49, reviewed: 10, stable: 2 }, processMap: { total: 15, reviewed: 4, stable: 1 } }]
}

function setup(request: typeof fetch) {
  const values = new Map([['ruankao.session-token', 'alice-token'], ['ruankao.team-proof', 'team-proof']])
  const storage = () => ({ getItem: (key: string) => values.get(key) || null })
  return { values, service: createTeamMemoryService({ apiBase: 'https://example.test/api/', storage, request }) }
}

describe('团队背书摘要服务', () => {
  it('仅通过带会话和团队凭据的 GET 读取摘要，不发送成员记录、不允许缓存', async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ data: snapshot }))
    const { service } = setup(request)
    expect(await service.loadTeamMemory()).toEqual(snapshot)
    expect(request).toHaveBeenCalledWith('https://example.test/api/memory/team', expect.objectContaining({
      method: 'GET', cache: 'no-store', headers: { Authorization: 'Bearer alice-token', 'X-Team-Proof': 'team-proof' }
    }))
    expect(request.mock.calls[0]?.[1]?.body).toBeUndefined()
  })

  it('未登录不发请求，401 不伪装成空进度', async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ message: 'expired' }, { status: 401 }))
    const { values, service } = setup(request)
    await expect(service.loadTeamMemory()).rejects.toThrow('UNAUTHORIZED')
    request.mockClear()
    values.delete('ruankao.session-token')
    await expect(service.loadTeamMemory()).rejects.toThrow('UNAUTHORIZED')
    expect(request).not.toHaveBeenCalled()
  })

  it('请求中切换成员会话，丢弃上一会话的返回数据', async () => {
    const { values, service } = setup(async () => {
      values.set('ruankao.session-token', 'bob-token')
      return Response.json({ data: snapshot })
    })
    await expect(service.loadTeamMemory()).rejects.toThrow('成员已切换')
  })

  it('上游取消已完成的请求也不返回过时数据', async () => {
    const controller = new AbortController()
    const { service } = setup(async () => {
      controller.abort()
      return Response.json({ data: snapshot })
    })
    await expect(service.loadTeamMemory(controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('取消后的调用不再发网络请求', async () => {
    const controller = new AbortController()
    controller.abort()
    const request = vi.fn<typeof fetch>(async () => Response.json({ data: snapshot }))
    const { service } = setup(request)
    await expect(service.loadTeamMemory(controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(request).not.toHaveBeenCalled()
  })

  it.each([
    null,
    { generatedAt: 'bad-date', summaries: [] },
    { ...snapshot, summaries: [...snapshot.summaries, ...snapshot.summaries] },
    { ...snapshot, summaries: [{ ...snapshot.summaries[0], reviewed: 235 }] },
    { ...snapshot, summaries: [{ ...snapshot.summaries[0], processMap: undefined }] }
  ])('不将无效摘要渲染成零进度：%j', async (data) => {
    const { service } = setup(async () => Response.json({ data }))
    await expect(service.loadTeamMemory()).rejects.toThrow('数据格式异常')
  })

  it('接受真实空列表和从未背诵的成员', async () => {
    const data = { generatedAt: snapshot.generatedAt, summaries: [] }
    const { service } = setup(async () => Response.json({ data }))
    expect(await service.loadTeamMemory()).toEqual(data)
  })

  it('网络失败如实抛错，由页面保留已成功获取的快照', async () => {
    const { service } = setup(async () => { throw new TypeError('Failed to fetch') })
    await expect(service.loadTeamMemory()).rejects.toThrow('Failed to fetch')
  })

  it('请求超时会中止并提供明确提示', async () => {
    const service = createTeamMemoryService({ apiBase: '/api', storage: () => ({ getItem: () => 'token' }), timeoutMs: 5,
      request: async (_url, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })
    })
    await expect(service.loadTeamMemory()).rejects.toThrow('获取超时')
  })

  it('演示模式明确提示不支持跨设备团队同步，而不是显示伪造的零进度', async () => {
    const request = vi.fn<typeof fetch>()
    const service = createTeamMemoryService({ apiBase: '', storage: () => ({ getItem: () => 'local-alice' }), request })
    await expect(service.loadTeamMemory()).rejects.toThrow('本地演示模式')
    expect(request).not.toHaveBeenCalled()
  })
})
