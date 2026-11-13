<script setup lang="ts">
import type { HomeSection, Song } from '#shared/types/music'

/** Any YouTube Music album, playlist, artist or mix, opened inside Sonora. */
const route = useRoute()
const player = usePlayer()
const lib = useLibrary()
const ui = useUi()
const dl = useDownloads()
const toast = useToast()

const id = computed(() => String(route.params.id))
const q = computed(() => route.query as Record<string, string>)
const data = shallowRef<{ title: string, subtitle: string, thumbnail: string, songs: Song[], sections: HomeSection[] } | null>(null)
const failed = ref(false)

async function load() {
  failed.value = false
  data.value = null
  try {
    data.value = await api.collection({ id: id.value, ...(q.value.queue ? { queue: '1' } : {}), title: q.value.title ?? '', subtitle: q.value.subtitle ?? '', thumbnail: q.value.thumbnail ?? '' })
  }
  catch { failed.value = true }
}
watch(id, load, { immediate: true })

const title = computed(() => data.value?.title || q.value.title || 'Loading…')
const thumb = computed(() => data.value?.thumbnail || q.value.thumbnail)
const accent = useArtColor(thumb)
const songs = computed(() => data.value ? lib.visible(data.value.songs) : [])
const sections = computed(() => data.value ? filterSections(data.value.sections, lib.dislikedIds.value) : [])
const total = computed(() => songs.value.reduce((a, s) => a + (s.duration || 0), 0))
const subtitle = computed(() => data.value
  ? `${songs.value.length} songs${total.value ? ` • ${formatTotal(total.value)}` : ''}`
  : q.value.subtitle)

async function save() {
  const pid = await lib.createPlaylist(title.value)
  for (const s of songs.value) await lib.addToPlaylist(pid, s)
  toast.show(`Saved “${title.value}” to your library`)
}
useHead({ title: () => `${title.value} • Sonora` })
</script>

<template>
  <div class="page">
    <CollectionHeader
      :title="title"
      :subtitle="subtitle"
      :cover="thumb"
      :round="id.startsWith('UC')"
      :gradient="[accent, accent]"
      :can-play="songs.length > 0"
      @play="player.play(songs)"
      @shuffle="player.play(songs, 0, true)"
    >
      <template #actions>
        <button class="icon-btn" aria-label="Save to library" :disabled="!songs.length" @click="save"><Icon name="libraryAdd" /></button>
        <button class="icon-btn" aria-label="Download all" :disabled="!songs.length" @click="dl.downloadAll(songs)"><Icon name="download" /></button>
      </template>
    </CollectionHeader>

    <template v-if="!data && !failed"><SkeletonRow v-for="i in 10" :key="i" /></template>
    <EmptyState v-else-if="failed || (data && !songs.length && !sections.length)" title="Couldn't load this" message="Check your connection and try again.">
      <button class="btn btn-primary" @click="load">Retry</button>
    </EmptyState>
    <SongRow v-for="(s, i) in songs" :key="s.id" :song="s" @play="player.play(songs, i)" @more="ui.openSongMenu(s)" />

    <section v-for="sec in sections" :key="sec.title">
      <SectionHeader :title="sec.title" :subtitle="sec.subtitle" />
      <div class="hscroll pad">
        <CollectionCard v-for="c in sec.collections" :key="c.id" :c="c" />
        <SongCard v-for="(s, i) in sec.songs" :key="s.id" :song="s" @play="player.play(sec.songs, i)" @more="ui.openSongMenu(s)" />
      </div>
    </section>
  </div>
</template>
