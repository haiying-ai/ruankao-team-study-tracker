<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../stores/app'
import { daysBetween } from '../utils/date'
import { EXAM_CALM_MODE } from '../config/exam-calm'

const store = useAppStore()
const router = useRouter()
const message = ref('')
const expiryDays = computed(() => store.snapshot?.config.environmentExpiresAt ? daysBetween(store.today, store.snapshot.config.environmentExpiresAt) : undefined)

async function exportData() {
  const content = await store.exportData()
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `ruankao-export-${new Date().toISOString().slice(0, 10)}.json`; anchor.click()
  URL.revokeObjectURL(url)
}
async function logout() { await store.logout(); await router.replace('/login') }
</script>

<template>
  <div class="page-stack settings-page">
    <section class="page-intro"><span class="eyebrow">SETTINGS</span><h2>设备与账号</h2><p>考前安心模式已开启：不显示计划、排名和欠账信息。</p></section>
    <section class="panel-card setting-list">
      <div><span>当前成员</span><strong>{{ store.member?.displayName }} · {{ store.isAdmin ? '管理员' : '成员' }}</strong></div>
      <div><span>运行模式</span><strong>{{ store.remote ? 'CloudBase 云端' : '本地演示' }}</strong></div>
      <div><span>考试日期</span><strong>{{ store.snapshot?.config.examDate }}</strong></div>
    </section>
    <div v-if="!EXAM_CALM_MODE && store.isAdmin && expiryDays !== undefined && expiryDays <= 30" class="alert-card" :class="{ danger: expiryDays <= 7 }"><strong>CloudBase环境即将到期</strong><span>剩余 {{ Math.max(0, expiryDays) }} 天，请在控制台续期，避免网站停用。</span></div>
    <section v-if="!EXAM_CALM_MODE" class="panel-card"><span class="eyebrow">DATE PREVIEW</span><h2>预览计划日期</h2><p class="muted">仅当前设备生效，方便验收滚动、直播和倒计时，不修改团队数据。</p><label>预览日期<input :value="store.previewDate" type="date" min="2026-08-27" max="2026-10-24" @input="store.setPreviewDate(($event.target as HTMLInputElement).value)" /></label><button class="secondary-button" @click="store.setPreviewDate('')">恢复今天</button></section>
    <section class="panel-card action-list"><button @click="exportData"><span>导出我的安全数据副本</span><b>↓</b></button><button v-if="!EXAM_CALM_MODE && store.isAdmin" @click="router.push('/admin')"><span>打开计划管理</span><b>→</b></button><button class="danger-text" @click="logout"><span>退出登录</span><b>↗</b></button></section>
    <p v-if="message" class="success-message">{{ message }}</p>
  </div>
</template>
