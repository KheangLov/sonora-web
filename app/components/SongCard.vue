<script setup lang="ts">
import type { Song } from '#shared/types/music'

const props = defineProps<{ song: Song, eager?: boolean }>()
const emit = defineEmits<{ play: [], more: [] }>()
const player = usePlayer()
const isCurrent = computed(() => player.current.value?.id === props.song.id)
</script>

<template>
  <div class="card" role="button" tabindex="0" @click="emit('play')" @keydown.enter="emit('play')" @contextmenu.prevent="emit('more')">
    <div class="cover">
      <Artwork :src="song.thumbnail" :size="156" :radius="10" :eager="eager" />
      <div v-if="isCurrent" class="overlay"><EqBars :playing="player.isPlaying.value" :size="22" /></div>
      <span class="play"><Icon name="play" :size="22" /></span>
    </div>
    <span class="title ellipsis" :class="{ accent: isCurrent }">{{ song.title }}</span>
    <span class="small muted ellipsis">{{ song.artist }}</span>
  </div>
</template>

<style scoped>
.card { width: 156px; display: flex; flex-direction: column; gap: 4px; cursor: pointer; }
.cover { position: relative; margin-bottom: 6px; }
.cover :deep(.art) { width: 156px; height: 156px; transition: transform .25s var(--ease); }
.card:active .cover :deep(.art) { transform: scale(.97); }
.overlay { position: absolute; inset: 0; border-radius: 10px; background: rgba(0, 0, 0, .45); display: grid; place-items: center; }
.play {
  position: absolute; right: 8px; bottom: 8px; width: 40px; height: 40px; border-radius: 50%;
  background: var(--accent); color: var(--on-accent); display: grid; place-items: center;
  opacity: 0; transform: translateY(6px); transition: opacity .2s, transform .2s var(--ease);
  box-shadow: 0 6px 16px rgba(0, 0, 0, .4);
}
@media (hover: hover) { .card:hover .play { opacity: 1; transform: none; } }
@media (min-width: 900px) {
  .card { width: 176px; }
  .cover :deep(.art) { width: 176px; height: 176px; }
}
</style>
