/**
 * Memantau preferensi `prefers-reduced-motion` pengguna.
 * Dipakai chart ECharts agar animasi data bisa dimatikan tanpa
 * menghilangkan informasi (opacity/warna tetap ada).
 */
export function useReducedMotion() {
  const prefersReducedMotion = ref(false)
  let mediaQuery: MediaQueryList | null = null

  function update() {
    prefersReducedMotion.value = mediaQuery?.matches ?? false
  }

  onMounted(() => {
    mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    update()
    mediaQuery.addEventListener('change', update)
  })

  onUnmounted(() => {
    mediaQuery?.removeEventListener('change', update)
  })

  return prefersReducedMotion
}
