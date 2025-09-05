<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Map</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <div id="map" ref="mapContainer" style="height: 100%; width: 100%;"></div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent } from '@ionic/vue'
import { initMap } from '@/lib/map'
import type { Map } from 'mapbox-gl'

const mapContainer = ref<HTMLElement>()
let map: Map | null = null

onMounted(() => {
  if (mapContainer.value) {
    try {
      map = initMap(mapContainer.value, {
        center: [139.7671, 35.6816], // Tokyo
        zoom: 13
      })
    } catch (error) {
      console.error('Failed to initialize map:', error)
    }
  }
})

onUnmounted(() => {
  if (map) {
    map.remove()
    map = null
  }
})
</script>