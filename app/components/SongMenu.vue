<script setup lang="ts">
/** The "⋮" actions for any song, opened from anywhere via useUi().openSongMenu(). */
const ui = useUi()
const player = usePlayer()
const lib = useLibrary()
const dl = useDownloads()
const toast = useToast()

const entry = computed(() => ui.songMenu.value)
const song = computed(() => entry.value?.song)
const liked = computed(() => !!song.value && lib.isLiked(song.value.id))
const disliked = computed(() => !!song.value && lib.isDisliked(song.value.id))
const downloaded = computed(() => !!song.value && lib.isDownloaded(song.value.id))
const downloading = computed(() => !!song.value && dl.isDownloading(song.value.id))

function close() { ui.songMenu.value = null }
function act(fn: () => unknown) { fn(); close() }
</script>

<template>
  <Sheet :open="!!entry" @close="close">
    <template v-if="song" #header>
      <div class="row gap-12">
        <Artwork :src="song.thumbnail" :size="56" />
        <div class="col grow">
          <span class="title clamp2">{{ song.title }}</span>
          <span class="body muted ellipsis">{{ song.artist }}</span>
        </div>
      </div>
    </template>
    <div v-if="song" class="list">
      <SheetAction icon="playNext" label="Play next" @click="act(() => player.playNext(song!))" />
      <SheetAction icon="addQueue" label="Add to queue" @click="act(() => player.addToQueue(song!))" />
      <SheetAction icon="radio" label="Start radio" @click="act(() => player.playRadio(song!))" />
      <SheetAction
        :icon="liked ? 'heart' : 'heartOutline'"
        :label="liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'"
        :tint="liked ? 'var(--accent)' : undefined"
        @click="act(() => lib.setLiked(song!, !liked))"
      />
      <SheetAction
        :icon="disliked ? 'thumbDown' : 'thumbDownOutline'"
        :label="disliked ? 'Remove dislike' : 'Dislike — hide this song'"
        :tint="disliked ? 'var(--error)' : undefined"
        @click="act(() => disliked ? player.undislike(song!) : player.dislike(song!))"
      />
      <SheetAction v-if="downloaded" icon="downloaded" label="Remove download" tint="var(--accent)" @click="act(() => { dl.remove(song!.id); toast.show('Removed download') })" />
      <SheetAction v-else-if="downloading" icon="download" :label="`Downloading ${dl.progress.get(song.id) ?? 0}% — tap to cancel`" @click="act(() => dl.remove(song!.id))" />
      <SheetAction v-else icon="download" :label="dl.failed.has(song.id) ? 'Retry download' : 'Download'" @click="act(() => { dl.download(song!); toast.show('Downloading…') })" />
      <SheetAction icon="playlistAdd" label="Add to playlist" @click="act(() => { ui.addToPlaylist.value = song! })" />
      <SheetAction
        v-if="entry?.playlistId != null"
        icon="remove"
        label="Remove from this playlist"
        @click="act(() => lib.removeFromPlaylist(entry!.playlistId!, song!.id))"
      />
      <SheetAction icon="share" label="Share" @click="act(() => shareSong(song!))" />
    </div>
  </Sheet>
</template>

<style scoped>
.list { padding-bottom: 12px; border-top: 1px solid var(--outline-soft); padding-top: 6px; }
</style>
