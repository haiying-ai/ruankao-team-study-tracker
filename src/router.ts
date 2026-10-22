import { createRouter, createWebHashHistory } from 'vue-router'
import { hasStoredSession } from './services/api'
import { CALM_HIDDEN_ROUTE_NAMES, EXAM_CALM_MODE } from './config/exam-calm'

const routes = [
  { path: '/login', name: 'login', component: () => import('./views/LoginView.vue'), meta: { public: true } },
  { path: '/', name: 'today', component: () => import('./views/TodayView.vue') },
  { path: '/plan', name: 'plan', component: () => import('./views/PlanView.vue') },
  { path: '/memory', name: 'memory', component: () => import('./views/MemoryView.vue') },
  { path: '/progress', name: 'progress', component: () => import('./views/ProgressView.vue') },
  { path: '/team', name: 'team', component: () => import('./views/TeamView.vue') },
  { path: '/settings', name: 'settings', component: () => import('./views/SettingsView.vue') },
  { path: '/admin', name: 'admin', component: () => import('./views/AdminView.vue'), meta: { admin: true } }
]

export const router = createRouter({ history: createWebHashHistory(), routes })

router.beforeEach((to) => {
  if (to.meta.public) return hasStoredSession() ? { name: 'today' } : true
  if (!hasStoredSession()) return { name: 'login', query: { redirect: to.fullPath } }
  if (EXAM_CALM_MODE && typeof to.name === 'string' && CALM_HIDDEN_ROUTE_NAMES.has(to.name)) return { name: 'today' }
  return true
})
