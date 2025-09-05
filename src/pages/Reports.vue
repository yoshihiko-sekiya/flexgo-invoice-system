<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Reports</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <h2>Reports</h2>
      <p>レポート機能の各種メニューです。</p>
      
      <ion-list>
        <ion-item button router-link="/reports/preview">
          <ion-icon :icon="documentTextOutline" slot="start" />
          <ion-label>
            <h3>レポート プレビュー</h3>
            <p>簡易レポートの作成とPDF出力</p>
          </ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonIcon } from '@ionic/vue'
import { documentTextOutline } from 'ionicons/icons'
</script>