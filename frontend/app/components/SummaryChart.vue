<script setup lang="ts">
import type { BarLineChartSeries, PieChartDatum } from '~/types/charts'

const modelUsage: PieChartDatum[] = [
  { name: 'ZT620', value: 42 },
  { name: 'ZT410', value: 31 },
  { name: 'ZD621', value: 27 }
]

const monthlyCategories = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']

const singleAxisSeries: BarLineChartSeries[] = [
  { name: 'Labels', type: 'bar', data: [120, 200, 150, 280, 230, 310] },
  { name: 'Head Usage', type: 'line', data: [90, 160, 135, 220, 205, 270] }
]

const dualAxisSeries: BarLineChartSeries[] = [
  { name: 'Labels', type: 'bar', data: [1200, 1800, 1500, 2400, 2100, 2800] },
  {
    name: 'Print Length',
    type: 'line',
    data: [90, 160, 135, 220, 205, 270],
    yAxisIndex: 1
  }
]
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-lg font-semibold text-highlighted">
        Chart Components (Examples)
      </h2>
      <p class="text-sm text-muted">
        Pie chart dan kombinasi bar/line dengan satu atau dua sumbu Y
      </p>
    </div>
    <ClientOnly>
      <div class="grid gap-4 lg:grid-cols-3">
        <div class="space-y-2">
          <h3 class="text-sm font-medium text-highlighted">
            Pie Chart
          </h3>
          <BasePieChart :data="modelUsage" />
        </div>
        <div class="space-y-2">
          <h3 class="text-sm font-medium text-highlighted">
            Pie Chart
          </h3>
          <BasePieChart :data="modelUsage" />
        </div>
        <div class="space-y-2">
          <h3 class="text-sm font-medium text-highlighted">
            Bar &amp; Line — 1 Y Axis
          </h3>
          <BaseBarLineChart
            :categories="monthlyCategories"
            :series="singleAxisSeries"
            :y-axes="[{ name: 'Value', unit: 'units' }]"
          />
        </div>
      </div>
      <div class="grid gap-4 lg:grid-cols-2">
        <div class="space-y-2">
          <h3 class="text-sm font-medium text-highlighted">
            Bar &amp; Line — 2 Y Axes
          </h3>
          <BaseBarLineChart
            :categories="monthlyCategories"
            :series="dualAxisSeries"
            :y-axes="[
              { name: 'Labels', unit: 'count' },
              { name: 'Print Length', unit: 'm' }
            ]"
          />
        </div>
        <div class="space-y-2">
          <h3 class="text-sm font-medium text-highlighted">
            Bar &amp; Line — 2 Y Axes
          </h3>
          <BaseBarLineChart
            :categories="monthlyCategories"
            :series="dualAxisSeries"
            :y-axes="[
              { name: 'Labels', unit: 'count' },
              { name: 'Print Length', unit: 'm' }
            ]"
          />
        </div>
      </div>
      <template #fallback>
        <div
          class="flex h-[320px] items-center justify-center text-sm text-muted"
        >
          Memuat chart...
        </div>
      </template>
    </ClientOnly>
  </section>
</template>
