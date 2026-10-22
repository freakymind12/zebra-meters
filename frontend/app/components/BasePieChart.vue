<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import { PieChart } from 'echarts/charts'
import { LegendComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import type { ChartPalette } from '~/composables/useChartPalette'
import type { PieChartDatum } from '~/types/charts'

use([PieChart, LegendComponent, TooltipComponent, CanvasRenderer])

const props = withDefaults(defineProps<{
  data: PieChartDatum[]
  height?: number
  /** Nama satuan pada tooltip, mis. "Printers" atau "Printheads". */
  valueLabel?: string
}>(), {
  height: 320,
  valueLabel: 'Total'
})

const reducedMotion = useReducedMotion()
const palette = useChartPalette()

const totalValue = computed(() =>
  props.data.reduce((sum, datum) => sum + datum.value, 0)
)

const countFormat = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0
})

const MAX_HOSTNAMES = 8

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '\'': '&#39;'
}

// Nama model dan hostname berasal dari API, jadi selalu di-escape.
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => HTML_ESCAPES[char] ?? char)
}

type PieTooltipItem = {
  name?: string
  value?: number
  percent?: number
  color?: string
  data?: PieChartDatum
}

function metricRow(label: string, value: string, colors: ChartPalette): string {
  return '<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;line-height:1.7">'
    + `<span style="color:${colors.muted};white-space:nowrap">${escapeHtml(label)}</span>`
    + `<strong style="font-weight:600;font-variant-numeric:tabular-nums;color:${colors.text};white-space:nowrap">${escapeHtml(value)}</strong>`
    + '</div>'
}

function hostnameSection(hostnames: string[], colors: ChartPalette): string {
  const shown = hostnames.slice(0, MAX_HOSTNAMES)
  const remaining = hostnames.length - shown.length
  const chips = shown.map(hostname =>
    '<span style="display:inline-block;padding:1px 6px;border-radius:4px;'
    + `background:${colors.chip};color:${colors.text};font-size:11px;line-height:1.6">`
    + `${escapeHtml(hostname)}</span>`
  )

  if (remaining > 0) {
    chips.push(
      '<span style="display:inline-block;padding:1px 6px;'
      + `color:${colors.muted};font-size:11px;line-height:1.6">+${remaining} lainnya</span>`
    )
  }

  return '<div style="margin-top:8px;padding-top:8px;'
    + `border-top:1px solid ${colors.tooltipBorder}">`
    + '<div style="margin-bottom:4px;font-size:11px;font-weight:600;'
    + `color:${colors.muted}">Station (${hostnames.length})</div>`
    + `<div style="display:flex;flex-wrap:wrap;gap:4px">${chips.join('')}</div>`
    + '</div>'
}

function tooltipFormatter(colors: ChartPalette) {
  return (params: unknown) => {
    const item = params as PieTooltipItem
    const value = typeof item.value === 'number' ? item.value : 0
    const percent = typeof item.percent === 'number'
      ? item.percent
      : totalValue.value > 0 ? (value / totalValue.value) * 100 : 0
    const hostnames = item.data?.hostnames ?? []
    const dotColor = item.color ?? colors.muted

    return '<div style="min-width:200px;max-width:300px">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;'
      + `font-weight:600;color:${colors.text}">`
      + `<span style="width:8px;height:8px;border-radius:9999px;background:${dotColor};flex:0 0 auto"></span>`
      + `<span style="min-width:0;overflow-wrap:anywhere">${escapeHtml(item.name ?? '')}</span>`
      + '</div>'
      + metricRow(props.valueLabel, countFormat.format(value), colors)
      + metricRow('Share', `${percent.toFixed(1)}%`, colors)
      + (hostnames.length ? hostnameSection(hostnames, colors) : '')
      + '</div>'
  }
}

const option = computed<EChartsOption>(() => {
  const colors = palette.value

  return {
    // Hormati prefers-reduced-motion: chart tetap tampil, hanya tanpa animasi.
    animation: !reducedMotion.value,
    animationDuration: 500,
    animationEasing: 'cubicOut',
    animationDurationUpdate: 300,
    animationEasingUpdate: 'cubicOut',
    tooltip: {
      trigger: 'item',
      confine: true,
      backgroundColor: colors.tooltipBg,
      borderColor: colors.tooltipBorder,
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: colors.text, fontSize: 12 },
      extraCssText: 'border-radius: 10px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);',
      formatter: tooltipFormatter(colors)
    },
    legend: {
      bottom: 0,
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 12,
      textStyle: { color: colors.muted, fontSize: 11 }
    },
    series: [
      {
        type: 'pie',
        radius: '60%',
        // Jangan mulai dari scale(0): mulai dari 0.9 seperti elemen UI lain.
        animationType: 'scale',
        animationScale: 0.9,
        itemStyle: {
          // Garis pemisah antar slice mengikuti warna permukaan kartu.
          borderColor: colors.tooltipBg,
          borderWidth: 2
        },
        label: { show: false },
        labelLine: { show: false },
        emphasis: {
          scale: true,
          scaleSize: 6
        },
        data: props.data
      }
    ]
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
      style="height: 100%; width: 100%;"
    />
  </div>
</template>
