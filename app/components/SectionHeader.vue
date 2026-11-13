<script setup lang="ts">
defineProps<{ title: string, subtitle?: string | null }>()
</script>

<template>
  <div class="sh pad">
    <span v-if="subtitle" class="small muted">{{ subtitle }}</span>
    <h2 class="h2">{{ title }}</h2>
  </div>
</template>

<style scoped>
.sh { display: flex; flex-direction: column; gap: 2px; padding-top: 28px; padding-bottom: 12px; }
</style>
