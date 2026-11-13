<script setup lang="ts">
const ui = useUi()
const lib = useLibrary()
const toast = useToast()
const creating = ref(false)
const name = ref('')
const song = computed(() => ui.addToPlaylist.value)

function close() { ui.addToPlaylist.value = null; creating.value = false; name.value = '' }
async function add(id: number, label: string) {
  if (!song.value) return
  await lib.addToPlaylist(id, song.value)
  toast.show(`Added to ${label}`)
  close()
}
async function create() {
  const n = name.value.trim()
  if (!n) return
  const id = await lib.createPlaylist(n)
  await add(id, n)
}
</script>

<template>
  <Sheet :open="!!song" :title="creating ? 'New playlist' : 'Add to playlist'" @close="close">
    <form v-if="creating" class="form" @submit.prevent="create">
      <input v-model="name" class="input" placeholder="Playlist name" autofocus maxlength="80">
      <div class="row gap-8 end">
        <button type="button" class="btn btn-text" @click="creating = false">Cancel</button>
        <button type="submit" class="btn btn-primary" :disabled="!name.trim()">Create</button>
      </div>
    </form>
    <div v-else class="list">
      <button class="pl" @click="creating = true">
        <span class="new"><Icon name="add" /></span>
        <span class="title">New playlist</span>
      </button>
      <button v-for="p in lib.playlists.value" :key="p.id" class="pl" @click="add(p.id, p.name)">
        <Artwork :src="p.cover" :size="48" />
        <span class="col">
          <span class="title ellipsis">{{ p.name }}</span>
          <span class="small muted">{{ p.count }} songs</span>
        </span>
      </button>
    </div>
  </Sheet>
</template>

<style scoped>
.list { padding: 0 8px 12px; }
.pl { display: flex; align-items: center; gap: 14px; width: 100%; padding: 8px 12px; border-radius: 10px; text-align: left; }
.pl:hover { background: rgba(255, 255, 255, .05); }
.new { width: 48px; height: 48px; border-radius: 6px; background: var(--accent); color: var(--on-accent); display: grid; place-items: center; }
.form { padding: 8px 20px 16px; display: flex; flex-direction: column; gap: 16px; }
.end { justify-content: flex-end; }
</style>
