<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from './components/AppShell.vue'
import { useAppStore } from './stores/app'
import { syncMemory } from './services/memory'

const store = useAppStore()
const route = useRoute()
const router = useRouter()

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
</script>

<template>
  <RouterView v-if="$route.name === 'login'" />
  <AppShell v-else>
    <RouterView />
  </AppShell>
</template>
