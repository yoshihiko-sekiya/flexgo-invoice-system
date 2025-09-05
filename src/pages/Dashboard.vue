<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Dashboard</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <h2>Welcome to Mentor Lite</h2>
      <p>This is the dashboard page.</p>
      
      <ion-button expand="block" href="/health" fill="outline" class="ion-margin-top">
        Health Check
      </ion-button>
      
      <ion-button expand="block" href="/map" fill="outline" class="ion-margin-top">
        View Map
      </ion-button>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButton } from '@ionic/vue'
</script>