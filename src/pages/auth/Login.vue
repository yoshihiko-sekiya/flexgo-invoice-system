<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Login</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="login-container">
        <h1>Welcome</h1>
        <p>Sign in with your email to continue</p>

        <form @submit.prevent="handleLogin">
          <ion-item>
            <ion-label position="floating">Email</ion-label>
            <ion-input
              v-model="email"
              type="email"
              required
              :disabled="loading"
            ></ion-input>
          </ion-item>

          <ion-button
            expand="block"
            type="submit"
            :disabled="loading || !email"
            class="ion-margin-top"
          >
            <ion-spinner v-if="loading" name="crescent"></ion-spinner>
            <span v-else>Send Magic Link</span>
          </ion-button>
        </form>

        <ion-button
          fill="clear"
          expand="block"
          @click="$router.push('/health')"
          class="ion-margin-top"
        >
          System Health Check
        </ion-button>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonItem,
  IonLabel,
  IonInput,
  IonButton,
  IonSpinner,
  toastController
} from '@ionic/vue'
import { supabase } from '@/lib/supabase'

const router = useRouter()
const email = ref('')
const loading = ref(false)

const showToast = async (message: string, color: 'success' | 'danger' = 'success') => {
  const toast = await toastController.create({
    message,
    duration: 3000,
    color,
    position: 'top'
  })
  await toast.present()
}

const handleLogin = async () => {
  if (!email.value) return

  loading.value = true
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.value
    })

    if (error) {
      await showToast(error.message, 'danger')
    } else {
      await showToast('Magic link sent! Check your email.', 'success')
      // Monitor auth state changes
      supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
          router.push('/dashboard')
        }
      })
    }
  } catch (error) {
    await showToast('An error occurred. Please try again.', 'danger')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-container {
  max-width: 400px;
  margin: 0 auto;
  padding: 2rem 0;
}

h1 {
  text-align: center;
  margin-bottom: 1rem;
}

p {
  text-align: center;
  margin-bottom: 2rem;
  color: var(--ion-color-medium);
}
</style>