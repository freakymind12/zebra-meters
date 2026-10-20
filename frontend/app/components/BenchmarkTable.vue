<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { SortingState, Column } from '@tanstack/vue-table'
import type { PrintheadBenchmark } from '~/types/api'

const UButton = resolveComponent('UButton')
const UBadge = resolveComponent('UBadge')

const { fetchBenchmarks } = useZebraApi()

const limit = ref(50)
const limitOptions = [
  { label: '20', value: 20 },
  { label: '50', value: 50 },
  { label: '100', value: 100 }
]

// Sentinel non-empty value: USelect tidak menerima empty string sebagai value.
// Frontend-side: "'__all__'" = "Semua Model". API-side: undefined = semua model.
const ALL_MODELS_VALUE = '__all__'
const model = ref(ALL_MODELS_VALUE)

const page = ref(1)
const total = ref(0)
const models = ref<string[]>([])

// Default sort disamakan dengan API: head_usage_delta desc.
const sorting = ref<SortingState>([{ id: 'headUsageDelta', desc: true }])

function sortableHeader(label: string) {
  return ({ column }: { column: Column<PrintheadBenchmark> }) => {
    const sorted = column.getIsSorted()

    return h(UButton, {
      color: 'neutral',
      variant: 'ghost',
      size: 'xs',
      label,
      icon: sorted
        ? sorted === 'asc'
          ? 'i-lucide-arrow-up-narrow-wide'
          : 'i-lucide-arrow-down-wide-narrow'
        : 'i-lucide-arrow-up-down',
      class: '-mx-2.5',
      onClick: () => column.toggleSorting(sorted === 'asc')
    })
  }
}

const benchmarks = ref<PrintheadBenchmark[]>([])
const pending = ref(false)
const error = ref<string | null>(null)

const pageSize = computed(() => limit.value)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

// Header -> API sort key. Hanya kolom numerik yang bisa diurutkan.
const SORT_KEYS: Record<string, string> = {
  readingCount: 'reading_count',
  lifespanMinutes: 'lifespan',
  headUsageDelta: 'head_usage_delta',
  printheadOdometerDelta: 'odometer_delta',
  totalLabelCountDelta: 'total_label_count_delta'
}

const sortKey = computed(() => SORT_KEYS[sorting.value[0]?.id ?? ''] ?? 'head_usage_delta')
const sortDirection = computed<'asc' | 'desc'>(() => (sorting.value[0]?.desc === false ? 'asc' : 'desc'))

let currentRequest = 0

async function load() {
  const requestId = ++currentRequest
  pending.value = true
  error.value = null
  try {
    const res = await fetchBenchmarks({
      page: page.value,
      limit: limit.value,
      model: model.value !== ALL_MODELS_VALUE ? model.value : undefined,
      sort: sortKey.value,
      direction: sortDirection.value
    })
    // Abaikan respons usang bila sudah ada request yang lebih baru.
    if (requestId !== currentRequest) return
    benchmarks.value = res.data
    total.value = res.count
    models.value = res.models
    // Bila halaman aktif melewati halaman terakhir (mis. filter menyusut),
    // clamp ke halaman valid lalu muat ulang sekali (tanpa loop).
    if (total.value > 0 && page.value > pageCount.value) {
      page.value = pageCount.value
      return
    }
  } catch (err) {
    if (requestId !== currentRequest) return
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (requestId === currentRequest) pending.value = false
  }
}

// Satu sumber reload. Saat filter/ukuran/sorting berubah, reset ke halaman 1.
watch([limit, model, sorting], () => {
  if (page.value !== 1) {
    // watch(page) di bawah yang akan memicu load — hindari load ganda.
    page.value = 1
    return
  }
  load()
})

// Perubahan halaman (mis. UPagination) memuat halaman yang diminta.
watch(page, load)

// Muat sekali saat komponen dipasang (tanpa immediate watcher → tanpa load ganda).
onMounted(load)

const modelItems = computed(() => [
  { label: 'Semua Model', value: ALL_MODELS_VALUE },
  ...models.value.map((m) => {
    return { label: m, value: m }
  })
])

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
  {
    accessorKey: 'readingCount',
    header: sortableHeader('Readings')
  },
  {
    accessorKey: 'lifespanMinutes',
    header: sortableHeader('Lifespan'),
    cell: ({ row }) => formatLifespan(row.original.lifespanMinutes)
  },
  {
    accessorKey: 'headUsageDelta',
    header: sortableHeader('Head Usage Delta'),
    cell: ({ row }) => formatNumber(row.original.headUsageDelta)
  },
  {
    accessorKey: 'printheadOdometerDelta',
    header: sortableHeader('Odometer Delta'),
    cell: ({ row }) => formatNumber(row.original.printheadOdometerDelta)
  },
  {
    accessorKey: 'totalLabelCountDelta',
    header: sortableHeader('Label Delta'),
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
        v-model="model"
        :items="modelItems"
        value-key="value"
        icon="i-lucide-printer"
        size="xs"
        class="w-48"
        aria-label="Filter model"
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
      <span
        v-if="!error"
        class="text-xs tabular-nums text-muted"
      >
        {{ total }} baris
      </span>
    </div>

    <UAlert
      v-if="error"
      class="motion-safe:animate-rise-in motion-reduce:animate-soft-in"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Gagal memuat data"
      :description="error"
    />

    <template v-else>
      <UTable
        v-model:sorting="sorting"
        :data="benchmarks"
        :columns="columns"
        :loading="pending"
        :sorting-options="{ manualSorting: true }"
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

      <div
        v-if="total > 0"
        class="flex justify-end"
      >
        <UPagination
          v-model:page="page"
          :total="total"
          :items-per-page="pageSize"
          size="xs"
        />
      </div>
    </template>
  </div>
</template>
