<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import { PieChart } from 'echarts/charts'
import { LegendComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import type { PieChartDatum } from '~/types/charts'

use([PieChart, LegendComponent, TooltipComponent, CanvasRenderer])

const props = withDefaults(defineProps<{
  data: PieChartDatum[]
  height?: number
}>(), {
  height: 320
})

const option = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'item' },
  legend: { bottom: 0 },
  series: [
    {
      type: 'pie',
      radius: '60%',
      data: props.data
    }
  ]
}))
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
