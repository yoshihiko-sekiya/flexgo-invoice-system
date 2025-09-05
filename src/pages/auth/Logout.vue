<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Logout</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="logout-container">
        <div v-if="loading" class="loading-state">
          <ion-spinner name="crescent"></ion-spinner>
          <p>Signing you out...</p>
        </div>

        <div v-else class="logout-complete">
          <ion-icon :icon="checkmarkCircleOutline" color="success" size="large"></ion-icon>
          <h2>Logged Out</h2>
          <p>You have been successfully logged out.</p>
          
          <ion-button
            expand="block"
            @click="$router.push('/login')"
            class="ion-margin-top"
          >
            Return to Login
          </ion-button>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButton,
  IonSpinner,
  IonIcon,
  toastController
} from '@ionic/vue'
import { checkmarkCircleOutline } from 'ionicons/icons'
import { supabase } from '@/lib/supabase'

const router = useRouter()
const loading = ref(true)

const showToast = async (message: string, color: 'success' | 'danger' = 'success') => {
  const toast = await toastController.create({
    message,
    duration: 3000,
    color,
    position: 'top'
  })
  await toast.present()
}

const performLogout = async () => {
  try {
    const { error } = await supabase.auth.signOut()
    
    if (error) {
      await showToast(error.message, 'danger')
    } else {
      await showToast('Successfully logged out', 'success')
    }
  } catch (error) {
    await showToast('An error occurred during logout', 'danger')
  } finally {
    loading.value = false
    
    // Auto-redirect after 3 seconds
    setTimeout(() => {
      router.push('/login')
    }, 3000)
  }
}

onMounted(() => {
  performLogout()
})
</script>

<style scoped>
.logout-container {
  max-width: 400px;
  margin: 0 auto;
  padding: 2rem 0;
  text-align: center;
}

.loading-state,
.logout-complete {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.loading-state p,
.logout-complete p {
  color: var(--ion-color-medium);
}

.logout-complete h2 {
  margin: 0.5rem 0;
}

ion-icon {
  font-size: 4rem;
}
</style>