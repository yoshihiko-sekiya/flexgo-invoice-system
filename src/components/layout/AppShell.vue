<template>
  <ion-app>
    <ion-header>
      <ion-toolbar>
        <ion-title>Mentor App</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="logout" fill="clear">
            <ion-icon :icon="logOutOutline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <router-view />
    </ion-content>

    <ion-tab-bar slot="bottom">
      <ion-tab-button tab="home" href="/dashboard" data-cy="nav-dashboard">
        <ion-icon :icon="homeOutline"></ion-icon>
        <ion-label>Home</ion-label>
      </ion-tab-button>

      <ion-tab-button tab="map" href="/map" data-cy="nav-map">
        <ion-icon :icon="mapOutline"></ion-icon>
        <ion-label>Map</ion-label>
      </ion-tab-button>

      <ion-tab-button tab="reports" href="/reports" data-cy="nav-reports">
        <ion-icon :icon="documentTextOutline"></ion-icon>
        <ion-label>Reports</ion-label>
      </ion-tab-button>

      <ion-tab-button tab="invoices" href="/invoices" data-cy="nav-invoices">
        <ion-icon :icon="receiptOutline"></ion-icon>
        <ion-label>Invoices</ion-label>
      </ion-tab-button>

      <ion-tab-button tab="approvals" href="/invoices/approvals" data-cy="nav-approvals">
        <ion-icon :icon="checkboxOutline"></ion-icon>
        <ion-label>Approvals</ion-label>
      </ion-tab-button>

      <ion-tab-button tab="vehicles" href="/vehicles" data-cy="nav-vehicles">
        <ion-icon :icon="carOutline"></ion-icon>
        <ion-label>Vehicles</ion-label>
      </ion-tab-button>
    </ion-tab-bar>
  </ion-app>
</template>

<script setup lang="ts">
import {
  IonApp,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonTabBar,
  IonTabButton,
  IonIcon,
  IonLabel,
  IonButtons,
  IonButton
} from '@ionic/vue'
import {
  homeOutline,
  mapOutline,
  documentTextOutline,
  carOutline,
  gridOutline,
  logOutOutline,
  receiptOutline,
  checkboxOutline
} from 'ionicons/icons'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'

const router = useRouter()

const logout = async () => {
  try {
    await supabase.auth.signOut()
    router.push('/login')
  } catch (error) {
    console.error('Logout error:', error)
  }
}
</script>