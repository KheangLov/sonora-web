<script setup lang="ts">
const props = defineProps<{
  title: string
  subtitle?: string
  icon?: string
  cover?: string | null
  gradient: [string, string]
  canPlay: boolean
  round?: boolean
}>()
defineEmits<{ play: [], shuffle: [] }>()
const router = useRouter()
</script>

<template>
  <header class="hdr" :style="{ '--g1': gradient[0], '--g2': gradient[1] }">
    <div class="pad inner">
      <button class="icon-btn back" aria-label="Back" @click="router.back()"><Icon name="back" /></button>
      <div class="top">
        <div class="cover" :class="{ round }">
          <Artwork v-if="cover" :src="cover" :size="220" :radius="round ? '50%' : 12" eager />
          <Icon v-else :name="icon ?? 'note'" :size="72" />
        </div>
        <div class="col info">
          <h1 class="h1 clamp2">{{ title }}</h1>
          <p v-if="subtitle" class="body muted sub">{{ subtitle }}</p>
        </div>
      </div>
      <div class="row actions">
        <slot name="actions" />
        <span class="grow" />
        <button class="icon-btn" aria-label="Shuffle" :disabled="!canPlay" @click="$emit('shuffle')"><Icon name="shuffle" :size="28" /></button>
        <button class="fab" aria-label="Play" :disabled="!canPlay" @click="$emit('play')"><Icon name="play" :size="30" /></button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.hdr { background: linear-gradient(180deg, color-mix(in srgb, var(--g1) 75%, transparent), color-mix(in srgb, var(--g1) 22%, transparent) 70%, var(--bg)); }
.inner { padding-top: calc(var(--safe-t) + 8px); padding-bottom: 8px; }
.back { margin-left: -10px; }
.top { display: flex; flex-direction: column; align-items: center; gap: 20px; margin-top: 8px; }
.cover {
  width: 200px; height: 200px; border-radius: 12px; display: grid; place-items: center; color: #fff;
  background: linear-gradient(135deg, var(--g1), var(--g2)); box-shadow: 0 20px 48px rgba(0, 0, 0, .45); overflow: hidden;
}
.cover.round { border-radius: 50%; }
.cover :deep(.art) { width: 100%; height: 100%; }
.info { width: 100%; gap: 4px; }
.sub { margin: 0; }
.actions { margin-top: 12px; gap: 4px; }
@media (min-width: 900px) {
  .top { flex-direction: row; align-items: flex-end; gap: 28px; margin-top: 16px; }
  .cover { width: 220px; height: 220px; }
}
</style>
