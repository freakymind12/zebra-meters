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
          class="flex items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          <svg
            class="size-7 text-primary sm:size-8"
            viewBox="0 0 28 28"
            fill="currentColor"
            aria-hidden="true"
          >
            <rect
              x="0"
              y="16"
              width="4"
              height="12"
              rx="2"
            />
            <rect
              x="6"
              y="8"
              width="4"
              height="20"
              rx="2"
            />
            <rect
              x="12"
              y="0"
              width="4"
              height="28"
              rx="2"
            />
            <rect
              x="18"
              y="12"
              width="4"
              height="16"
              rx="2"
            />
            <rect
              x="24"
              y="6"
              width="4"
              height="22"
              rx="2"
            />
          </svg>

          <span class="text-2xl leading-none font-bold tracking-tight text-highlighted sm:text-[1.75rem]">
            ZebraMeter
          </span>
        </NuxtLink>
      </template>

      <template #right>
        <div class="flex items-center gap-4">
          <!-- Ticking Clock dibungkus ClientOnly agar tidak Hydration Error -->
          <ClientOnly>
            <span class="hidden text-sm font-medium text-gray-500 dark:text-gray-400 lg:block">
              {{ formattedTime }}
            </span>
            <!-- Fallback saat loading di sisi server -->
            <template #fallback>
              <div class="hidden h-5 w-56 animate-pulse rounded-md bg-gray-200 dark:bg-gray-800 lg:block" />
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
    <footer class="border-t border-gray-200 bg-white/50 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/50">
      <div class="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-6 sm:px-6 md:flex-row lg:px-8">
        <p class="text-sm text-gray-500 dark:text-gray-400">
          &copy; {{ currentYear }} ZebraMeter
        </p>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Created By <a
            href="#"
            class="font-medium text-primary hover:underline"
          >Rian Kurniawan (Using Free Tier LLM Model)</a>
        </p>
      </div>
    </footer>
  </UApp>
</template>
