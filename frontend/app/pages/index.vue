<script setup lang="ts">
useSeoMeta({
  title: 'Printer Metrics — ZebraMeter',
  description: 'Monitor reading meter printer Zebra dan benchmark printhead.'
})
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
    <UPageHeader
      title="Printer Metrics"
      description="Monitor reading meter printer Zebra dan benchmark printhead secara real-time."
    />

    <section class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-lg font-semibold text-highlighted">
          Readings
        </h2>
        <p class="text-sm text-muted">
          Data meter terbaru per printer
        </p>
      </div>
      <ReadingsTable />
    </section>

    <section class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-lg font-semibold text-highlighted">
          Printhead Benchmark
        </h2>
        <p class="text-sm text-muted">
          Agregat first / last / delta per printhead
        </p>
      </div>
      <BenchmarkTable />
    </section>
  </div>
</template>
