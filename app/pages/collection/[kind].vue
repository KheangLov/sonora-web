<script setup lang="ts">
import type { SongRecord } from '~/utils/db'

/** Liked Songs / Downloads / Recently played / Disliked songs. */
const route = useRoute()
const player = usePlayer()
const lib = useLibrary()
const ui = useUi()
const dl = useDownloads()
const confirmRestore = ref(false)

const kind = computed(() => String(route.params.kind))
const conf = computed(() => ({
  liked: { title: 'Liked Songs', icon: 'heart', g: ['#5b3fff', '#9d8cff'], empty: 'Songs you like appear here', msg: 'Tap the heart on any song.' },
  downloads: { title: 'Downloads', icon: 'downloaded', g: ['#5d7a00', '#c6f432'], empty: 'No downloads yet', msg: 'Tap the download icon on any song to keep it for offline listening.' },
  history: { title: 'Recently played', icon: 'history', g: ['#b4410e', '#ff9a5a'], empty: 'Nothing played yet', msg: 'Songs you play show up here.' },
  disliked: { title: 'Disliked songs', icon: 'thumbDown', g: ['#3a3a44', '#7a7a88'], empty: 'No disliked songs', msg: 'Songs you dislike are hidden everywhere and listed here, so you can bring them back.' },
} as Record<string, { title: string, icon: string, g: [string, string], empty: string, msg: string }>)[kind.value]
  ?? { title: 'Library', icon: 'library', g: ['#2b2b33', '#4a4a57'] as [string, string], empty: 'Nothing here', msg: '' })

const songs = computed<SongRecord[]>(() => {
  switch (kind.value) {
    case 'liked': return lib.liked.value
    case 'downloads': return lib.downloads.value
    case 'history': return lib.history.value.slice(0, 300)
    case 'disliked': return lib.disliked.value
    default: return []
  }
})
const playable = computed(() => kind.value === 'disliked' ? [] : songs.value)
const total = computed(() => songs.value.reduce((a, s) => a + (s.duration || 0), 0))
const subtitle = computed(() => `${songs.value.length} songs${total.value ? ` • ${formatTotal(total.value)}` : ''}`)

useHead({ title: () => `${conf.value.title} • Sonora` })
</script>

<template>
  <div class="page">
    <CollectionHeader
      :title="conf.title"
      :subtitle="subtitle"
      :icon="conf.icon"
      :gradient="conf.g"
      :can-play="playable.length > 0"
      @play="player.play(playable)"
      @shuffle="player.play(playable, 0, true)"
    >
      <template #actions>
        <button v-if="kind === 'history'" class="icon-btn" aria-label="Clear history" :disabled="!songs.length" @click="lib.clearHistory()"><Icon name="delete" /></button>
        <button v-else-if="kind === 'liked'" class="icon-btn" aria-label="Download all" :disabled="!songs.length" @click="dl.downloadAll(songs)"><Icon name="download" /></button>
        <button v-else-if="kind === 'disliked'" class="icon-btn" aria-label="Restore all" :disabled="!songs.length" @click="confirmRestore = true"><Icon name="restore" /></button>
      </template>
    </CollectionHeader>

    <EmptyState v-if="lib.ready.value && !songs.length" :icon="conf.icon" :title="conf.empty" :message="conf.msg" />

    <template v-if="kind === 'disliked'">
      <SongRow v-for="s in songs" :key="s.id" :song="s" hide-more @play="useToast().show('Tap Undo to bring this song back')" @more="() => {}">
        <template #trailing>
          <button class="btn btn-text" @click.stop="player.undislike(s)" @pointerdown.stop>Undo</button>
        </template>
      </SongRow>
    </template>
    <template v-else>
      <SongRow
        v-for="(s, i) in songs"
        :key="s.id"
        :song="s"
        @play="player.play(playable, i)"
        @more="ui.openSongMenu(s)"
      />
    </template>

    <Sheet :open="confirmRestore" :title="`Restore all ${songs.length} songs?`" @close="confirmRestore = false">
      <p class="body muted conf pad">They'll show up again in search, home and radio.</p>
      <div class="row pad end gap-8">
        <button class="btn btn-text" @click="confirmRestore = false">Cancel</button>
        <button class="btn btn-primary" @click="lib.restoreAllDisliked(); confirmRestore = false">Restore all</button>
      </div>
    </Sheet>
  </div>
</template>

<style scoped>
.conf { margin: 0 0 16px; }
.end { justify-content: flex-end; padding-bottom: 16px; }
</style>
