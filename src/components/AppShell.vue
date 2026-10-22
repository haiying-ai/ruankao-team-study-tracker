<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from '../stores/app'
import { EXAM_CALM_MODE } from '../config/exam-calm'

const store = useAppStore()
const route = useRoute()
const navItems = computed(() => EXAM_CALM_MODE
  ? [
      { to: '/', icon: '☀', label: '安心' },
      { to: '/memory', icon: '▤', label: '背书' },
      { to: '/settings', icon: '⚙', label: '设置' }
    ]
  : [
      { to: '/', icon: '☀', label: '今日' },
      { to: '/plan', icon: '▦', label: '计划' },
      { to: '/memory', icon: '▤', label: '背书' },
      { to: '/progress', icon: '↗', label: '进度' },
      { to: '/team', icon: '♣', label: '团队' },
      { to: '/settings', icon: '⚙', label: '设置' },
      ...(store.isAdmin ? [{ to: '/admin', icon: '✎', label: '管理' }] : [])
    ])
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div>
        <span class="eyebrow">软考中项 · 2610级</span>
        <h1>{{ store.snapshot?.config.appName || '团队学习站' }}</h1>
      </div>
      <div class="member-chip">
        <span class="avatar">{{ store.member?.displayName?.slice(0, 1) }}</span>
        <span>{{ store.member?.displayName }}</span>
      </div>
    </header>

    <div v-if="store.snapshot?.pendingSyncCount" class="sync-banner">
      {{ store.snapshot.pendingSyncCount }} 项离线记录将在联网后同步
    </div>
    <main class="page-container">
      <slot />
    </main>

    <nav class="bottom-nav" :class="{ 'is-admin': store.isAdmin }" :style="{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }" aria-label="主导航">
      <RouterLink
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        :class="{ active: route.path === item.to }"
      >
        <span class="nav-icon">{{ item.icon }}</span>
        <span>{{ item.label }}</span>
      </RouterLink>
    </nav>
  </div>
</template>
