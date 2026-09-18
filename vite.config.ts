import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { navigationRuntimeCaching } from './src/utils/pwa-navigation'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: '软考中项·同行计划',
        short_name: '中项同行',
        description: '团队学习、打卡、模考与进度追踪',
        theme_color: '#123C69',
        background_color: '#F3F7FB',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      },
      workbox: {
        // The default hosting domain may mark non-navigation HTML fetches as
        // attachments. Never use that response as a precached navigation shell.
        globPatterns: ['**/*.{js,css,ico,png,svg,webmanifest}'],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
            method: 'GET'
          },
          navigationRuntimeCaching
        ]
      }
    })
  ],
  server: { port: 4173 },
  test: { environment: 'node', globals: true }
})
