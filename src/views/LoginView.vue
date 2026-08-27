<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '../stores/app'

const store = useAppStore()
const router = useRouter()
const route = useRoute()
const teamCode = ref('')
const memberId = ref('')
const pin = ref('')

async function verifyTeam() {
  try {
    await store.verifyTeam(teamCode.value.trim())
    memberId.value = store.publicMembers[0]?.id || ''
  } catch { /* message comes from store */ }
}

function changeTeamCode() {
  store.resetTeamVerification()
  memberId.value = ''
  pin.value = ''
}

async function submit() {
  try {
    await store.login({ teamCode: store.verifiedTeamCode, memberId: memberId.value, pin: pin.value.trim() })
    await router.replace(typeof route.query.redirect === 'string' ? route.query.redirect : '/')
  } catch { /* message comes from store */ }
}
</script>

<template>
  <main class="login-page">
    <section class="login-hero">
      <span class="brand-mark">中项</span>
      <p class="eyebrow">2026 · 8周通关计划</p>
      <h1>一起把计划<br />变成确定性</h1>
      <p>每天120分钟，进度透明，欠账不消失。模拟、刷题、视频与直播，一处完成。</p>
      <div class="hero-stats"><span><strong>1003</strong>章节题</span><span><strong>5+2</strong>真题与模考</span><span><strong>10</strong>场直播</span></div>
    </section>
    <form class="login-card" @submit.prevent="submit">
      <div><span class="eyebrow">仅限小组成员</span><h2>进入学习站</h2></div>
      <label>团队口令<input v-model="teamCode" :disabled="Boolean(store.teamToken)" autocomplete="current-password" type="password" placeholder="请先验证团队口令" required /></label>
      <button v-if="!store.teamToken" type="button" class="primary-button" :disabled="store.loading || !teamCode.trim()" @click="verifyTeam">{{ store.loading ? '正在验证…' : '验证团队口令' }}</button>
      <div v-else class="verified-team"><span>✓ 团队口令验证通过</span><button type="button" @click="changeTeamCode">更换</button></div>
      <label v-if="store.teamToken">选择身份
        <select v-model="memberId" required>
          <option disabled value="">请选择成员</option>
          <option v-for="member in store.publicMembers" :key="member.id" :value="member.id">{{ member.displayName }}</option>
        </select>
      </label>
      <label v-if="store.teamToken">个人 PIN<input v-model="pin" inputmode="numeric" autocomplete="current-password" type="password" placeholder="请输入个人PIN" required /></label>
      <p v-if="store.error" class="error-message">{{ store.error }}</p>
      <p v-if="!store.remote" class="demo-hint">本地演示：团队口令 demo2026，选择管理员，PIN 123456。</p>
      <button v-if="store.teamToken" class="primary-button" :disabled="store.loading">{{ store.loading ? '正在验证…' : '开始今日学习' }}</button>
    </form>
  </main>
</template>
