import type { RuntimeCaching } from 'workbox-build'
import type { CacheWillUpdateCallback, CachedResponseWillBeUsedCallback } from 'workbox-core'

// generateSW serializes these callbacks into a standalone worker. Keep each
// function self-contained: do not replace the repeated checks with a helper
// captured from this module's scope.
export const navigationCacheWillUpdate: CacheWillUpdateCallback = async ({ request, response }) => {
  if (request.mode !== 'navigate' || request.method !== 'GET' || response.status !== 200) return null
  if (!/^text\/html(?:\s*;|\s*$)/i.test(response.headers.get('content-type') || '')) return null
  if (/\battachment\b/i.test(response.headers.get('content-disposition') || '')) return null

  try {
    const html = await response.clone().text()
    // CloudBase's warning/denial pages can also return 200 text/html. Cache only
    // our built app shell, never a platform interstitial or a generic HTML file.
    const appRoot = /<div\b[^>]*\sid\s*=\s*["']app["'][^>]*>/i.test(html)
    const appEntry = /<script\b(?=[^>]*\stype\s*=\s*["']module["'])(?=[^>]*\ssrc\s*=\s*["']\/assets\/[^"']+\.js["'])[^>]*>/i.test(html)
    return appRoot && appEntry ? response : null
  } catch {
    return null
  }
}

export const navigationCachedResponseWillBeUsed: CachedResponseWillBeUsedCallback = async ({ request, cachedResponse }) => {
  if (request.mode !== 'navigate' || request.method !== 'GET' || !cachedResponse || cachedResponse.status !== 200) return null
  if (!/^text\/html(?:\s*;|\s*$)/i.test(cachedResponse.headers.get('content-type') || '')) return null
  if (/\battachment\b/i.test(cachedResponse.headers.get('content-disposition') || '')) return null

  try {
    const html = await cachedResponse.clone().text()
    const appRoot = /<div\b[^>]*\sid\s*=\s*["']app["'][^>]*>/i.test(html)
    const appEntry = /<script\b(?=[^>]*\stype\s*=\s*["']module["'])(?=[^>]*\ssrc\s*=\s*["']\/assets\/[^"']+\.js["'])[^>]*>/i.test(html)
    return appRoot && appEntry ? cachedResponse : null
  } catch {
    return null
  }
}

export const navigationRuntimeCaching: RuntimeCaching = {
  urlPattern: ({ request, sameOrigin, url }) => sameOrigin && request.mode === 'navigate'
    && (url.pathname === '/' || url.pathname === '/index.html'),
  handler: 'NetworkFirst',
  method: 'GET',
  options: {
    cacheName: 'ruankao-navigation-v1',
    // No timeout or fetchDidSucceed override: received error/attachment/risk-page
    // responses must be returned unchanged, not replaced by an older app shell.
    plugins: [{
      cacheWillUpdate: navigationCacheWillUpdate,
      cachedResponseWillBeUsed: navigationCachedResponseWillBeUsed
    }],
    expiration: { maxEntries: 8, maxAgeSeconds: 7 * 24 * 60 * 60 }
  }
}
