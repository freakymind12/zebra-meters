<script setup lang="ts">
import type { BarSeriesOption, EChartsOption, LineSeriesOption, YAxisComponentOption } from 'echarts'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import type { BarLineChartSeries, ChartYAxis } from '~/types/charts'

use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

const props = withDefaults(defineProps<{
  categories: string[]
  series: BarLineChartSeries[]
  yAxes: [ChartYAxis] | [ChartYAxis, ChartYAxis]
  height?: number
}>(), {
  height: 320
})

function toEChartsSeries(series: BarLineChartSeries): BarSeriesOption | LineSeriesOption {
  const common = {
    name: series.name,
    data: series.data,
    yAxisIndex: series.yAxisIndex ?? 0
  }

  if (series.type === 'bar') {
    return {
      ...common,
      type: 'bar',
      ...(series.color ? { itemStyle: { color: series.color } } : {}),
      ...(series.stack ? { stack: series.stack } : {})
    }
  }

  return {
    ...common,
    type: 'line',
    smooth: series.smooth ?? true,
    ...(series.color
      ? { lineStyle: { color: series.color }, itemStyle: { color: series.color } }
      : {})
  }
}

const option = computed<EChartsOption>(() => {
  const yAxis: YAxisComponentOption[] = props.yAxes.map((axis, index) => ({
    type: 'value',
    name: axis.name,
    position: axis.position ?? (index === 0 ? 'left' : 'right'),
    axisLabel: axis.unit
      ? { formatter: (value: number) => `${value} ${axis.unit}` }
      : undefined
  }))

  return {
    tooltip: { trigger: 'axis' },
    legend: { top: 8 },
    grid: {
      left: 48,
      right: yAxis.length === 2 ? 64 : 24,
      top: 48,
      bottom: 32
    },
    xAxis: {
      type: 'category',
      data: props.categories
    },
    yAxis: yAxis.length === 1 ? yAxis[0] : yAxis,
    series: props.series.map(toEChartsSeries)
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
