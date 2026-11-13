<script setup lang="ts">
const route = useRoute()
const player = usePlayer()
const lib = useLibrary()
const ui = useUi()
const dl = useDownloads()

const id = computed(() => Number(route.params.id))
const meta = computed(() => lib.playlists.value.find(p => p.id === id.value))
const songs = computed(() => lib.playlistTracks(id.value))
const total = computed(() => songs.value.reduce((a, s) => a + (s.duration || 0), 0))

function rename() {
  if (!meta.value) return
  ui.nameDialog.value = { title: 'Rename playlist', initial: meta.value.name, confirm: 'Save', onConfirm: n => lib.renamePlaylist(id.value, n) }
}
useHead({ title: () => `${meta.value?.name ?? 'Playlist'} • Sonora` })
</script>

<template>
  <div class="page">
    <CollectionHeader
      :title="meta?.name ?? 'Playlist'"
      :subtitle="`${songs.length} songs${total ? ` • ${formatTotal(total)}` : ''}`"
      icon="library"
      :cover="songs[0]?.thumbnail"
      :gradient="['#2b2b33', '#4a4a57']"
      :can-play="songs.length > 0"
      @play="player.play(songs)"
      @shuffle="player.play(songs, 0, true)"
    >
      <template #actions>
        <button class="icon-btn" aria-label="Download all" :disabled="!songs.length" @click="dl.downloadAll(songs)"><Icon name="download" /></button>
        <button class="icon-btn" aria-label="Rename" @click="rename"><Icon name="edit" /></button>
      </template>
    </CollectionHeader>
    <EmptyState v-if="lib.ready.value && !songs.length" icon="library" title="This playlist is empty" message="Tap ⋮ on any song and choose “Add to playlist”." />
    <SongRow v-for="(s, i) in songs" :key="s.id" :song="s" @play="player.play(songs, i)" @more="ui.openSongMenu(s, id)" />
  </div>
</template>
