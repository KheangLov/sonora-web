/** Start the player, restore your queue, and wire keyboard shortcuts. */
export default defineNuxtPlugin(() => {
  const player = usePlayer()
  useLibrary()
  player.start()

  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement
    if (t.closest('input, textarea, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return
    switch (e.key) {
      case ' ': case 'k': e.preventDefault(); player.togglePlay(); break
      case 'ArrowRight': if (e.shiftKey) player.next(); else player.seek(player.position.value + 5); break
      case 'ArrowLeft': if (e.shiftKey) player.previous(); else player.seek(player.position.value - 5); break
      case 'n': player.next(); break
      case 'p': player.previous(); break
      case 'l': { const s = player.current.value; if (s) useLibrary().setLiked(s, !useLibrary().isLiked(s.id)); break }
      case 's': player.toggleShuffle(); break
      case 'r': player.cycleRepeat(); break
      case 'm': player.toggleMute(); break
      case 'Escape': player.nowPlayingOpen.value = false; break
    }
  })
})
