<script setup lang="ts">
import type { Collection } from '#shared/types/music'

const props = defineProps<{ c: Collection, eager?: boolean }>()
const isArtist = computed(() => props.c.id.startsWith('UC'))
const to = computed(() => browseLink(props.c))
</script>

<template>
  <NuxtLink :to="to" class="card" :class="{ artist: isArtist }">
    <Artwork :src="c.thumbnail" :size="156" :radius="isArtist ? '50%' : 10" :eager="eager" />
    <span class="title ellipsis">{{ c.title }}</span>
    <span class="small muted clamp2">{{ c.subtitle }}</span>
  </NuxtLink>
</template>

<style scoped>
.card { width: 156px; display: flex; flex-direction: column; gap: 4px; }
.card :deep(.art) { width: 156px; height: 156px; margin-bottom: 6px; transition: transform .25s var(--ease); }
.card:active :deep(.art) { transform: scale(.97); }
.artist { align-items: center; text-align: center; }
@media (min-width: 900px) {
  .card { width: 176px; }
  .card :deep(.art) { width: 176px; height: 176px; }
}
</style>
