<script setup lang="ts">
const ui = useUi()
const player = usePlayer()
const list = ref<HTMLElement | null>(null)

watch(ui.queueOpen, async (open) => {
  if (!open) return
  await nextTick()
  // Start with the current song in view.
  list.value?.querySelector('.current')?.scrollIntoView({ block: 'center' })
})
</script>

<template>
  <Sheet :open="ui.queueOpen.value" tall title="Up next" @close="ui.queueOpen.value = false">
    <div ref="list" class="q">
      <SongRow
        v-for="(s, i) in player.queue.value"
        :key="`${i}_${s.id}`"
        :song="s"
        hide-more
        @play="player.skipTo(i)"
        @more="ui.openSongMenu(s)"
      >
        <template #trailing>
          <button v-if="i !== player.index.value" class="icon-btn rm" aria-label="Remove from queue" @click.stop="player.removeAt(i)" @pointerdown.stop>
            <Icon name="close" :size="20" />
          </button>
          <span v-else class="small accent now">Now</span>
        </template>
      </SongRow>
    </div>
  </Sheet>
</template>

<style scoped>
.q { padding-bottom: 16px; }
.rm { color: var(--muted); margin-right: -10px; }
.now { font-weight: 700; padding-right: 4px; }
</style>
