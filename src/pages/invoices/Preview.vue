<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/dashboard"></ion-back-button>
        </ion-buttons>
        <ion-title>請求書プレビュー</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div class="preview-container">
        <!-- 左側: フォーム -->
        <div class="form-section">
          <ion-card>
            <ion-card-header>
              <ion-card-title>請求書作成</ion-card-title>
              <ion-card-subtitle>必要な情報を入力してください</ion-card-subtitle>
            </ion-card-header>
            
            <ion-card-content>
              <!-- 基本情報 -->
              <div class="form-group">
                <ion-item>
                  <ion-input
                    v-model="formData.invoiceNumber"
                    label="請求書番号"
                    label-placement="stacked"
                    placeholder="INV-2025-001"
                    required
                  ></ion-input>
                </ion-item>
                
                <ion-item>
                  <ion-input
                    v-model="formData.issueDate"
                    label="発行日"
                    label-placement="stacked"
                    type="date"
                    required
                  ></ion-input>
                </ion-item>
                
                <ion-item>
                  <ion-input
                    v-model="formData.dueDate"
                    label="支払期限"
                    label-placement="stacked"
                    type="date"
                    required
                  ></ion-input>
                </ion-item>
              </div>

              <!-- 請求先情報 -->
              <div class="form-group">
                <h3>請求先</h3>
                <ion-item>
                  <ion-input
                    v-model="formData.toCompany.name"
                    label="会社名"
                    label-placement="stacked"
                    placeholder="株式会社サンプル"
                    required
                  ></ion-input>
                </ion-item>
                
                <ion-item>
                  <ion-textarea
                    v-model="formData.toCompany.address"
                    label="住所"
                    label-placement="stacked"
                    placeholder="〒100-0001&#10;東京都千代田区千代田1-1&#10;サンプルビル5F"
                    :rows="3"
                    required
                  ></ion-textarea>
                </ion-item>
              </div>

              <!-- 請求元情報 -->
              <div class="form-group">
                <h3>請求元</h3>
                <ion-item>
                  <ion-input
                    v-model="formData.fromCompany.name"
                    label="会社名"
                    label-placement="stacked"
                    placeholder="自社名"
                    required
                  ></ion-input>
                </ion-item>
                
                <ion-item>
                  <ion-textarea
                    v-model="formData.fromCompany.address"
                    label="住所"
                    label-placement="stacked"
                    placeholder="〒150-0001&#10;東京都渋谷区神宮前1-1&#10;オフィスビル3F"
                    :rows="3"
                    required
                  ></ion-textarea>
                </ion-item>
                
                <ion-item>
                  <ion-input
                    v-model="formData.fromCompany.tel"
                    label="電話番号"
                    label-placement="stacked"
                    placeholder="03-1234-5678"
                    required
                  ></ion-input>
                </ion-item>
                
                <ion-item>
                  <ion-input
                    v-model="formData.fromCompany.email"
                    label="メールアドレス"
                    label-placement="stacked"
                    type="email"
                    placeholder="contact@example.com"
                    required
                  ></ion-input>
                </ion-item>
              </div>

              <!-- 明細 -->
              <div class="form-group">
                <h3>請求明細</h3>
                <div v-for="(item, index) in formData.items" :key="index" class="item-row">
                  <ion-item>
                    <ion-input
                      v-model="item.description"
                      :label="`項目 ${index + 1}`"
                      label-placement="stacked"
                      placeholder="サービス内容"
                    ></ion-input>
                  </ion-item>
                  <div class="item-numbers">
                    <ion-item>
                      <ion-input
                        v-model.number="item.quantity"
                        label="数量"
                        label-placement="stacked"
                        type="number"
                        min="1"
                        @ionInput="updateItemAmount(index)"
                      ></ion-input>
                    </ion-item>
                    <ion-item>
                      <ion-input
                        v-model.number="item.unitPrice"
                        label="単価"
                        label-placement="stacked"
                        type="number"
                        min="0"
                        @ionInput="updateItemAmount(index)"
                      ></ion-input>
                    </ion-item>
                    <ion-item>
                      <ion-input
                        :value="item.amount.toLocaleString()"
                        label="金額"
                        label-placement="stacked"
                        readonly
                      ></ion-input>
                    </ion-item>
                  </div>
                  <ion-button fill="clear" color="danger" @click="removeItem(index)">
                    <ion-icon :icon="trashOutline"></ion-icon>
                  </ion-button>
                </div>
                
                <ion-button fill="outline" @click="addItem">
                  <ion-icon :icon="addOutline" slot="start"></ion-icon>
                  項目を追加
                </ion-button>
              </div>

              <!-- 税率 -->
              <div class="form-group">
                <ion-item>
                  <ion-input
                    v-model.number="formData.taxRate"
                    label="消費税率 (%)"
                    label-placement="stacked"
                    type="number"
                    min="0"
                    max="100"
                    @ionInput="calculateTotals"
                  ></ion-input>
                </ion-item>
              </div>

              <!-- 振込先 -->
              <div class="form-group">
                <h3>振込先情報</h3>
                <ion-item>
                  <ion-input
                    v-model="formData.bankInfo.bankName"
                    label="銀行名"
                    label-placement="stacked"
                    placeholder="みずほ銀行"
                    required
                  ></ion-input>
                </ion-item>
                
                <ion-item>
                  <ion-input
                    v-model="formData.bankInfo.branchName"
                    label="支店名"
                    label-placement="stacked"
                    placeholder="渋谷支店"
                    required
                  ></ion-input>
                </ion-item>
                
                <ion-item>
                  <ion-select
                    v-model="formData.bankInfo.accountType"
                    label="口座種別"
                    label-placement="stacked"
                    placeholder="選択してください"
                  >
                    <ion-select-option value="普通">普通</ion-select-option>
                    <ion-select-option value="当座">当座</ion-select-option>
                  </ion-select>
                </ion-item>
                
                <ion-item>
                  <ion-input
                    v-model="formData.bankInfo.accountNumber"
                    label="口座番号"
                    label-placement="stacked"
                    placeholder="1234567"
                    required
                  ></ion-input>
                </ion-item>
                
                <ion-item>
                  <ion-input
                    v-model="formData.bankInfo.accountHolder"
                    label="口座名義"
                    label-placement="stacked"
                    placeholder="カ）サンプルカンパニー"
                    required
                  ></ion-input>
                </ion-item>
              </div>

              <!-- 備考 -->
              <div class="form-group">
                <ion-item>
                  <ion-textarea
                    v-model="formData.notes"
                    label="備考"
                    label-placement="stacked"
                    placeholder="お支払い条件やその他の注意事項"
                    :rows="3"
                  ></ion-textarea>
                </ion-item>
              </div>

              <!-- 合計表示 -->
              <div class="totals-preview">
                <div class="total-row">
                  <span>小計:</span>
                  <span>¥{{ formData.subtotal.toLocaleString() }}</span>
                </div>
                <div class="total-row">
                  <span>消費税 ({{ formData.taxRate }}%):</span>
                  <span>¥{{ formData.taxAmount.toLocaleString() }}</span>
                </div>
                <div class="total-row total">
                  <span>合計:</span>
                  <span>¥{{ formData.total.toLocaleString() }}</span>
                </div>
              </div>

              <!-- アクションボタン -->
              <div class="actions">
                <ion-button expand="block" @click="generatePDF" :disabled="!isFormValid">
                  <ion-icon :icon="downloadOutline" slot="start"></ion-icon>
                  PDFをダウンロード
                </ion-button>
                
                <ion-button expand="block" fill="outline" @click="savePDF" :disabled="!isFormValid">
                  <ion-icon :icon="cloudUploadOutline" slot="start"></ion-icon>
                  PDFを保存
                </ion-button>
              </div>
            </ion-card-content>
          </ion-card>
        </div>

        <!-- 右側: プレビュー -->
        <div class="preview-section">
          <ion-card>
            <ion-card-header>
              <ion-card-title>プレビュー</ion-card-title>
            </ion-card-header>
            
            <ion-card-content>
              <div class="html-preview" v-html="htmlPreview"></div>
            </ion-card-content>
          </ion-card>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonCardContent,
  IonItem,
  IonInput,
  IonTextarea,
  IonSelect,
  IonSelectOption,
  IonButton,
  IonIcon,
  IonButtons,
  IonBackButton,
  toastController
} from '@ionic/vue'
import {
  downloadOutline,
  cloudUploadOutline,
  addOutline,
  trashOutline
} from 'ionicons/icons'
import type { InvoiceData, InvoiceItem } from '@/templates/invoice'
import { renderInvoice } from '@/templates/invoice'
import { downloadOrSaveReport } from '@/utils/pdf'

// フォームデータ
const formData = ref<InvoiceData>({
  invoiceNumber: `INV-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}01`,
  issueDate: new Date().toISOString().split('T')[0],
  dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  fromCompany: {
    name: '株式会社FLEX GO',
    address: '〒150-0001\n東京都渋谷区神宮前1-1\nFLEX GOビル3F',
    tel: '03-1234-5678',
    email: 'billing@flexgo.co.jp'
  },
  toCompany: {
    name: '株式会社サンプルクライアント',
    address: '〒100-0001\n東京都千代田区千代田1-1\nクライアントビル5F'
  },
  items: [
    {
      description: 'Webアプリケーション開発',
      quantity: 1,
      unitPrice: 500000,
      amount: 500000
    },
    {
      description: 'システム保守・運用',
      quantity: 3,
      unitPrice: 50000,
      amount: 150000
    }
  ],
  subtotal: 0,
  taxRate: 10,
  taxAmount: 0,
  total: 0,
  bankInfo: {
    bankName: 'みずほ銀行',
    branchName: '渋谷支店',
    accountType: '普通',
    accountNumber: '1234567',
    accountHolder: 'カ）フレックスゴー'
  },
  notes: 'お支払い期限を過ぎた場合、遅延損害金が発生する場合があります。'
})

// HTMLプレビュー
const htmlPreview = computed(() => {
  try {
    return renderInvoice(formData.value)
  } catch (error) {
    console.error('Preview generation error:', error)
    return '<div style="color: red; padding: 20px;">プレビューの生成中にエラーが発生しました</div>'
  }
})

// フォームバリデーション
const isFormValid = computed(() => {
  return (
    formData.value.invoiceNumber &&
    formData.value.issueDate &&
    formData.value.dueDate &&
    formData.value.fromCompany.name &&
    formData.value.fromCompany.address &&
    formData.value.fromCompany.tel &&
    formData.value.fromCompany.email &&
    formData.value.toCompany.name &&
    formData.value.toCompany.address &&
    formData.value.items.length > 0 &&
    formData.value.items.every(item => item.description && item.quantity > 0 && item.unitPrice >= 0) &&
    formData.value.bankInfo.bankName &&
    formData.value.bankInfo.branchName &&
    formData.value.bankInfo.accountType &&
    formData.value.bankInfo.accountNumber &&
    formData.value.bankInfo.accountHolder
  )
})

// 明細操作
function addItem() {
  formData.value.items.push({
    description: '',
    quantity: 1,
    unitPrice: 0,
    amount: 0
  })
}

function removeItem(index: number) {
  formData.value.items.splice(index, 1)
  calculateTotals()
}

function updateItemAmount(index: number) {
  const item = formData.value.items[index]
  item.amount = item.quantity * item.unitPrice
  calculateTotals()
}

// 合計計算
function calculateTotals() {
  const subtotal = formData.value.items.reduce((sum, item) => sum + item.amount, 0)
  const taxAmount = Math.floor(subtotal * (formData.value.taxRate / 100))
  const total = subtotal + taxAmount

  formData.value.subtotal = subtotal
  formData.value.taxAmount = taxAmount
  formData.value.total = total
}

// PDF生成
async function generatePDF() {
  try {
    const html = renderInvoice(formData.value)
    const filename = `invoice_${formData.value.invoiceNumber.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
    
    await downloadOrSaveReport(html, {
      mode: 'download',
      filename,
      type: 'invoice'
    })

    const toast = await toastController.create({
      message: 'PDFをダウンロードしました',
      duration: 2000,
      color: 'success'
    })
    await toast.present()
  } catch (error) {
    console.error('PDF generation failed:', error)
    const toast = await toastController.create({
      message: 'PDFの生成に失敗しました',
      duration: 3000,
      color: 'danger'
    })
    await toast.present()
  }
}

// PDF保存
async function savePDF() {
  try {
    const html = renderInvoice(formData.value)
    
    const response = await downloadOrSaveReport(html, {
      mode: 'save',
      type: 'invoice',
      metadata: {
        invoiceNumber: formData.value.invoiceNumber,
        companyName: formData.value.toCompany.name,
        total: formData.value.total,
        issueDate: formData.value.issueDate
      }
    })

    if (response?.url) {
      const toast = await toastController.create({
        message: `PDFを保存しました: ${response.filename}`,
        duration: 3000,
        color: 'success'
      })
      await toast.present()
    }
  } catch (error) {
    console.error('PDF save failed:', error)
    const toast = await toastController.create({
      message: 'PDFの保存に失敗しました',
      duration: 3000,
      color: 'danger'
    })
    await toast.present()
  }
}

// 初期化
watch(() => formData.value.items, () => {
  calculateTotals()
}, { immediate: true, deep: true })

watch(() => formData.value.taxRate, () => {
  calculateTotals()
}, { immediate: true })
</script>

<style scoped>
.preview-container {
  display: flex;
  gap: 20px;
  padding: 16px;
  min-height: 100%;
}

.form-section {
  flex: 1;
  min-width: 400px;
}

.preview-section {
  flex: 1;
  min-width: 400px;
}

.form-group {
  margin-bottom: 24px;
}

.form-group h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--ion-color-primary);
  margin: 16px 0 8px 16px;
}

.item-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin-bottom: 12px;
  padding: 12px;
  border: 1px solid var(--ion-color-light);
  border-radius: 8px;
}

.item-numbers {
  display: flex;
  gap: 8px;
  flex: 1;
}

.item-numbers ion-item {
  flex: 1;
}

.totals-preview {
  background: var(--ion-color-light);
  padding: 16px;
  border-radius: 8px;
  margin: 16px 0;
}

.total-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 14px;
}

.total-row.total {
  font-size: 18px;
  font-weight: bold;
  border-top: 2px solid var(--ion-color-primary);
  padding-top: 8px;
  margin-top: 8px;
  color: var(--ion-color-primary);
}

.actions {
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.html-preview {
  border: 1px solid var(--ion-color-light);
  border-radius: 8px;
  padding: 20px;
  background: white;
  overflow-x: auto;
  max-height: 80vh;
  font-size: 12px;
  transform: scale(0.8);
  transform-origin: top left;
  width: 125%;
}

@media (max-width: 1200px) {
  .preview-container {
    flex-direction: column;
  }
  
  .html-preview {
    transform: scale(1);
    width: 100%;
    max-height: 60vh;
  }
}
</style>