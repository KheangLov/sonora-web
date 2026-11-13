<script setup lang="ts">
const ui = useUi()
const player = usePlayer()
const options = [5, 15, 30, 45, 60, 90]
const left = computed(() => player.sleepAt.value ? Math.max(1, Math.ceil((player.sleepAt.value - Date.now()) / 60_000)) : 0)
function set(m: number) { player.setSleepTimer(m); ui.sleepOpen.value = false; if (m) useToast().show(`Music stops in ${m} min`) }
</script>

<template>
  <Sheet :open="ui.sleepOpen.value" title="Sleep timer" @close="ui.sleepOpen.value = false">
    <p v-if="player.sleepAt.value" class="accent title on">Music stops in about {{ left }} min</p>
    <div class="list">
      <button v-for="m in options" :key="m" class="opt" @click="set(m)">{{ m }} minutes</button>
      <button v-if="player.sleepAt.value" class="opt off" @click="set(0)">Turn off timer</button>
    </div>
  </Sheet>
</template>

<style scoped>
.on { padding: 0 24px 8px; margin: 0; }
.list { padding-bottom: 12px; }
.opt { display: block; width: 100%; text-align: left; padding: 14px 24px; font-size: 16px; }
.opt:hover { background: rgba(255, 255, 255, .05); }
.off { color: var(--error); }
</style>
