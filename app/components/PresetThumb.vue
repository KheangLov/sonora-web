<script setup lang="ts">
import { DEFAULT_FX, MAX_DB, fxResponse, logFreqs } from '~/utils/fx'
import type { EqPreset } from '~/utils/fx'

/** Tiny curve preview for the preset list. */
const props = defineProps<{ preset: EqPreset, active?: boolean }>()
const FREQS = logFreqs(48)
const d = computed(() => {
  const curve = fxResponse({ ...DEFAULT_FX, bands: props.preset.bands, preamp: props.preset.preamp, toneEnabled: false }, FREQS)
  return curve.map((db, i) => `${i ? 'L' : 'M'} ${(i / (FREQS.length - 1) * 64).toFixed(1)} ${(18 - Math.max(-MAX_DB, Math.min(MAX_DB, db)) / MAX_DB * 16).toFixed(1)}`).join(' ')
})
</script>

<template>
  <svg class="thumb" viewBox="0 0 64 36" width="64" height="36" aria-hidden="true">
    <line x1="0" y1="18" x2="64" y2="18" stroke="rgba(255,255,255,.1)" stroke-width="1" />
    <path :d="d" fill="none" :stroke="active ? 'var(--accent)' : 'rgba(255,255,255,.7)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</template>

<style scoped>
.thumb { flex-shrink: 0; border-radius: 8px; background: var(--surface-4); padding: 4px; box-sizing: content-box; }
</style>
