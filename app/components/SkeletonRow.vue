<template>
  <div class="sk pad">
    <div class="skeleton thumb" />
    <div class="col grow gap-8">
      <div class="skeleton" style="width: 60%; height: 14px" />
      <div class="skeleton" style="width: 35%; height: 12px" />
    </div>
  </div>
</template>

<style scoped>
.sk { display: flex; align-items: center; gap: 12px; height: 64px; }
.thumb { width: 48px; height: 48px; flex-shrink: 0; }
</style>
