<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from './components/AppShell.vue'
import { useAppStore } from './stores/app'
import { syncMemory } from './services/memory'
import { EXAM_CALM_MESSAGES, EXAM_CALM_MODE } from './config/exam-calm'

const store = useAppStore()
const route = useRoute()
const router = useRouter()
const calmWelcomeOpen = ref(false)
const calmMessage = ref('')
let welcomedMember = ''

function showCalmWelcome(memberId: string) {
  if (!EXAM_CALM_MODE || !memberId || welcomedMember === memberId) return
  welcomedMember = memberId
  calmMessage.value = EXAM_CALM_MESSAGES[Math.floor(Math.random() * EXAM_CALM_MESSAGES.length)] || ''
  calmWelcomeOpen.value = true
}

function syncMemberMemory() {
  const memberId = store.member?.id
  if (memberId) void syncMemory(memberId).catch(() => { /* Keep pending records for the next authenticated retry. */ })
}

onMounted(async () => {
  window.addEventListener('online', syncMemberMemory)
  if (route.name !== 'login') {
    try { await store.refresh() } catch { await router.replace({ name: 'login' }) }
  }
})
onBeforeUnmount(() => window.removeEventListener('online', syncMemberMemory))
watch(() => store.member?.id, (memberId) => {
  if (!memberId) { welcomedMember = ''; return }
  showCalmWelcome(memberId)
}, { immediate: true })
</script>

<template>
  <RouterView v-if="$route.name === 'login'" />
  <AppShell v-else>
    <RouterView />
  </AppShell>
  <Teleport to="body">
    <div v-if="calmWelcomeOpen" class="modal-backdrop calm-welcome-backdrop" @click.self="calmWelcomeOpen = false">
      <section class="modal-card calm-welcome" role="dialog" aria-modal="true" aria-labelledby="calm-welcome-title">
        <span class="calm-symbol" aria-hidden="true">✦</span>
        <span class="eyebrow">考前安心模式</span>
        <h2 id="calm-welcome-title">{{ store.member?.displayName }}，你好</h2>
        <p class="calm-message">{{ calmMessage }}</p>
        <p class="calm-note">现在不追进度，不比较欠账。轻轻复习、好好休息，带着平常心等待考试的到来。</p>
        <button type="button" class="primary-button" @click="calmWelcomeOpen = false">收下祝福，安心备考</button>
      </section>
    </div>
  </Teleport>
</template>
