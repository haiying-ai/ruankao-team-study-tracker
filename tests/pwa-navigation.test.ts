import { describe, expect, it } from 'vitest'
import type { CacheWillUpdateCallback, CachedResponseWillBeUsedCallback, RouteMatchCallback } from 'workbox-core'
import { navigationCacheWillUpdate, navigationCachedResponseWillBeUsed, navigationRuntimeCaching } from '../src/utils/pwa-navigation'

const shell = '<!doctype html><html><head><script type="module" crossorigin src="/assets/index-abc123.js"></script></head><body><div id="app"></div></body></html>'
const event = {} as Parameters<CacheWillUpdateCallback>[0]['event']

function request(mode: RequestMode = 'navigate', method = 'GET'): Request {
  // Node does not permit constructing a navigate-mode Request. Workbox receives
  // one from the browser's FetchEvent; only these fields are read by the guards.
  return { mode, method } as Request
}

function response(body = shell, headers: Record<string, string> = {}, status = 200) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...headers } })
}

async function checkBoth(candidate: Response, accepted: boolean, incoming = request()) {
  const fresh = await navigationCacheWillUpdate({ request: incoming, response: candidate, event })
  const cached = await navigationCachedResponseWillBeUsed({ request: incoming, cachedResponse: candidate, event, cacheName: 'test' })
  expect(fresh).toBe(accepted ? candidate : null)
  expect(cached).toBe(accepted ? candidate : null)
  expect(candidate.bodyUsed).toBe(false)
}

describe('navigation HTML cache safety', () => {
  it('caches genuine app-shell navigation without consuming or altering its response', async () => {
    await checkBoth(response(), true)
    await checkBoth(response(shell, { 'Content-Disposition': 'inline', 'Content-Type': 'TEXT/HTML' }), true)
  })

  it.each(['attachment', 'attachment; filename="index.html"', 'Attachment; filename="index.html"'])(
    'rejects attachment responses for both writes and reads: %s', async (disposition) => {
      const candidate = response(shell, { 'Content-Disposition': disposition })
      await checkBoth(candidate, false)
      expect(candidate.headers.get('content-disposition')).toBe(disposition)
    }
  )

  it.each([403, 404, 429, 500, 503])('never caches HTTP %s even with app-shell markers', async (status) => {
    await checkBoth(response(shell, {}, status), false)
  })

  it.each(['application/octet-stream', 'application/json', 'text/plain', 'text/html-not-really'])('rejects %s', async (mime) => {
    await checkBoth(response(shell, { 'Content-Type': mime }), false)
  })

  it('rejects a 200 platform warning page or partial app markers', async () => {
    await checkBoth(response('<html><body>请确认风险提示后继续访问</body></html>'), false)
    await checkBoth(response('<div id="app"></div>'), false)
    await checkBoth(response('<script type="module" src="/assets/index.js"></script>'), false)
  })

  it('never caches a non-navigation HTML fetch or POST', async () => {
    await checkBoth(response(), false, request('cors'))
    await checkBoth(response(), false, request('navigate', 'POST'))
  })

  it('handles a missing offline cache safely', async () => {
    expect(await navigationCachedResponseWillBeUsed({ request: request(), event, cacheName: 'test' })).toBeNull()
  })

  it('callbacks remain executable after standalone generateSW-style serialization', async () => {
    const isolatedWrite = new Function(`return (${navigationCacheWillUpdate.toString()})`)() as CacheWillUpdateCallback
    const isolatedRead = new Function(`return (${navigationCachedResponseWillBeUsed.toString()})`)() as CachedResponseWillBeUsedCallback
    const candidate = response()
    expect(await isolatedWrite({ request: request(), response: candidate, event })).toBe(candidate)
    expect(await isolatedRead({ request: request(), cachedResponse: candidate, event, cacheName: 'test' })).toBe(candidate)
    const attachment = response(shell, { 'Content-Disposition': 'attachment' })
    expect(await isolatedWrite({ request: request(), response: attachment, event })).toBeNull()
  })

  it('routes only real same-origin root/index navigation, leaving APIs and files untouched', () => {
    const matches = navigationRuntimeCaching.urlPattern as RouteMatchCallback
    const match = (path: string, sameOrigin = true, mode: RequestMode = 'navigate') => matches({
      request: request(mode), sameOrigin, url: new URL(path, 'https://example.test'), event: {} as Parameters<RouteMatchCallback>[0]['event']
    })
    expect(match('/')).toBe(true)
    expect(match('/index.html')).toBe(true)
    expect(match('/api/memory')).toBe(false)
    expect(match('/download.pdf')).toBe(false)
    expect(match('/', false)).toBe(false)
    expect(match('/', true, 'cors')).toBe(false)
  })

  it('uses NetworkFirst without timeout or response rewriting, so online platform failures pass through', () => {
    expect(navigationRuntimeCaching.handler).toBe('NetworkFirst')
    expect(navigationRuntimeCaching.options?.cacheName).toBe('ruankao-navigation-v1')
    expect(navigationRuntimeCaching.options?.networkTimeoutSeconds).toBeUndefined()
    expect(navigationRuntimeCaching.options?.fetchOptions).toBeUndefined()
    for (const plugin of navigationRuntimeCaching.options?.plugins || []) {
      expect(plugin.fetchDidSucceed).toBeUndefined()
      expect(plugin.handlerWillRespond).toBeUndefined()
      expect(plugin.handlerDidError).toBeUndefined()
    }
  })
})
