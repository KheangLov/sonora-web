<script setup lang="ts">
const route = useRoute()
const tabs = [
  { to: '/', label: 'Home', icon: 'home', iconOff: 'homeOutline' },
  { to: '/search', label: 'Search', icon: 'search', iconOff: 'search' },
  { to: '/library', label: 'Library', icon: 'library', iconOff: 'libraryOutline' },
]
const isActive = (to: string) => to === '/' ? route.path === '/' : route.path.startsWith(to)
  || (to === '/library' && /^\/(collection|playlist)/.test(route.path))
</script>

<template>
  <nav class="nav" aria-label="Main">
    <NuxtLink v-for="t in tabs" :key="t.to" :to="t.to" class="tab" :class="{ on: isActive(t.to) }" :aria-label="t.label">
      <Icon :name="isActive(t.to) ? t.icon : t.iconOff" :size="26" />
      <span class="small">{{ t.label }}</span>
    </NuxtLink>
  </nav>
</template>

<style scoped>
.nav {
  margin: 8px 8px 0; height: 64px; border-radius: 22px; display: flex; background: rgba(28, 28, 33, .92);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid var(--outline-soft);
}
.tab { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; color: var(--muted); transition: color .15s; }
.tab .small { font-size: 11px; font-weight: 600; }
.tab.on { color: var(--on-bg); }
.tab:active :deep(svg) { transform: scale(.9); }
</style>
