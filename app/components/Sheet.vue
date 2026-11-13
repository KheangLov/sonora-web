<script setup lang="ts">
/**
 * Bottom sheet on phones, centered dialog on desktop. Drag the handle (or anywhere on the
 * header) down to dismiss. Escape and back-gesture close it too.
 */
const props = withDefaults(defineProps<{ open: boolean, tall?: boolean, title?: string, tint?: string }>(), { tall: false })
const emit = defineEmits<{ close: [] }>()

const panel = ref<HTMLElement | null>(null)
const dragY = ref(0)
let startY = 0
let dragging = false

function onDown(e: PointerEvent) {
  dragging = true
  startY = e.clientY
  ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
}
function onMove(e: PointerEvent) {
  if (!dragging) return
  dragY.value = Math.max(0, e.clientY - startY)
}
function onUp() {
  if (!dragging) return
  dragging = false
  if (dragY.value > 120) emit('close')
  dragY.value = 0
}
function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && props.open) emit('close') }
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div v-if="open" class="scrim" @click.self="emit('close')">
        <div
          ref="panel"
          class="panel"
          :class="{ tall }"
          :style="{ transform: dragY ? `translateY(${dragY}px)` : undefined, transition: dragY ? 'none' : undefined, background: tint }"
          role="dialog"
          aria-modal="true"
        >
          <div class="grab" @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp">
            <span class="handle" />
            <div v-if="title || $slots.header" class="head">
              <slot name="header"><h3 class="h3">{{ title }}</h3></slot>
            </div>
          </div>
          <div class="content"><slot /></div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.scrim {
  position: fixed; inset: 0; z-index: 100; background: rgba(0, 0, 0, .55);
  display: flex; align-items: flex-end; justify-content: center;
}
.panel {
  width: 100%; max-height: 88dvh; background: var(--surface-2); border-radius: 22px 22px 0 0;
  display: flex; flex-direction: column; padding-bottom: var(--safe-b);
  transition: transform .3s var(--ease); will-change: transform;
}
.panel.tall { height: 88dvh; }
.grab { touch-action: none; cursor: grab; padding-top: 10px; }
.handle { display: block; width: 36px; height: 4px; border-radius: 4px; background: var(--outline); margin: 0 auto 8px; }
.head { padding: 4px 20px 8px; }
.content { overflow-y: auto; overscroll-behavior: contain; flex: 1; }
@media (min-width: 900px) {
  .scrim { align-items: center; }
  .panel { width: 480px; max-height: 80vh; border-radius: 20px; padding-bottom: 8px; }
  .panel.tall { width: 640px; height: 80vh; }
}
.sheet-enter-active, .sheet-leave-active { transition: opacity .25s; }
.sheet-enter-active .panel, .sheet-leave-active .panel { transition: transform .3s var(--ease); }
.sheet-enter-from, .sheet-leave-to { opacity: 0; }
.sheet-enter-from .panel, .sheet-leave-to .panel { transform: translateY(100%); }
@media (min-width: 900px) {
  .sheet-enter-from .panel, .sheet-leave-to .panel { transform: translateY(24px) scale(.97); }
}
</style>
