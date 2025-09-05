<template>
  <div class="invoice-detail">
    <!-- ローディング -->
    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    </div>

    <!-- エラー表示 -->
    <div v-if="error" class="alert alert-danger">
      {{ error }}
    </div>

    <!-- 請求書詳細 -->
    <div v-if="!loading && !error && invoice">
      <!-- ヘッダー -->
      <div class="d-flex justify-content-between align-items-start mb-4">
        <div>
          <nav aria-label="breadcrumb">
            <ol class="breadcrumb">
              <li class="breadcrumb-item">
                <router-link to="/invoices">請求書一覧</router-link>
              </li>
              <li class="breadcrumb-item active">{{ invoice.invoice_no }}</li>
            </ol>
          </nav>
          <h1 class="h3">{{ invoice.invoice_no }}</h1>
        </div>
        
        <div class="btn-group">
          <button 
            class="btn btn-success" 
            @click="downloadPdf"
            :disabled="pdfLoading"
            data-cy="download-pdf-btn"
          >
            <i class="fas fa-file-pdf me-1"></i>
            {{ pdfLoading ? '生成中...' : 'PDF' }}
          </button>
          <button 
            v-if="canEdit" 
            class="btn btn-primary" 
            @click="toggleEdit"
            data-cy="toggle-edit-btn"
          >
            <i :class="isEditing ? 'fas fa-times' : 'fas fa-edit'" class="me-1"></i>
            {{ isEditing ? 'キャンセル' : '編集' }}
          </button>
        </div>
      </div>

      <!-- ステータスとサマリー -->
      <div class="row mb-4">
        <div class="col-md-8">
          <div class="card">
            <div class="card-body">
              <div class="row">
                <div class="col-sm-6">
                  <h6 class="text-muted">取引先</h6>
                  <p class="mb-3">
                    <strong>{{ invoice.partner_name }}</strong>
                    <small v-if="invoice.billing_code" class="text-muted d-block">
                      {{ invoice.billing_code }}
                    </small>
                  </p>
                </div>
                <div class="col-sm-6">
                  <h6 class="text-muted">期間</h6>
                  <p class="mb-3">{{ formatDateRange(invoice.period_start, invoice.period_end) }}</p>
                </div>
                <div class="col-sm-6">
                  <h6 class="text-muted">ステータス</h6>
                  <p class="mb-3">
                    <span :class="getStatusBadgeClass(invoice.status)">
                      {{ getStatusDisplay(invoice.status) }}
                    </span>
                  </p>
                </div>
                <div class="col-sm-6">
                  <h6 class="text-muted">作成日</h6>
                  <p class="mb-3">{{ formatDate(invoice.created_at) }}</p>
                </div>
              </div>
              
              <div v-if="invoice.memo" class="mt-3">
                <h6 class="text-muted">備考</h6>
                <p class="text-break">{{ invoice.memo }}</p>
              </div>
            </div>
          </div>
        </div>
        
        <div class="col-md-4">
          <div class="card bg-light">
            <div class="card-body text-center">
              <h6 class="card-title text-muted">請求金額</h6>
              <h2 class="text-primary mb-3">{{ formatCurrency(invoice.total) }}</h2>
              <div class="small text-muted">
                <div>小計: {{ formatCurrency(invoice.subtotal) }}</div>
                <div>消費税: {{ formatCurrency(invoice.tax) }}</div>
                <div class="mt-2">明細件数: {{ invoice.item_count }}件</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 明細編集フォーム（編集モード） -->
      <div v-if="isEditing" class="card mb-4">
        <div class="card-header">
          <h5 class="card-title mb-0">基本情報編集</h5>
        </div>
        <div class="card-body">
          <form @submit.prevent="saveInvoice" class="row g-3">
            <div class="col-md-4">
              <label class="form-label">期間（開始）</label>
              <input 
                type="date" 
                class="form-control" 
                v-model="editForm.period_start"
                :class="{ 'is-invalid': formErrors.period_start }"
                data-cy="edit-period-start"
              />
              <div v-if="formErrors.period_start" class="invalid-feedback">
                {{ formErrors.period_start }}
              </div>
            </div>
            
            <div class="col-md-4">
              <label class="form-label">期間（終了）</label>
              <input 
                type="date" 
                class="form-control" 
                v-model="editForm.period_end"
                :class="{ 'is-invalid': formErrors.period_end }"
                data-cy="edit-period-end"
              />
              <div v-if="formErrors.period_end" class="invalid-feedback">
                {{ formErrors.period_end }}
              </div>
            </div>
            
            <div class="col-md-4">
              <label class="form-label">取引先</label>
              <select 
                class="form-select" 
                v-model="editForm.partner_id"
                :class="{ 'is-invalid': formErrors.partner_id }"
                data-cy="edit-partner-select"
              >
                <option value="">選択してください</option>
                <option 
                  v-for="partner in partners" 
                  :key="partner.id" 
                  :value="partner.id"
                >
                  {{ partner.name }}
                </option>
              </select>
              <div v-if="formErrors.partner_id" class="invalid-feedback">
                {{ formErrors.partner_id }}
              </div>
            </div>
            
            <div class="col-12">
              <label class="form-label">備考</label>
              <textarea 
                class="form-control" 
                rows="3"
                v-model="editForm.memo"
                placeholder="備考を入力..."
                data-cy="edit-memo"
              ></textarea>
            </div>
            
            <div class="col-12">
              <button 
                type="submit" 
                class="btn btn-primary me-2"
                :disabled="saveLoading"
                data-cy="save-invoice-btn"
              >
                <i class="fas fa-save me-1"></i>
                {{ saveLoading ? '保存中...' : '保存' }}
              </button>
              <button 
                type="button" 
                class="btn btn-outline-secondary" 
                @click="cancelEdit"
                data-cy="cancel-edit-btn"
              >
                キャンセル
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- 請求明細 -->
      <div class="card mb-4">
        <div class="card-header d-flex justify-content-between align-items-center">
          <h5 class="card-title mb-0">請求明細</h5>
          <button v-if="canEdit && !isEditing" class="btn btn-sm btn-outline-primary" data-cy="add-item-btn">
            <i class="fas fa-plus me-1"></i>
            明細追加
          </button>
        </div>
        <div class="card-body">
          <div class="table-responsive">
            <table class="table table-sm">
              <thead class="table-light">
                <tr>
                  <th>配送日</th>
                  <th>内容</th>
                  <th>数量</th>
                  <th>単位</th>
                  <th>単価</th>
                  <th>金額</th>
                  <th v-if="isEditing">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!invoice.items || invoice.items.length === 0">
                  <td colspan="7" class="text-center text-muted py-4">
                    明細がありません
                  </td>
                </tr>
                <tr v-for="(item, index) in invoice.items" :key="item.id || index">
                  <td>
                    <small>{{ item.delivery_date ? formatDate(item.delivery_date) : '' }}</small>
                  </td>
                  <td>
                    {{ item.description }}
                    <div v-if="item.vehicle_no || item.driver_name" class="small text-muted">
                      <span v-if="item.vehicle_no">車両: {{ item.vehicle_no }}</span>
                      <span v-if="item.driver_name" class="ms-2">運転者: {{ item.driver_name }}</span>
                    </div>
                    <div v-if="item.is_overtime || item.is_special" class="small">
                      <span v-if="item.is_overtime" class="badge bg-warning">時間外</span>
                      <span v-if="item.is_special" class="badge bg-info ms-1">特殊</span>
                    </div>
                  </td>
                  <td class="text-end">{{ item.quantity.toLocaleString() }}</td>
                  <td>{{ getUnitDisplay(item.unit) }}</td>
                  <td class="text-end">{{ formatCurrency(item.unit_price) }}</td>
                  <td class="text-end font-weight-bold">{{ formatCurrency(item.amount) }}</td>
                  <td v-if="isEditing">
                    <button class="btn btn-sm btn-outline-danger" @click="removeItem(index)">
                      <i class="fas fa-trash"></i>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <!-- 合計表示 -->
          <div class="row justify-content-end mt-3">
            <div class="col-md-4">
              <table class="table table-sm">
                <tr>
                  <th class="text-end">小計:</th>
                  <td class="text-end">{{ formatCurrency(invoice.subtotal) }}</td>
                </tr>
                <tr>
                  <th class="text-end">消費税:</th>
                  <td class="text-end">{{ formatCurrency(invoice.tax) }}</td>
                </tr>
                <tr class="table-primary">
                  <th class="text-end">合計:</th>
                  <td class="text-end font-weight-bold">{{ formatCurrency(invoice.total) }}</td>
                </tr>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- ステータス操作 -->
      <div v-if="canPerformActions" class="card mb-4">
        <div class="card-header">
          <h5 class="card-title mb-0">操作</h5>
        </div>
        <div class="card-body">
          <div class="btn-group me-2">
            <button 
              v-if="canSubmit" 
              class="btn btn-primary" 
              @click="submitInvoice"
              :disabled="actionLoading"
              data-cy="submit-invoice-btn"
            >
              <i class="fas fa-paper-plane me-1"></i>
              承認申請
            </button>
            
            <button 
              v-if="canApprove" 
              class="btn btn-success" 
              @click="approveInvoice"
              :disabled="actionLoading"
              data-cy="approve-invoice-btn"
            >
              <i class="fas fa-check me-1"></i>
              承認
            </button>
            
            <button 
              v-if="canReject" 
              class="btn btn-danger" 
              @click="openRejectModal"
              :disabled="actionLoading"
              data-cy="reject-invoice-btn"
            >
              <i class="fas fa-times me-1"></i>
              差戻し
            </button>
            
            <button 
              v-if="canReopen" 
              class="btn btn-warning" 
              @click="reopenInvoice"
              :disabled="actionLoading"
              data-cy="reopen-invoice-btn"
            >
              <i class="fas fa-undo me-1"></i>
              再申請
            </button>
          </div>
        </div>
      </div>

      <!-- 承認履歴 -->
      <div v-if="invoice.approvals && invoice.approvals.length > 0" class="card">
        <div class="card-header">
          <h5 class="card-title mb-0">承認履歴</h5>
        </div>
        <div class="card-body">
          <div class="timeline">
            <div 
              v-for="approval in invoice.approvals" 
              :key="approval.id"
              class="timeline-item"
            >
              <div class="timeline-marker"></div>
              <div class="timeline-content">
                <h6 class="mb-1">
                  {{ getActionDisplay(approval.action) }}
                  <small class="text-muted">- {{ approval.approver_email }}</small>
                </h6>
                <p class="mb-1">
                  <small>{{ formatDateTime(approval.approved_at) }}</small>
                </p>
                <p v-if="approval.comment" class="mb-0 text-break">
                  {{ approval.comment }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 差戻しモーダル -->
    <div class="modal fade" ref="rejectModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">差戻し理由</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <textarea 
              class="form-control" 
              rows="4"
              v-model="rejectComment"
              placeholder="差戻し理由を入力してください..."
              required
              data-cy="reject-comment"
            ></textarea>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
              キャンセル
            </button>
            <button 
              type="button" 
              class="btn btn-danger" 
              @click="rejectInvoice"
              :disabled="!rejectComment.trim() || actionLoading"
              data-cy="confirm-reject-btn"
            >
              差戻し
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { 
  InvoiceUpdateSchema,
  StatusDisplayMap,
  StatusColorMap,
  UnitDisplayMap,
  type InvoiceDetailResponse,
  type InvoiceUpdate,
  type Partner 
} from '../../lib/schemas/invoice'

const route = useRoute()
const router = useRouter()

// リアクティブデータ
const loading = ref(false)
const error = ref<string | null>(null)
const invoice = ref<InvoiceDetailResponse | null>(null)
const partners = ref<Partner[]>([])
const isEditing = ref(false)
const saveLoading = ref(false)
const pdfLoading = ref(false)
const actionLoading = ref(false)
const rejectComment = ref('')
const rejectModal = ref<HTMLElement | null>(null)

const editForm = reactive<InvoiceUpdate>({
  partner_id: '',
  period_start: '',
  period_end: '',
  memo: ''
})

const formErrors = reactive<Record<string, string>>({})

// 計算プロパティ
const canEdit = computed(() => {
  if (!invoice.value) return false
  const userRole = 'Manager' // TODO: 実際の認証から取得
  return ['Admin', 'Manager'].includes(userRole) && invoice.value.status === 'Draft'
})

const canPerformActions = computed(() => {
  if (!invoice.value) return false
  const userRole = 'Manager' // TODO: 実際の認証から取得
  return ['Admin', 'Manager'].includes(userRole)
})

const canSubmit = computed(() => {
  return invoice.value?.status === 'Draft'
})

const canApprove = computed(() => {
  return ['Submitted', 'Approved'].includes(invoice.value?.status || '')
})

const canReject = computed(() => {
  return ['Submitted', 'Approved'].includes(invoice.value?.status || '')
})

const canReopen = computed(() => {
  return invoice.value?.status === 'Rejected'
})

// メソッド
async function fetchInvoice() {
  const id = route.params.id as string
  loading.value = true
  error.value = null
  
  try {
    const response = await fetch(`/api/invoices/${id}`, {
      headers: {
        'x-user-role': 'Manager',
        'x-user-email': 'manager@example.com'
      }
    })
    
    if (!response.ok) {
      throw new Error(`請求書の取得に失敗しました: ${response.status}`)
    }
    
    invoice.value = await response.json()
    
    // 編集フォームを初期化
    if (invoice.value) {
      editForm.partner_id = invoice.value.partner_id
      editForm.period_start = invoice.value.period_start
      editForm.period_end = invoice.value.period_end
      editForm.memo = invoice.value.memo || ''
    }
    
  } catch (err) {
    error.value = err instanceof Error ? err.message : '請求書の取得に失敗しました'
    console.error('請求書取得エラー:', err)
  } finally {
    loading.value = false
  }
}

async function fetchPartners() {
  try {
    // TODO: 取引先API実装後に有効化
    partners.value = [
      { id: '1', name: 'ABC運輸株式会社', billing_code: 'ABC001', is_active: true },
      { id: '2', name: 'DEF物流', billing_code: 'DEF002', is_active: true },
      { id: '3', name: 'GHI配送サービス', billing_code: 'GHI003', is_active: true }
    ] as Partner[]
  } catch (err) {
    console.error('取引先取得エラー:', err)
  }
}

async function saveInvoice() {
  if (!invoice.value) return
  
  saveLoading.value = true
  Object.keys(formErrors).forEach(key => delete formErrors[key])
  
  try {
    // バリデーション
    const validatedData = InvoiceUpdateSchema.parse(editForm)
    
    const response = await fetch(`/api/invoices/${invoice.value.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': 'Manager',
        'x-user-email': 'manager@example.com'
      },
      body: JSON.stringify(validatedData)
    })
    
    if (!response.ok) {
      throw new Error('請求書の更新に失敗しました')
    }
    
    // 再読み込み
    await fetchInvoice()
    isEditing.value = false
    
  } catch (err) {
    if (err.errors) {
      // Zodバリデーションエラー
      err.errors.forEach((error: any) => {
        formErrors[error.path[0]] = error.message
      })
    } else {
      error.value = err instanceof Error ? err.message : '請求書の更新に失敗しました'
    }
    console.error('請求書更新エラー:', err)
  } finally {
    saveLoading.value = false
  }
}

async function downloadPdf() {
  if (!invoice.value) return
  
  pdfLoading.value = true
  try {
    const response = await fetch(`/api/invoices/${invoice.value.id}/pdf`, {
      headers: {
        'x-user-role': 'Manager',
        'x-user-email': 'manager@example.com'
      }
    })
    
    if (!response.ok) {
      throw new Error('PDF生成に失敗しました')
    }
    
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${invoice.value.invoice_no}.pdf`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
    
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'PDF生成に失敗しました'
  } finally {
    pdfLoading.value = false
  }
}

async function submitInvoice() {
  if (!invoice.value) return
  
  actionLoading.value = true
  try {
    const response = await fetch(`/api/invoices/${invoice.value.id}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': 'Manager',
        'x-user-email': 'manager@example.com'
      }
    })
    
    if (!response.ok) {
      throw new Error('承認申請に失敗しました')
    }
    
    await fetchInvoice() // 再読み込み
    
  } catch (err) {
    error.value = err instanceof Error ? err.message : '承認申請に失敗しました'
  } finally {
    actionLoading.value = false
  }
}

async function approveInvoice() {
  if (!invoice.value) return
  
  actionLoading.value = true
  try {
    const response = await fetch(`/api/invoices/${invoice.value.id}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': 'Manager',
        'x-user-email': 'manager@example.com'
      },
      body: JSON.stringify({
        action: 'approve',
        approver_role: 'manager'
      })
    })
    
    if (!response.ok) {
      throw new Error('承認に失敗しました')
    }
    
    await fetchInvoice() // 再読み込み
    
  } catch (err) {
    error.value = err instanceof Error ? err.message : '承認に失敗しました'
  } finally {
    actionLoading.value = false
  }
}

function openRejectModal() {
  const modal = new (window as any).bootstrap.Modal(rejectModal.value)
  modal.show()
}

async function rejectInvoice() {
  if (!invoice.value || !rejectComment.value.trim()) return
  
  actionLoading.value = true
  try {
    const response = await fetch(`/api/invoices/${invoice.value.id}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': 'Manager',
        'x-user-email': 'manager@example.com'
      },
      body: JSON.stringify({
        action: 'reject',
        comment: rejectComment.value.trim(),
        approver_role: 'manager'
      })
    })
    
    if (!response.ok) {
      throw new Error('差戻しに失敗しました')
    }
    
    // モーダルを閉じる
    const modal = (window as any).bootstrap.Modal.getInstance(rejectModal.value)
    modal.hide()
    rejectComment.value = ''
    
    await fetchInvoice() // 再読み込み
    
  } catch (err) {
    error.value = err instanceof Error ? err.message : '差戻しに失敗しました'
  } finally {
    actionLoading.value = false
  }
}

async function reopenInvoice() {
  if (!invoice.value) return
  
  actionLoading.value = true
  try {
    const response = await fetch(`/api/invoices/${invoice.value.id}/reopen`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': 'Manager',
        'x-user-email': 'manager@example.com'
      }
    })
    
    if (!response.ok) {
      throw new Error('再申請に失敗しました')
    }
    
    await fetchInvoice() // 再読み込み
    
  } catch (err) {
    error.value = err instanceof Error ? err.message : '再申請に失敗しました'
  } finally {
    actionLoading.value = false
  }
}

function toggleEdit() {
  isEditing.value = !isEditing.value
  if (!isEditing.value) {
    // 編集キャンセル時はフォームをリセット
    if (invoice.value) {
      editForm.partner_id = invoice.value.partner_id
      editForm.period_start = invoice.value.period_start
      editForm.period_end = invoice.value.period_end
      editForm.memo = invoice.value.memo || ''
    }
    Object.keys(formErrors).forEach(key => delete formErrors[key])
  }
}

function cancelEdit() {
  toggleEdit()
}

function removeItem(index: number) {
  if (invoice.value?.items) {
    invoice.value.items.splice(index, 1)
  }
}

// ユーティリティ関数
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(amount)
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('ja-JP')
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('ja-JP')
}

function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })
  const endDate = new Date(end).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })
  return `${startDate} ～ ${endDate}`
}

function getStatusDisplay(status: string): string {
  return StatusDisplayMap[status as keyof typeof StatusDisplayMap] || status
}

function getStatusBadgeClass(status: string): string {
  const color = StatusColorMap[status as keyof typeof StatusColorMap] || 'secondary'
  return `badge bg-${color}`
}

function getUnitDisplay(unit: string): string {
  return UnitDisplayMap[unit as keyof typeof UnitDisplayMap] || unit
}

function getActionDisplay(action: string): string {
  const actionMap = {
    approve: '承認',
    reject: '差戻し',
    request_change: '変更要求',
    submit: '申請'
  }
  return actionMap[action as keyof typeof actionMap] || action
}

// ライフサイクル
onMounted(() => {
  fetchInvoice()
  fetchPartners()
})
</script>

<style scoped>
.timeline {
  position: relative;
}

.timeline-item {
  position: relative;
  padding-left: 2rem;
  margin-bottom: 1.5rem;
}

.timeline-marker {
  position: absolute;
  left: 0;
  top: 0;
  width: 12px;
  height: 12px;
  background-color: #007bff;
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow: 0 0 0 2px #007bff;
}

.timeline-item:before {
  content: '';
  position: absolute;
  left: 5px;
  top: 12px;
  bottom: -1.5rem;
  width: 2px;
  background-color: #dee2e6;
}

.timeline-item:last-child:before {
  display: none;
}

@media (max-width: 768px) {
  .btn-group {
    display: flex;
    flex-direction: column;
  }
  
  .btn-group .btn {
    margin-bottom: 0.5rem;
  }
}
</style>