<script setup lang="ts">
defineProps<{ icon: string, label: string, tint?: string }>()
defineEmits<{ click: [] }>()
</script>

<template>
  <button class="act" @click="$emit('click')">
    <Icon :name="icon" :style="{ color: tint }" />
    <span class="body">{{ label }}</span>
  </button>
</template>

<style scoped>
.act { display: flex; align-items: center; gap: 20px; width: 100%; padding: 14px 24px; text-align: left; font-size: 15px; }
.act:hover { background: rgba(255, 255, 255, .05); }
.act:active { background: rgba(255, 255, 255, .09); }
.act .body { font-size: 15px; }
</style>
