<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>System Health</ion-title>
        <ion-buttons slot="start">
          <ion-button @click="$router.back()" fill="clear">
            <ion-icon :icon="arrowBackOutline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="health-container">
        <h2>Environment Variables</h2>
        
        <ion-list>
          <ion-item>
            <ion-label>
              <h3>VITE_SUPABASE_URL</h3>
              <p>{{ supabaseUrl ? '✅ Set' : '❌ Missing' }}</p>
              <small v-if="supabaseUrl">{{ maskUrl(supabaseUrl) }}</small>
            </ion-label>
            <ion-icon 
              :icon="supabaseUrl ? checkmarkCircleOutline : closeCircleOutline" 
              :color="supabaseUrl ? 'success' : 'danger'"
              slot="end"
            ></ion-icon>
          </ion-item>

          <ion-item>
            <ion-label>
              <h3>VITE_SUPABASE_ANON_KEY</h3>
              <p>{{ supabaseKey ? '✅ Set' : '❌ Missing' }}</p>
              <small v-if="supabaseKey">{{ maskKey(supabaseKey) }}</small>
            </ion-label>
            <ion-icon 
              :icon="supabaseKey ? checkmarkCircleOutline : closeCircleOutline" 
              :color="supabaseKey ? 'success' : 'danger'"
              slot="end"
            ></ion-icon>
          </ion-item>

          <ion-item>
            <ion-label>
              <h3>VITE_MAPBOX_TOKEN</h3>
              <p>{{ mapboxToken ? '✅ Set' : '❌ Missing' }}</p>
              <small v-if="mapboxToken">{{ maskKey(mapboxToken) }}</small>
            </ion-label>
            <ion-icon 
              :icon="mapboxToken ? checkmarkCircleOutline : closeCircleOutline" 
              :color="mapboxToken ? 'success' : 'danger'"
              slot="end"
            ></ion-icon>
          </ion-item>

          <ion-item>
            <ion-label>
              <h3>VITE_API_BASE_URL</h3>
              <p>{{ apiBaseUrl ? '✅ Set' : '❌ Missing' }}</p>
              <small v-if="apiBaseUrl">{{ apiBaseUrl }}</small>
            </ion-label>
            <ion-icon 
              :icon="apiBaseUrl ? checkmarkCircleOutline : closeCircleOutline" 
              :color="apiBaseUrl ? 'success' : 'danger'"
              slot="end"
            ></ion-icon>
          </ion-item>
        </ion-list>

        <div class="actions-section">
          <h3>PWA Management</h3>
          <ion-button
            expand="block"
            fill="outline"
            @click="clearPWACache"
            :disabled="clearingCache"
            class="ion-margin-bottom"
          >
            <ion-spinner v-if="clearingCache" name="crescent" slot="start"></ion-spinner>
            <ion-icon v-else :icon="refreshOutline" slot="start"></ion-icon>
            Clear PWA Cache
          </ion-button>

          <ion-button
            expand="block"
            fill="outline"
            @click="unregisterServiceWorker"
            :disabled="unregisteringSW"
            class="ion-margin-bottom"
          >
            <ion-spinner v-if="unregisteringSW" name="crescent" slot="start"></ion-spinner>
            <ion-icon v-else :icon="stopCircleOutline" slot="start"></ion-icon>
            Unregister Service Worker
          </ion-button>

          <div class="sw-status">
            <p><strong>Service Worker:</strong> {{ swStatus }}</p>
            <p><strong>Cache Status:</strong> {{ cacheStatus }}</p>
          </div>
        </div>

        <div class="system-info">
          <h3>System Information</h3>
          <ion-item>
            <ion-label>
              <p><strong>User Agent:</strong></p>
              <small>{{ userAgent }}</small>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label>
              <p><strong>Timestamp:</strong> {{ new Date().toISOString() }}</p>
            </ion-label>
          </ion-item>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonButton,
  IonButtons,
  IonIcon,
  IonSpinner,
  toastController
} from '@ionic/vue'
import {
  arrowBackOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
  refreshOutline,
  stopCircleOutline
} from 'ionicons/icons'

// Environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL

// User agent
const userAgent = ref('')

// State
const clearingCache = ref(false)
const unregisteringSW = ref(false)
const swStatus = ref('Checking...')
const cacheStatus = ref('Unknown')

const showToast = async (message: string, color: 'success' | 'danger' = 'success') => {
  const toast = await toastController.create({
    message,
    duration: 3000,
    color,
    position: 'top'
  })
  await toast.present()
}

const maskUrl = (url: string): string => {
  try {
    const urlObj = new URL(url)
    return `${urlObj.protocol}//${urlObj.hostname}...`
  } catch {
    return url.substring(0, 20) + '...'
  }
}

const maskKey = (key: string): string => {
  if (key.length <= 8) return '***'
  return key.substring(0, 6) + '...' + key.substring(key.length - 4)
}

const checkServiceWorkerStatus = async () => {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      if (registration) {
        swStatus.value = `Active (${registration.scope})`
      } else {
        swStatus.value = 'Not registered'
      }
    } catch (error) {
      swStatus.value = 'Error checking'
    }
  } else {
    swStatus.value = 'Not supported'
  }
}

const checkCacheStatus = async () => {
  if ('caches' in window) {
    try {
      const cacheNames = await caches.keys()
      cacheStatus.value = cacheNames.length > 0 
        ? `${cacheNames.length} cache(s) found` 
        : 'No caches found'
    } catch (error) {
      cacheStatus.value = 'Error checking'
    }
  } else {
    cacheStatus.value = 'Not supported'
  }
}

const clearPWACache = async () => {
  clearingCache.value = true
  try {
    if ('caches' in window) {
      const cacheNames = await caches.keys()
      await Promise.all(
        cacheNames.map(cacheName => caches.delete(cacheName))
      )
      await showToast(`Cleared ${cacheNames.length} cache(s)`, 'success')
      await checkCacheStatus()
    } else {
      await showToast('Cache API not supported', 'danger')
    }
  } catch (error) {
    await showToast('Failed to clear cache', 'danger')
  } finally {
    clearingCache.value = false
  }
}

const unregisterServiceWorker = async () => {
  unregisteringSW.value = true
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration()
      if (registration) {
        await registration.unregister()
        await showToast('Service Worker unregistered', 'success')
        await checkServiceWorkerStatus()
      } else {
        await showToast('No Service Worker to unregister', 'danger')
      }
    } else {
      await showToast('Service Worker not supported', 'danger')
    }
  } catch (error) {
    await showToast('Failed to unregister Service Worker', 'danger')
  } finally {
    unregisteringSW.value = false
  }
}

onMounted(() => {
  userAgent.value = navigator.userAgent
  checkServiceWorkerStatus()
  checkCacheStatus()
})
</script>

<style scoped>
.health-container {
  max-width: 600px;
  margin: 0 auto;
}

.actions-section,
.system-info {
  margin-top: 2rem;
}

.sw-status {
  background: var(--ion-color-light);
  padding: 1rem;
  border-radius: 8px;
  margin-top: 1rem;
}

.sw-status p {
  margin: 0.5rem 0;
}

h2, h3 {
  margin: 1rem 0;
}

small {
  color: var(--ion-color-medium);
  font-family: monospace;
}
</style>