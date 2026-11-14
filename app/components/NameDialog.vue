<script setup lang="ts">
const ui = useUi()
const name = ref('')
const d = computed(() => ui.nameDialog.value)
watch(d, (v) => { name.value = v?.initial ?? '' })
function close() { ui.nameDialog.value = null }
function submit() {
  const n = name.value.trim()
  if (!n || !d.value) return
  d.value.onConfirm(n)
  close()
}
</script>

<template>
  <Sheet :open="!!d" :title="d?.title" @close="close">
    <form class="form" @submit.prevent="submit">
      <input v-model="name" class="input" :placeholder="d?.placeholder ?? 'Playlist name'" autofocus maxlength="80">
      <div class="row gap-8 end">
        <button type="button" class="btn btn-text" @click="close">Cancel</button>
        <button type="submit" class="btn btn-primary" :disabled="!name.trim()">{{ d?.confirm }}</button>
      </div>
    </form>
  </Sheet>
</template>

<style scoped>
.form { padding: 8px 20px 16px; display: flex; flex-direction: column; gap: 16px; }
.end { justify-content: flex-end; }
</style>
