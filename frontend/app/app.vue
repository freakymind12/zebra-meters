<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

useHead({
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
  htmlAttrs: {
    lang: 'en'
  }
})

useSeoMeta({
  title: 'ZebraMeter Dashboard',
  description: 'Dashboard metric printer Zebra.'
})

// --- Logika untuk Ticking Clock ---
const currentTime = ref(new Date())
let timer

onMounted(() => {
  // Perbarui waktu setiap 1000ms (1 detik)
  timer = setInterval(() => {
    currentTime.value = new Date()
  }, 1000)
})

onUnmounted(() => {
  // Bersihkan interval saat komponen dihancurkan
  if (timer) clearInterval(timer)
})

// Format waktu ke standar Indonesia (contoh: Rabu, 14 Oktober 2026 23:06:00)
const formattedTime = computed(() => {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(currentTime.value)
})

// Mendapatkan tahun saat ini untuk Footer
const currentYear = new Date().getFullYear()
</script>

<template>
  <UApp>
    <UHeader :toggle="false">
      <template #left>
        <NuxtLink
          to="/"
          aria-label="ZebraMeter, kembali ke beranda"
          class="flex items-center gap-3 rounded-md transition-transform duration-200 ease-out hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
        >
          <ZebraLogo class="h-10 w-auto" />
        </NuxtLink>
      </template>

      <template #right>
        <div class="flex items-center gap-4">
          <!-- Ticking Clock dibungkus ClientOnly agar tidak Hydration Error -->
          <ClientOnly>
            <!-- tabular-nums mencegah lebar jam bergetar tiap detik -->
            <span
              class="hidden text-sm font-medium tabular-nums text-gray-500 dark:text-gray-400 lg:block"
            >
              {{ formattedTime }}
            </span>
            <!-- Fallback saat loading di sisi server -->
            <template #fallback>
              <div
                class="hidden h-5 w-56 animate-pulse rounded-md bg-gray-200 dark:bg-gray-800 lg:block"
              />
            </template>
          </ClientOnly>

          <UColorModeButton size="lg" />
        </div>
      </template>
    </UHeader>

    <!-- UMain ditambahkan min-height agar footer selalu berada di bawah jika konten sedikit -->
    <UMain class="min-h-[calc(100vh-140px)]">
      <NuxtPage />
    </UMain>

    <!-- Footer -->
    <footer
      class="border-t border-gray-200 bg-white/50 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/50"
    >
      <div
        class="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-6 sm:px-6 md:flex-row lg:px-8"
      >
        <p class="text-sm text-gray-500 dark:text-gray-400">
          &copy; {{ currentYear }} ZebraMeter
        </p>
        <p class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <UButton
            to="https://github.com/freakymind12/zebra-meters"
            target="_blank"
            rel="noopener noreferrer"
            icon="i-simple-icons-github"
            color="neutral"
            variant="ghost"
            size="md"
            square
            aria-label="Lihat repository ZebraMeter di GitHub"
          />
        </p>
      </div>
    </footer>
  </UApp>
</template>
