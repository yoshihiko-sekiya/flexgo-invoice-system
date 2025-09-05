<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button router-link="/dashboard">
            <ion-icon :icon="arrowBackOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>レポート プレビュー</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="preview-container">
        <!-- フォーム部分 -->
        <div class="form-section">
          <ion-card>
            <ion-card-header>
              <ion-card-title>レポート情報入力</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              <ion-item>
                <ion-label position="stacked">日付</ion-label>
                <ion-input
                  data-cy="date"
                  type="date"
                  v-model="formData.date"
                  placeholder="日付を選択"
                />
              </ion-item>

              <ion-item>
                <ion-label position="stacked">ドライバー名</ion-label>
                <ion-input
                  data-cy="driver"
                  v-model="formData.driverName"
                  placeholder="ドライバー名を入力"
                />
              </ion-item>

              <ion-item>
                <ion-label position="stacked">配送件数</ion-label>
                <ion-input
                  data-cy="count"
                  type="number"
                  v-model.number="formData.deliveryCount"
                  placeholder="件数を入力"
                />
              </ion-item>

              <ion-item>
                <ion-label position="stacked">総走行距離 (km)</ion-label>
                <ion-input
                  data-cy="distance"
                  type="number"
                  step="0.1"
                  v-model.number="formData.totalDistance"
                  placeholder="距離を入力"
                />
              </ion-item>

              <ion-item>
                <ion-label position="stacked">メモ・特記事項</ion-label>
                <ion-textarea
                  data-cy="note"
                  v-model="formData.memo"
                  placeholder="メモや特記事項を入力"
                  :rows="4"
                />
              </ion-item>

              <!-- 結果表示 -->
              <div v-if="lastResult" data-cy="result" class="result-display">
                <ion-card>
                  <ion-card-content>
                    <div v-if="lastBytes !== null" data-cy="result-bytes">
                      バイト数: {{ lastBytes.toLocaleString() }}
                    </div>
                    <div v-if="lastResult.url" data-cy="result-url">
                      保存先URL: {{ lastResult.url }}
                    </div>
                    <div v-if="lastResult.operation" data-cy="result-operation">
                      操作: {{ lastResult.operation }}
                    </div>
                  </ion-card-content>
                </ion-card>
              </div>

              <div class="button-group">
                <ion-button
                  data-cy="generate"
                  expand="block"
                  @click="generatePDF"
                  :disabled="generating || !isFormValid"
                >
                  <ion-icon :icon="documentOutline" slot="start" />
                  <span v-if="generating">PDF生成中...</span>
                  <span v-else>PDFを生成</span>
                  <ion-spinner v-if="generating" name="crescent" slot="end" />
                </ion-button>

                <ion-button
                  data-cy="save"
                  expand="block"
                  color="secondary"
                  @click="savePDF"
                  :disabled="saving || !isFormValid"
                >
                  <ion-icon :icon="cloudUploadOutline" slot="start" />
                  <span v-if="saving">クラウド保存中...</span>
                  <span v-else>クラウドに保存</span>
                  <ion-spinner v-if="saving" name="crescent" slot="end" />
                </ion-button>
                
                <ion-button
                  expand="block"
                  fill="outline"
                  @click="updatePreview"
                >
                  <ion-icon :icon="eyeOutline" slot="start" />
                  プレビュー更新
                </ion-button>
              </div>
            </ion-card-content>
          </ion-card>
        </div>

        <!-- プレビュー部分 -->
        <div class="preview-section">
          <ion-card>
            <ion-card-header>
              <ion-card-title>HTMLプレビュー</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              <div class="html-preview" v-html="htmlPreview"></div>
            </ion-card-content>
          </ion-card>
        </div>
      </div>

      <!-- 成功・エラーメッセージ -->
      <ion-toast
        :is-open="showToast"
        :message="toastMessage"
        :color="toastColor"
        :duration="3000"
        @didDismiss="showToast = false"
      />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import { z } from 'zod'
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonIcon,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonItem,
  IonLabel,
  IonInput,
  IonTextarea,
  IonSpinner,
  IonToast
} from '@ionic/vue'
import {
  arrowBackOutline,
  documentOutline,
  eyeOutline,
  cloudUploadOutline
} from 'ionicons/icons'
import { downloadOrSaveReport } from '@/utils/pdf'
import { renderDailyReport, type DailyReport } from '@/templates/report'

// Zodスキーマ定義
const ReportSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  driverName: z.string().min(1, 'Driver name is required'),
  deliveryCount: z.coerce.number().int().nonnegative(),
  totalDistance: z.coerce.number().nonnegative(),
  memo: z.string().optional().default('')
})

type ReportForm = z.infer<typeof ReportSchema>

// フォームデータ（型安全）
const formData = reactive<ReportForm>({
  date: new Date().toISOString().split('T')[0],
  driverName: '',
  deliveryCount: 0,
  totalDistance: 0,
  memo: ''
})

// 最後の実行結果（E2E用）
const lastResult = ref<{
  bytes?: number
  url?: string
  operation?: string
} | null>(null)

// E2E用バイト数表示
const lastBytes = ref<number | null>(null)

// 状態管理
const generating = ref(false)
const saving = ref(false)
const htmlPreview = ref('')
const showToast = ref(false)
const toastMessage = ref('')
const toastColor = ref<'success' | 'danger'>('success')

// バリデーション（Zod使用）
const isFormValid = computed(() => {
  const result = ReportSchema.safeParse(formData)
  return result.success
})

const validationErrors = computed(() => {
  const result = ReportSchema.safeParse(formData)
  return result.success ? [] : result.error.issues
})

// HTMLテンプレート生成（型安全）
const generateHTML = (): string => {
  // Zodバリデーション
  const parsed = ReportSchema.safeParse(formData)
  if (!parsed.success) {
    console.warn('Form validation failed:', parsed.error.issues)
    return '<p>Invalid form data</p>'
  }
  
  const data = parsed.data
  
  // 型安全なDailyReport変換
  const reportData: DailyReport = {
    date: data.date,
    driver: data.driverName,
    count: data.deliveryCount,
    distance: data.totalDistance,
    note: data.memo || undefined
  }
  
  return renderDailyReport(reportData)
}

// プレビュー更新
const updatePreview = () => {
  if (!isFormValid.value) {
    htmlPreview.value = '<p style="color: #999; text-align: center; padding: 20px;">必須項目を入力してください</p>'
    return
  }
  
  const html = generateHTML()
  // プレビュー用に簡素化（スタイルは一部のみ適用）
  htmlPreview.value = html.replace(/<style>[\s\S]*?<\/style>/, '<style>body{font-family:Arial,sans-serif;margin:10px;font-size:12px;} .header{text-align:center;border-bottom:2px solid #3880ff;padding-bottom:10px;margin-bottom:20px;} .title{font-size:18px;font-weight:bold;color:#3880ff;} .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:15px 0;} .info-item{background:#f8f9fa;padding:10px;border-radius:4px;} .info-label{font-size:11px;color:#666;} .info-value{font-weight:bold;} .stats-highlight{text-align:center;background:#3880ff;color:white;padding:15px;border-radius:8px;margin:15px 0;} .memo-section{margin-top:15px;} .memo-title{font-weight:bold;color:#3880ff;margin-bottom:10px;} .memo-content{background:#f8f9fa;padding:10px;border-radius:4px;white-space:pre-wrap;} .footer{margin-top:20px;text-align:center;font-size:10px;color:#999;border-top:1px solid #e1e5e9;padding-top:10px;}</style>')
}

// PDF生成（型安全）
const generatePDF = async () => {
  const parsed = ReportSchema.safeParse(formData)
  if (!parsed.success) {
    showToastMessage('必須項目を入力してください', 'danger')
    console.warn('Validation errors:', parsed.error.issues)
    return
  }
  
  generating.value = true
  
  try {
    const html = generateHTML()
    const result = await downloadOrSaveReport(html, {
      mode: 'download',
      filename: `delivery_report_${parsed.data.date}_${parsed.data.driverName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
    })
    
    // 結果を保存（E2E用）
    const bytes = result?.bytes || 0
    lastResult.value = {
      bytes,
      operation: 'download'
    }
    lastBytes.value = bytes
    
    showToastMessage('PDFが正常に生成されました', 'success')
  } catch (error) {
    console.error('PDF generation error:', error)
    lastResult.value = null
    lastBytes.value = null
    showToastMessage('PDF生成に失敗しました', 'danger')
  } finally {
    generating.value = false
  }
}

// PDF保存（クラウド）
const savePDF = async () => {
  const parsed = ReportSchema.safeParse(formData)
  if (!parsed.success) {
    showToastMessage('必須項目を入力してください', 'danger')
    console.warn('Validation errors:', parsed.error.issues)
    return
  }
  
  saving.value = true
  
  try {
    const html = generateHTML()
    const result = await downloadOrSaveReport(html, {
      mode: 'save',
      metadata: {
        driverName: parsed.data.driverName,
        date: parsed.data.date,
        deliveryCount: parsed.data.deliveryCount,
        totalDistance: parsed.data.totalDistance
      }
    })
    
    // 結果を保存（E2E用）
    const bytes = result?.bytes || result?.metadata?.size || 0
    lastResult.value = {
      bytes,
      url: result?.url,
      operation: 'save'
    }
    lastBytes.value = bytes
    
    if (result) {
      console.log('PDF saved successfully:', result)
      showToastMessage('PDFを保存しました', 'success')
    }
    
  } catch (error) {
    console.error('PDF save error:', error)
    lastResult.value = null
    lastBytes.value = null
    showToastMessage('PDF保存に失敗しました', 'danger')
  } finally {
    saving.value = false
  }
}

// トースト表示
const showToastMessage = (message: string, color: 'success' | 'danger') => {
  toastMessage.value = message
  toastColor.value = color
  showToast.value = true
}

// 初期化
onMounted(() => {
  // デモデータを設定（型安全）
  formData.driverName = '山田太郎'
  formData.deliveryCount = 12
  formData.totalDistance = 85.3
  formData.memo = '午前中は渋滞のため遅延が発生。\n午後からは順調に配送完了。\n\n特記事項：\n・3番目の配送先で再配達依頼あり\n・燃費: 12.5km/L'
  
  updatePreview()
})
</script>

<style scoped>
.preview-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.form-section {
  min-width: 0;
}

.preview-section {
  min-width: 0;
}

.button-group {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.html-preview {
  border: 1px solid #e1e5e9;
  border-radius: 8px;
  padding: 10px;
  background: white;
  min-height: 400px;
  overflow-y: auto;
  max-height: 600px;
}

/* モバイル対応 */
@media (max-width: 768px) {
  .preview-container {
    grid-template-columns: 1fr;
    gap: 15px;
  }
  
  .html-preview {
    max-height: 400px;
  }
}

/* フォーム項目のスペーシング */
ion-item {
  --padding-start: 0;
  --inner-padding-end: 0;
  margin-bottom: 15px;
}

ion-card {
  margin: 0 0 20px 0;
}

.result-display {
  margin: 16px 0;
}

.result-display ion-card {
  margin: 0;
}

.result-display ion-card-content {
  padding: 12px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  background: var(--ion-color-light);
  border-radius: 4px;
}

.result-display ion-card-content div {
  margin: 4px 0;
  color: var(--ion-color-dark);
}
</style>