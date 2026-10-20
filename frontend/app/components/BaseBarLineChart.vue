<script setup lang="ts">
import { computed } from 'vue'
import type {
  BarSeriesOption,
  EChartsOption,
  LineSeriesOption,
  YAxisComponentOption
} from 'echarts'
import { BarChart, LineChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  TooltipComponent
} from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import type { ChartPalette } from '~/composables/useChartPalette'
import type { BarAnnotation, BarLineChartSeries, ChartYAxis } from '~/types/charts'

use([
  BarChart,
  LineChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer
])

const props = withDefaults(
  defineProps<{
    categories: string[]
    series: BarLineChartSeries[]
    yAxes: [ChartYAxis] | [ChartYAxis, ChartYAxis]
    height?: number
    /**
     * Tampilkan label nilai di atas bar / titik line.
     * Detail lengkap tetap tersedia di tooltip dan judul sumbu.
     */
    showLabels?: boolean
    /**
     * Anotasi vertikal di dalam tiap batang (mis. model printer + printhead ID).
     * Bila diisi: label sumbu X disembunyikan dan label nilai diganti anotasi;
     * angka lengkap tetap tersedia lewat tooltip.
     */
    barAnnotations?: BarAnnotation[]
  }>(),
  {
    height: 320,
    showLabels: true,
    barAnnotations: undefined
  }
)

const hasAnnotations = computed(() => (props.barAnnotations?.length ?? 0) > 0)

// Fungsi untuk meringkas angka menjadi K, M, atau B
function formatCompactNumber(value: number): string {
  if (value === 0) return '0'

  const absValue = Math.abs(value)
  if (absValue >= 1e9) {
    return (value / 1e9).toFixed(1).replace(/\.0$/, '') + 'B'
  }
  if (absValue >= 1e6) {
    return (value / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
  }
  if (absValue >= 1e3) {
    return (value / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'
  }

  return value.toString()
}

// Tooltip memakai angka lengkap agar detail datanya tidak hilang: 1,234,567.8
const fullNumberFormat = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1
})

const palette = useChartPalette()

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '\'': '&#39;'
}

// Nama kategori berasal dari API, jadi selalu di-escape sebelum masuk HTML tooltip.
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => HTML_ESCAPES[char] ?? char)
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (Array.isArray(value)) {
    return toNumber(value[value.length - 1])
  }

  return null
}

type TooltipItem = {
  axisValueLabel?: string
  seriesName?: string
  seriesIndex: number
  value?: unknown
  color?: string
}

function seriesLabel(colors: ChartPalette, show: boolean) {
  return {
    show,
    position: 'top' as const,
    distance: 4,
    color: colors.text,
    fontSize: 10,
    fontWeight: 600,
    formatter: (params: unknown) => {
      const value = toNumber((params as { value?: unknown })?.value)
      return value === null ? '' : formatCompactNumber(value)
    }
  }
}

// Rich text ECharts memakai kurung kurawal sebagai penanda style,
// jadi karakter tersebut dibersihkan dari teks dinamis.
function toRichText(value: string): string {
  return value.replace(/[{}]/g, '')
}

// Batang transparan yang menimpa batang asli hanya untuk label vertikal
// (model + printhead ID). Satu series hanya bisa punya satu label, sehingga
// label nilai di batang asli diganti anotasi ini.
function annotationSeries(
  colors: ChartPalette,
  bar: BarLineChartSeries
): BarSeriesOption {
  return {
    name: '__bar_annotation__',
    type: 'bar',
    data: bar.data,
    // Menimpa batang asli, bukan berjajar di sampingnya.
    barGap: '-100%',
    barMaxWidth: 36,
    silent: true,
    // Harus di atas batang asli, jika tidak teks tertutup warna batang.
    z: 3,
    itemStyle: { color: 'transparent' },
    label: {
      show: true,
      position: 'inside',
      // align 'right' + rotate -90: teks tumbuh ke atas dari garis dasar.
      rotate: 90,
      align: 'right',
      verticalAlign: 'middle',
      distance: 0,
      formatter: (params: unknown) => {
        const index = (params as { dataIndex?: number })?.dataIndex ?? -1
        const annotation = props.barAnnotations?.[index]
        if (!annotation) return ''

        const label = `{label|${toRichText(annotation.label)}}`
        if (!annotation.sublabel) return label

        return `${label}\n{sublabel|${toRichText(annotation.sublabel)}}`
      },
      rich: {
        label: {
          color: colors.text,
          fontSize: 9,
          fontWeight: 700,
          lineHeight: 11,
          // Halo warna latar agar teks tetap terbaca di atas batang
          // maupun saat melewati area chart.
          textBorderColor: colors.bg,
          textBorderWidth: 2
        },
        sublabel: {
          color: colors.muted,
          fontSize: 9,
          fontWeight: 500,
          lineHeight: 11,
          textBorderColor: colors.bg,
          textBorderWidth: 2
        }
      }
    }
  }
}

function toEChartsSeries(
  series: BarLineChartSeries,
  colors: ChartPalette,
  showLabels: boolean
): BarSeriesOption | LineSeriesOption {
  const common = {
    name: series.name,
    data: series.data,
    yAxisIndex: series.yAxisIndex ?? 0,
    label: seriesLabel(colors, showLabels),
    // Sembunyikan label yang bertabrakan (mis. bar vs line di kategori padat).
    labelLayout: { hideOverlap: true },
    emphasis: { focus: 'series' as const }
  }

  if (series.type === 'bar') {
    return {
      ...common,
      type: 'bar',
      barMaxWidth: 36,
      itemStyle: {
        borderRadius: [4, 4, 0, 0],
        ...(series.color ? { color: series.color } : {})
      },
      ...(series.stack ? { stack: series.stack } : {})
    }
  }

  return {
    ...common,
    type: 'line',
    smooth: series.smooth ?? true,
    symbol: 'circle',
    symbolSize: 7,
    lineStyle: {
      width: 2,
      ...(series.color ? { color: series.color } : {})
    },
    ...(series.color ? { itemStyle: { color: series.color } } : {})
  }
}

function tooltipFormatter(colors: ChartPalette) {
  return (params: unknown) => {
    const items = (Array.isArray(params) ? params : [params]) as TooltipItem[]
    // Buang series anotasi (batang transparan) dari tooltip.
    const visibleItems = items.filter(item => item.seriesIndex < props.series.length)
    const first = visibleItems[0]
    if (!first) return ''

    const rows = visibleItems.map((item) => {
      const config = props.series[item.seriesIndex]
      const unit = props.yAxes[config?.yAxisIndex ?? 0]?.unit
      const value = toNumber(item.value)
      const formatted = value === null ? '-' : fullNumberFormat.format(value)
      const dotColor = item.color ?? colors.muted

      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;line-height:1.7">'
        + '<span style="display:flex;align-items:center;gap:6px;min-width:0">'
        + `<span style="width:8px;height:8px;border-radius:9999px;background:${dotColor};flex:0 0 auto"></span>`
        + `<span style="color:${colors.muted};white-space:nowrap">${escapeHtml(String(item.seriesName ?? ''))}</span>`
        + '</span>'
        + `<strong style="font-weight:600;font-variant-numeric:tabular-nums;color:${colors.text};white-space:nowrap">${formatted}${unit ? ` ${escapeHtml(unit)}` : ''}</strong>`
        + '</div>'
    }).join('')

    const title = first.axisValueLabel ?? first.seriesName ?? ''

    return '<div style="min-width:200px;max-width:320px">'
      + `<div style="margin-bottom:6px;font-weight:600;color:${colors.text}">${escapeHtml(String(title))}</div>`
      + rows
      + '</div>'
  }
}

const reducedMotion = useReducedMotion()

function buildSeries(colors: ChartPalette): (BarSeriesOption | LineSeriesOption)[] {
  // Saat anotasi aktif, label nilai diganti label model + printhead ID.
  const showValueLabels = props.showLabels && !hasAnnotations.value
  const series = props.series.map(item => toEChartsSeries(item, colors, showValueLabels))
  const bar = props.series.find(item => item.type === 'bar')

  if (hasAnnotations.value && bar) {
    series.push(annotationSeries(colors, bar))
  }

  return series
}

const option = computed<EChartsOption>(() => {
  const colors = palette.value

  const yAxis: YAxisComponentOption[] = props.yAxes.map((axis, index) => {
    const position = axis.position ?? (index === 0 ? 'left' : 'right')

    return {
      type: 'value',
      // Unit dipindah ke judul sumbu agar label tick tidak mengulang unit.
      name: axis.unit ? `${axis.name} (${axis.unit})` : axis.name,
      position,
      nameLocation: 'end',
      nameGap: 16,
      nameTextStyle: {
        color: colors.muted,
        fontSize: 10,
        fontWeight: 600,
        align: position === 'right' ? 'right' : 'left'
      },
      axisLabel: {
        color: colors.muted,
        fontSize: 10,
        formatter: (value: number) => formatCompactNumber(value)
      },
      axisLine: {
        lineStyle: { color: colors.axis }
      },
      axisTick: {
        lineStyle: { color: colors.axis }
      },
      // Gridline hanya dari sumbu pertama: dua sumbu dengan skala berbeda
      // menghasilkan garis bantu yang saling bertabrakan.
      splitLine: {
        show: index === 0,
        lineStyle: { color: colors.splitLine, type: 'dashed' }
      }
    }
  })

  return {
    // Hormati prefers-reduced-motion: chart tetap tampil, hanya tanpa animasi.
    animation: !reducedMotion.value,
    animationDuration: 450,
    animationEasing: 'cubicOut',
    animationDurationUpdate: 250,
    animationEasingUpdate: 'cubicOut',
    // Stagger ringan per titik data supaya batang tidak muncul serentak.
    animationDelay: (index: number) => index * 15,
    tooltip: {
      trigger: 'axis',
      confine: true,
      axisPointer: {
        type: 'shadow',
        shadowStyle: { color: colors.pointer }
      },
      backgroundColor: colors.tooltipBg,
      borderColor: colors.tooltipBorder,
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: colors.text, fontSize: 12 },
      extraCssText: 'border-radius: 10px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);',
      formatter: tooltipFormatter(colors)
    },
    legend: {
      top: 8,
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 16,
      textStyle: { color: colors.muted, fontSize: 11 },
      // Series anotasi tidak boleh muncul sebagai entri legend.
      data: props.series.map(series => series.name)
    },
    grid: {
      left: 8,
      right: 12,
      top: 64,
      bottom: 8,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: props.categories,
      axisLabel: {
        // Anotasi di dalam batang menggantikan nama kategori di sumbu X.
        show: !hasAnnotations.value,
        color: colors.muted,
        fontSize: 10,
        hideOverlap: true
      },
      axisLine: {
        lineStyle: { color: colors.axis }
      },
      axisTick: { show: false }
    },
    yAxis: yAxis.length === 1 ? yAxis[0] : yAxis,
    series: buildSeries(colors)
  }
})
</script>

<template>
  <div
    class="w-full rounded-lg border border-default bg-default p-4"
    :style="{ height: `${height}px` }"
  >
    <VChart
      :option="option"
      autoresize
      style="height: 100%; width: 100%"
    />
  </div>
</template>
