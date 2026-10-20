// Canvas ECharts tidak mewarisi warna CSS, jadi palet teks/permukaan
// disamakan manual dengan token netral Nuxt UI untuk light & dark mode.
export interface ChartPalette {
  text: string
  muted: string
  axis: string
  splitLine: string
  pointer: string
  chip: string
  tooltipBg: string
  tooltipBorder: string
  bg: string
}

export function useChartPalette() {
  const colorMode = useColorMode()
  const isDark = computed(() => colorMode.value === 'dark')

  return computed<ChartPalette>(() => isDark.value
    ? {
        text: '#fafafa',
        muted: '#a3a3a3',
        axis: 'rgba(255, 255, 255, 0.16)',
        splitLine: 'rgba(255, 255, 255, 0.08)',
        pointer: 'rgba(255, 255, 255, 0.06)',
        chip: 'rgba(255, 255, 255, 0.10)',
        tooltipBg: '#171717',
        tooltipBorder: 'rgba(255, 255, 255, 0.12)',
        bg: '#171717'
      }
    : {
        text: '#171717',
        muted: '#737373',
        axis: 'rgba(0, 0, 0, 0.14)',
        splitLine: 'rgba(0, 0, 0, 0.06)',
        pointer: 'rgba(0, 0, 0, 0.04)',
        chip: 'rgba(0, 0, 0, 0.06)',
        tooltipBg: '#ffffff',
        tooltipBorder: 'rgba(0, 0, 0, 0.08)',
        bg: '#ffffff'
      })
}
