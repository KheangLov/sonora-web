<script setup lang="ts">
withDefaults(defineProps<{ icon?: string, title: string, message?: string }>(), { icon: 'offline' })
</script>

<template>
  <div class="empty">
    <div class="ic"><Icon :name="icon" :size="34" /></div>
    <h3 class="h3">{{ title }}</h3>
    <p v-if="message" class="body muted">{{ message }}</p>
    <div class="row gap-12 actions"><slot /></div>
  </div>
</template>

<style scoped>
.empty { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 48px 32px; gap: 8px; }
.ic { width: 72px; height: 72px; border-radius: 50%; background: var(--surface-3); display: grid; place-items: center; color: var(--muted); margin-bottom: 8px; }
p { margin: 0; max-width: 340px; }
.actions { margin-top: 12px; flex-wrap: wrap; justify-content: center; }
</style>
