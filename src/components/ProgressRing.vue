<script setup lang="ts">
defineProps<{ value: number; label?: string; size?: number }>()
</script>

<template>
  <div
    class="progress-ring"
    :style="{ '--progress': `${Math.max(0, Math.min(100, value)) * 3.6}deg`, '--size': `${size || 104}px` }"
    role="img"
    :aria-label="`${label || '完成进度'} ${value}%`"
  >
    <div><strong>{{ value }}%</strong><small>{{ label || '总进度' }}</small></div>
  </div>
</template>
