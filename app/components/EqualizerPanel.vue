<script setup lang="ts">
import { BAND_FREQS, BUILT_IN_PRESETS, CUSTOM, MAX_TEMPO, MIN_TEMPO, bandLabel } from '~/utils/fx'
import type { EqPreset } from '~/utils/fx'

/**
 * Poweramp-inspired audio screen. Equalizer tab: preamp + 10-band EQ, response curve over a live
 * spectrum, presets, Equ / Tone / Limit and bass / treble. Effects tab: balance, stereo expand,
 * tempo, mono and volume.
 */
const ui = useUi()
const fx = useAudioFx()
const player = usePlayer()
const s = computed(() => fx.settings.value)
const tab = ref<'eq' | 'fx'>('eq')
const presetsOpen = ref(false)

const fmt = (v: number, d = 1) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d)
const viaYouTube = computed(() => player.engine.value === 'youtube')

function close() { ui.eqOpen.value = false }
// Tapping the mini player opens the full player: get out of its way.
watch(player.nowPlayingOpen, (open) => { if (open) close() })
function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && ui.eqOpen.value && !presetsOpen.value) close() }
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

function pick(p: EqPreset) { fx.applyPreset(p); presetsOpen.value = false }
function save() {
  const n = s.value.presetName
  ui.nameDialog.value = {
    title: 'Save preset',
    initial: n !== CUSTOM && !BUILT_IN_PRESETS.some(p => p.name === n) ? n : '',
    placeholder: 'My preset',
    confirm: 'Save',
    onConfirm: name => fx.savePreset(name),
  }
}

// Tempo knob is bipolar around 1.00x: left half 0.5–1.0x, right half 1.0–2.0x.
const tempoKnob = computed(() => (s.value.tempo <= 1 ? s.value.tempo - 0.5 : 0.5 + (s.value.tempo - 1) / 2))
function setTempoKnob(v: number) {
  let t = v <= 0.5 ? 0.5 + v : 1 + (v - 0.5) * 2
  t = Math.round(t * 100) / 100
  fx.update({ tempo: Math.abs(t - 1) < 0.03 ? 1 : t })
}
function stepTempo(dir: number) {
  fx.update({ tempo: Math.max(MIN_TEMPO, Math.min(MAX_TEMPO, (Math.round(s.value.tempo * 20) + dir) / 20)) })
}
function setBalance(v: number) {
  const b = v * 2 - 1
  fx.update({ balance: Math.abs(b) < 0.02 ? 0 : Math.round(b * 100) / 100 })
}
</script>

<template>
  <Teleport to="body">
    <Transition name="eq">
      <div v-if="ui.eqOpen.value" class="eq" role="dialog" aria-modal="true" aria-label="Equalizer">
        <div class="inner">
          <header class="top">
            <button class="icon-btn" aria-label="Back" @click="close"><Icon name="back" /></button>
            <button class="tab" :class="{ on: tab === 'eq' }" @click="tab = 'eq'"><Icon name="equalizer" :size="20" />Equalizer</button>
            <button class="tab" :class="{ on: tab === 'fx' }" @click="tab = 'fx'"><Icon name="tune" :size="20" />Effects</button>
          </header>

          <p v-if="viaYouTube" class="note small">
            This song is playing through YouTube's own player, so only tempo applies. EQ and effects work on Sonora's stream and downloads.
          </p>

          <div class="scroll">
            <!-- ======================= Equalizer -->
            <section v-if="tab === 'eq'" class="col gap-12">
              <div class="faders">
                <div class="pre panel">
                  <FxSlider label="Preamp" :value="s.preamp" :disabled="!s.eqEnabled" @change="fx.setPreamp" />
                  <b>Preamp</b><span>{{ fmt(s.preamp) }}</span>
                </div>
                <div class="bands panel">
                  <div v-for="(hz, i) in BAND_FREQS" :key="hz" class="band">
                    <FxSlider :label="`${bandLabel(hz)} Hz`" :value="s.bands[i] ?? 0" :disabled="!s.eqEnabled" @change="v => fx.setBand(i, v)" />
                    <b>{{ bandLabel(hz) }}</b><span :class="{ dim: Math.abs(s.bands[i] ?? 0) < 0.05 }">{{ fmt(s.bands[i] ?? 0) }}</span>
                  </div>
                </div>
              </div>

              <div class="graph panel"><FxGraph :settings="s" /></div>

              <button class="preset" @click="presetsOpen = true">
                <Icon name="info" :size="18" />{{ s.presetName.toUpperCase() }}
              </button>

              <div class="lower">
                <div class="col gap-8 toggles">
                  <button class="pill" :class="{ on: s.eqEnabled }" @click="fx.update({ eqEnabled: !s.eqEnabled })">Equ</button>
                  <button class="pill" :class="{ on: s.toneEnabled }" @click="fx.update({ toneEnabled: !s.toneEnabled })">Tone</button>
                  <button class="pill" :class="{ on: s.limiterEnabled }" @click="fx.update({ limiterEnabled: !s.limiterEnabled })">Limit</button>
                </div>
                <div class="col grow gap-12">
                  <div class="row gap-8">
                    <button class="pill outline grow" @click="presetsOpen = true">Presets</button>
                    <button class="pill filled grow" @click="save">Save</button>
                    <button class="pill outline grow" @click="fx.resetEq()">Reset</button>
                  </div>
                  <div class="row knobs">
                    <div class="kn">
                      <b>Bass</b><span>{{ Math.round(s.bass * 100) }}%</span>
                      <FxKnob label="Bass" :size="96" :value="s.bass" :value-text="`${Math.round(s.bass * 100)}%`"
                        :class="{ dimmed: !s.toneEnabled }" @change="v => fx.update({ bass: v, toneEnabled: true })" />
                    </div>
                    <div class="kn">
                      <b>Treble</b><span>{{ Math.round(s.treble * 100) }}%</span>
                      <FxKnob label="Treble" :size="96" :value="s.treble" :value-text="`${Math.round(s.treble * 100)}%`"
                        :class="{ dimmed: !s.toneEnabled }" @change="v => fx.update({ treble: v, toneEnabled: true })" />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <!-- ======================= Effects -->
            <section v-else class="col fxtab">
              <div class="row knobs2">
                <div class="kn">
                  <FxKnob label="Balance" :size="132" bipolar color="#5eead4" :value="(s.balance + 1) / 2" :value-text="fmt(s.balance, 2)" @change="setBalance" />
                  <b>Balance</b><span>{{ fmt(s.balance, 2) }}</span>
                </div>
                <div class="kn" :class="{ dimmed: s.mono }">
                  <FxKnob label="Stereo Expand" :size="132" :value="s.stereoExpand" :disabled="s.mono" :value-text="`${Math.round(s.stereoExpand * 100)}%`" @change="v => fx.update({ stereoExpand: v })" />
                  <b>Stereo Expand</b><span>{{ Math.round(s.stereoExpand * 100) }}%</span>
                </div>
              </div>

              <div class="tempo">
                <span class="pill filled static">Tempo</span>
                <div class="kn center">
                  <FxKnob label="Tempo" :size="132" bipolar color="#60a5fa" :value="tempoKnob" :value-text="`${fmt(s.tempo, 2)}x`" @change="setTempoKnob" />
                  <b>{{ fmt(s.tempo, 2) }}x</b>
                </div>
                <div class="col gap-8 steps">
                  <button class="step" aria-label="Faster" @click="stepTempo(1)"><Icon name="add" :size="20" /></button>
                  <button class="step" aria-label="Slower" @click="stepTempo(-1)"><Icon name="minus" :size="20" /></button>
                </div>
              </div>

              <div class="row between">
                <button class="pill" :class="{ on: s.mono }" @click="fx.update({ mono: !s.mono })">Mono</button>
                <button class="pill outline" @click="fx.resetEffects()">Reset</button>
              </div>

              <div class="kn center">
                <FxKnob label="Volume" :size="176" color="#60a5fa" :value="player.volume.value" :value-text="`${Math.round(player.volume.value * 100)}%`" :reset-to="1" @change="v => player.setVolume(Math.round(v * 100) / 100)" />
                <b>Volume</b><span>{{ Math.round(player.volume.value * 100) }}%</span>
              </div>
            </section>
          </div>

          <MiniPlayer v-if="player.current.value" class="mini" />
        </div>

        <Sheet :open="presetsOpen" title="Presets" @close="presetsOpen = false">
          <div class="plist">
            <template v-if="fx.customPresets.value.length">
              <p class="label muted sect">Your presets</p>
              <div v-for="p in fx.customPresets.value" :key="'c' + p.name" class="prow" :class="{ on: p.name === s.presetName }" @click="pick(p)">
                <PresetThumb :preset="p" :active="p.name === s.presetName" />
                <span class="grow ellipsis">{{ p.name }}</span>
                <Icon v-if="p.name === s.presetName" name="check" class="accent" />
                <button class="icon-btn" aria-label="Delete preset" @click.stop="fx.deletePreset(p.name)"><Icon name="delete" :size="20" /></button>
              </div>
              <p class="label muted sect">Built-in</p>
            </template>
            <div v-for="p in BUILT_IN_PRESETS" :key="'b' + p.name" class="prow" :class="{ on: p.name === s.presetName }" @click="pick(p)">
              <PresetThumb :preset="p" :active="p.name === s.presetName" />
              <span class="grow ellipsis">{{ p.name }}</span>
              <Icon v-if="p.name === s.presetName" name="check" class="accent" />
            </div>
          </div>
        </Sheet>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.eq { position: fixed; inset: 0; z-index: 80; background: var(--bg); color: var(--on-bg); }
.inner {
  height: 100%; max-width: 760px; margin: 0 auto; display: flex; flex-direction: column;
  padding: calc(var(--safe-t) + 8px) 12px calc(var(--safe-b) + 8px);
}
.top {
  display: flex; align-items: center; gap: 4px; padding: 4px; border-radius: 999px; background: var(--surface-3);
}
.tab {
  flex: 1; height: 42px; border-radius: 999px; display: flex; align-items: center; justify-content: center; gap: 8px;
  font-weight: 600; font-size: 14px; color: var(--muted); transition: background .2s, color .2s;
}
.tab.on { background: var(--accent); color: var(--on-accent); }
.note { margin: 10px 4px 0; padding: 10px 14px; border-radius: 14px; background: var(--surface-2); color: var(--muted); }
.scroll { flex: 1; overflow-y: auto; overscroll-behavior: contain; padding: 12px 0 8px; scrollbar-width: none; }
.scroll::-webkit-scrollbar { display: none; }
.panel { border-radius: 22px; background: var(--surface-1); }

.faders { display: flex; gap: 8px; height: min(46dvh, 340px); min-height: 250px; }
.pre { width: 64px; background: var(--surface-3); }
.bands { flex: 1; display: flex; padding: 0 2px; }
.pre, .band { display: flex; flex-direction: column; align-items: center; padding: 10px 0; min-width: 0; }
.band { flex: 1; }
.pre > :first-child, .band > :first-child { flex: 1; min-height: 0; }
.pre b, .band b { font-size: 12px; margin-top: 6px; white-space: nowrap; }
.pre span, .band span { font-size: 11px; color: var(--on-bg); font-variant-numeric: tabular-nums; }
.band span.dim { color: var(--muted); }

.graph { height: 88px; padding: 6px 8px; }
.preset {
  align-self: center; display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 999px;
  background: var(--surface-3); font-weight: 600; font-size: 13px; letter-spacing: .5px; color: var(--on-bg);
}
.preset :deep(svg) { color: var(--muted); }

.lower { display: flex; gap: 12px; margin-top: 4px; }
.toggles .pill { width: 92px; }
.pill {
  height: 42px; padding: 0 16px; border-radius: 999px; font-weight: 600; font-size: 14px;
  border: 1.5px solid var(--outline); color: var(--on-bg); transition: background .15s, color .15s, border-color .15s;
}
.pill.on { background: var(--accent-soft); border-color: transparent; color: var(--accent); }
.pill.filled { background: var(--surface-4); border-color: transparent; }
.pill.static { display: inline-flex; align-items: center; cursor: default; }
.pill:active { transform: scale(.97); }
.knobs { justify-content: space-evenly; }
.kn { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.kn b { font-size: 14px; font-weight: 700; }
.kn span { font-size: 12.5px; color: var(--muted); font-variant-numeric: tabular-nums; }
.kn.center { align-self: center; }
.dimmed { opacity: .5; }

.fxtab { gap: 20px; padding-top: 8px; }
.knobs2 { justify-content: space-evenly; }
.knobs2 .kn b { margin-top: 6px; }
.tempo { position: relative; display: flex; justify-content: center; align-items: center; min-height: 160px; }
.tempo > .pill { position: absolute; left: 0; top: 0; }
.tempo .steps { position: absolute; right: 0; top: 50%; transform: translateY(-50%); }
.step { width: 64px; height: 40px; border-radius: 999px; border: 1.5px solid var(--outline); display: grid; place-items: center; }
.step:active { transform: scale(.95); }
.between { justify-content: space-between; }
.between .pill { width: 96px; }

.mini { margin-top: 8px; }

.plist { padding: 0 8px 12px; }
.sect { padding: 12px 12px 4px; margin: 0; }
.prow { display: flex; align-items: center; gap: 14px; padding: 8px 12px; border-radius: 12px; cursor: pointer; }
.prow:hover { background: var(--surface-3); }
.prow.on span { color: var(--accent); font-weight: 700; }

.eq-enter-active, .eq-leave-active { transition: transform .32s var(--ease), opacity .2s; }
.eq-enter-from, .eq-leave-to { transform: translateY(100%); opacity: .6; }
@media (min-width: 900px) {
  .inner { padding-top: 24px; }
}
</style>
