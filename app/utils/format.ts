export function formatDuration(sec: number): string {
  const t = Math.max(0, Math.floor(sec))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

export function formatTotal(sec: number): string {
  const m = Math.round(sec / 60)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} hr ${m % 60} min`
}

/** Region for charts/home, from the browser (Cambodia by default). */
export function region(): string {
  try {
    if (Intl.DateTimeFormat().resolvedOptions().timeZone === 'Asia/Phnom_Penh') return 'KH'
    const r = new Intl.Locale(navigator.language).maximize().region
    return r && /^[A-Z]{2}$/.test(r) ? r : 'KH'
  }
  catch { return 'KH' }
}
