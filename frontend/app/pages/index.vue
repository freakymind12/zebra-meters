<script setup lang="ts">
useSeoMeta({
  title: 'Printer Metrics — ZebraMeter',
  description: 'Monitor reading meter printer Zebra dan benchmark printhead.'
})
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
    <SummaryChart />
    <section class="space-y-4 motion-safe:animate-rise-in motion-reduce:animate-soft-in">
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

    <section class="space-y-4 motion-safe:animate-rise-in motion-reduce:animate-soft-in motion-safe:[animation-delay:80ms]">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-lg font-semibold text-highlighted">
          Historical Readings
        </h2>
        <p class="text-sm text-muted">
          Data meter terbaru per printer
        </p>
      </div>
      <ReadingsTable />
    </section>
  </div>
</template>
