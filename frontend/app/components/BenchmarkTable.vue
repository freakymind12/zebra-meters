<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { PrintheadBenchmark } from '~/types/api'

const { fetchBenchmarks } = useZebraApi()

const sort = ref('head_usage_delta')
const sortOptions = [
  { label: 'Head Usage Delta', value: 'head_usage_delta' },
  { label: 'Odometer Delta', value: 'odometer_delta' },
  { label: 'Lifespan', value: 'lifespan' },
  { label: 'Last Seen', value: 'last_seen' }
]

const limit = ref(50)
const limitOptions = [
  { label: '20', value: 20 },
  { label: '50', value: 50 },
  { label: '100', value: 100 }
]

const benchmarks = ref<PrintheadBenchmark[]>([])
const pending = ref(false)
const error = ref<string | null>(null)

async function load() {
  pending.value = true
  error.value = null
  try {
    const res = await fetchBenchmarks({ limit: limit.value, sort: sort.value })
    benchmarks.value = res.data
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    pending.value = false
  }
}

watch([sort, limit], load)
onMounted(load)

const columns: TableColumn<PrintheadBenchmark>[] = [
  { accessorKey: 'printheadId', header: 'Printhead ID' },
  {
    accessorKey: 'lastModel',
    header: 'Model',
    cell: ({ row }) => row.original.lastModel ?? '-'
  },
  {
    accessorKey: 'lastSeenAt',
    header: 'Last Seen',
    cell: ({ row }) => formatDateTime(row.original.lastSeenAt)
  },
  { accessorKey: 'readingCount', header: 'Readings' },
  {
    accessorKey: 'lifespanMinutes',
    header: 'Lifespan',
    cell: ({ row }) => formatLifespan(row.original.lifespanMinutes)
  },
  {
    accessorKey: 'headUsageDelta',
    header: 'Head Usage Delta',
    cell: ({ row }) => formatNumber(row.original.headUsageDelta)
  },
  {
    accessorKey: 'printheadOdometerDelta',
    header: 'Odometer Delta',
    cell: ({ row }) => formatNumber(row.original.printheadOdometerDelta)
  },
  {
    accessorKey: 'totalLabelCountDelta',
    header: 'Label Delta',
    cell: ({ row }) => formatNumber(row.original.totalLabelCountDelta)
  },
  {
    accessorKey: 'hasNegativeDelta',
    header: 'Data Quality',
    cell: ({ row }) => h(UBadge, {
      color: row.original.hasNegativeDelta ? 'error' : 'success',
      variant: 'subtle',
      size: 'xs'
    }, () => row.original.hasNegativeDelta ? 'Negative' : 'OK')
  }
]
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center gap-3">
      <USelect
        v-model="sort"
        :items="sortOptions"
        value-key="value"
        icon="i-lucide-arrow-down-up"
        size="xs"
        class="w-48"
        aria-label="Urutkan"
      />
      <USelect
        v-model="limit"
        :items="limitOptions"
        value-key="value"
        icon="i-lucide-list"
        size="xs"
        class="w-24"
        aria-label="Jumlah baris"
      />
      <UButton
        icon="i-lucide-refresh-cw"
        size="xs"
        variant="subtle"
        :loading="pending"
        @click="load"
      >
        Refresh
      </UButton>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Gagal memuat data"
      :description="error"
    />

    <UTable
      v-else
      :data="benchmarks"
      :columns="columns"
      :loading="pending"
      size="xs"
      sticky
      class="max-h-[480px]"
    >
      <template #empty>
        <UEmpty
          icon="i-lucide-gauge"
          description="Belum ada data benchmark. Jalankan `bun run benchmark:refresh` di API."
        />
      </template>
    </UTable>
  </div>
</template>
