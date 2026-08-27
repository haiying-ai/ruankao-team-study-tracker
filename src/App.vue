<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from './components/AppShell.vue'
import { useAppStore } from './stores/app'

const store = useAppStore()
const route = useRoute()
const router = useRouter()

onMounted(async () => {
  if (route.name !== 'login') {
    try { await store.refresh() } catch { await router.replace({ name: 'login' }) }
  }
})
</script>

<template>
  <RouterView v-if="$route.name === 'login'" />
  <AppShell v-else>
    <RouterView />
  </AppShell>
</template>
