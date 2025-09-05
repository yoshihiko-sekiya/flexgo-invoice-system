<template>
  <div class="approvals-page">
    <div class="d-flex justify-content-between align-items-center mb-4">
      <h1 class="h3">承認キュー</h1>
      <div class="badge bg-primary fs-6">
        {{ pendingCount }}件の承認待ち
      </div>
    </div>

    <div class="row">
      <!-- 左側: 承認待ち一覧 -->
      <div class="col-md-5">
        <div class="card h-100">
          <div class="card-header">
            <ul class="nav nav-tabs card-header-tabs">
              <li class="nav-item">
                <button 
                  class="nav-link" 
                  :class="{ active: activeTab === 'pending' }"
                  @click="activeTab = 'pending'"
                  data-cy="tab-pending"
                >
                  承認待ち ({{ pendingInvoices.length }})
                </button>
              </li>
              <li class="nav-item">
                <button 
                  class="nav-link" 
                  :class="{ active: activeTab === 'rejected' }"
                  @click="activeTab = 'rejected'"
                  data-cy="tab-rejected"
                >
                  差戻し済み ({{ rejectedInvoices.length }})
                </button>
              </li>
              <li class="nav-item">
                <button 
                  class="nav-link" 
                  :class="{ active: activeTab === 'completed' }"
                  @click="activeTab = 'completed'"
                  data-cy="tab-completed"
                >
                  完了済み ({{ completedInvoices.length }})
                </button>
              </li>
            </ul>
          </div>

          <div class="card-body p-0">
            <!-- ローディング -->
            <div v-if="loading" class="text-center py-4">
              <div class="spinner-border spinner-border-sm" role="status">
                <span class="visually-hidden">Loading...</span>
              </div>
            </div>

            <!-- エラー表示 -->
            <div v-if="error" class="alert alert-danger m-3">
              {{ error }}
            </div>

            <!-- 承認待ちリスト -->
            <div v-if="activeTab === 'pending'" class="list-group list-group-flush">
              <div v-if="pendingInvoices.length === 0" class="text-center text-muted py-4">
                承認待ちの請求書はありません
              </div>
              <button
                v-for="invoice in pendingInvoices"
                :key="invoice.id"
                class="list-group-item list-group-item-action"
                :class="{ active: selectedInvoice?.id === invoice.id }"
                @click="selectInvoice(invoice)"
                :data-cy="`pending-invoice-${invoice.id}`"
              >
                <div class="d-flex justify-content-between align-items-start">
                  <div class="flex-grow-1">
                    <h6 class="mb-1">{{ invoice.invoice_no }}</h6>
                    <p class="mb-1 text-muted small">{{ invoice.partner_name }}</p>
                    <small>{{ formatDateRange(invoice.period_start, invoice.period_end) }}</small>
                  </div>
                  <div class="text-end">
                    <div class="fw-bold">{{ formatCurrency(invoice.total) }}</div>
                    <span :class="getStatusBadgeClass(invoice.status)" class="small">
                      {{ getStatusDisplay(invoice.status) }}
                    </span>
                  </div>
                </div>
              </button>
            </div>

            <!-- 差戻し済みリスト -->
            <div v-if="activeTab === 'rejected'" class="list-group list-group-flush">
              <div v-if="rejectedInvoices.length === 0" class="text-center text-muted py-4">
                差戻し済みの請求書はありません
              </div>
              <button
                v-for="invoice in rejectedInvoices"
                :key="invoice.id"
                class="list-group-item list-group-item-action"
                :class="{ active: selectedInvoice?.id === invoice.id }"
                @click="selectInvoice(invoice)"
                :data-cy="`rejected-invoice-${invoice.id}`"
              >
                <div class="d-flex justify-content-between align-items-start">
                  <div class="flex-grow-1">
                    <h6 class="mb-1">{{ invoice.invoice_no }}</h6>
                    <p class="mb-1 text-muted small">{{ invoice.partner_name }}</p>
                    <small>{{ formatDateRange(invoice.period_start, invoice.period_end) }}</small>
                  </div>
                  <div class="text-end">
                    <div class="fw-bold">{{ formatCurrency(invoice.total) }}</div>
                    <span :class="getStatusBadgeClass(invoice.status)" class="small">
                      {{ getStatusDisplay(invoice.status) }}
                    </span>
                  </div>
                </div>
              </button>
            </div>

            <!-- 完了済みリスト -->
            <div v-if="activeTab === 'completed'" class="list-group list-group-flush">
              <div v-if="completedInvoices.length === 0" class="text-center text-muted py-4">
                完了済みの請求書はありません
              </div>
              <button
                v-for="invoice in completedInvoices"
                :key="invoice.id"
                class="list-group-item list-group-item-action"
                :class="{ active: selectedInvoice?.id === invoice.id }"
                @click="selectInvoice(invoice)"
                :data-cy="`completed-invoice-${invoice.id}`"
              >
                <div class="d-flex justify-content-between align-items-start">
                  <div class="flex-grow-1">
                    <h6 class="mb-1">{{ invoice.invoice_no }}</h6>
                    <p class="mb-1 text-muted small">{{ invoice.partner_name }}</p>
                    <small>{{ formatDateRange(invoice.period_start, invoice.period_end) }}</small>
                  </div>
                  <div class="text-end">
                    <div class="fw-bold">{{ formatCurrency(invoice.total) }}</div>
                    <span :class="getStatusBadgeClass(invoice.status)" class="small">
                      {{ getStatusDisplay(invoice.status) }}
                    </span>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 右側: 詳細・承認操作 -->
      <div class="col-md-7">
        <div v-if="!selectedInvoice" class="card h-100">
          <div class="card-body d-flex align-items-center justify-content-center">
            <div class="text-center text-muted">
              <i class="fas fa-clipboard-list fa-3x mb-3"></i>
              <p>左から請求書を選択してください</p>
            </div>
          </div>
        </div>

        <div v-if="selectedInvoice" class="card h-100">
          <!-- 詳細ヘッダー -->
          <div class="card-header">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <h5 class="mb-1">{{ selectedInvoice.invoice_no }}</h5>
                <small class="text-muted">{{ selectedInvoice.partner_name }}</small>
              </div>
              <div class="btn-group">
                <router-link 
                  :to="`/invoices/${selectedInvoice.id}`"
                  class="btn btn-sm btn-outline-primary"
                  title="詳細画面へ"
                  data-cy="view-detail-btn"
                >
                  <i class="fas fa-external-link-alt"></i>
                </router-link>
                <button 
                  class="btn btn-sm btn-outline-success" 
                  @click="downloadPdf(selectedInvoice.id, selectedInvoice.invoice_no)"
                  :disabled="pdfLoading"
                  title="PDF"
                  data-cy="download-pdf-btn"
                >
                  <i class="fas fa-file-pdf"></i>
                </button>
              </div>
            </div>
          </div>

          <div class="card-body">
            <!-- 基本情報 -->
            <div class="row mb-4">
              <div class="col-sm-6">
                <h6 class="text-muted">期間</h6>
                <p>{{ formatDateRange(selectedInvoice.period_start, selectedInvoice.period_end) }}</p>
              </div>
              <div class="col-sm-6">
                <h6 class="text-muted">ステータス</h6>
                <p>
                  <span :class="getStatusBadgeClass(selectedInvoice.status)">
                    {{ getStatusDisplay(selectedInvoice.status) }}
                  </span>
                </p>
              </div>
              <div class="col-sm-6">
                <h6 class="text-muted">請求金額</h6>
                <p class="fs-5 fw-bold text-primary">{{ formatCurrency(selectedInvoice.total) }}</p>
              </div>
              <div class="col-sm-6">
                <h6 class="text-muted">明細件数</h6>
                <p>{{ selectedInvoice.item_count }}件</p>
              </div>
            </div>

            <!-- 承認操作 -->
            <div v-if="canPerformActions(selectedInvoice)" class="mb-4">
              <h6 class="text-muted">操作</h6>
              <div class="btn-group w-100">
                <button 
                  v-if="canApprove(selectedInvoice)" 
                  class="btn btn-success" 
                  @click="approveInvoice(selectedInvoice.id)"
                  :disabled="actionLoading"
                  data-cy="approve-btn"
                >
                  <i class="fas fa-check me-1"></i>
                  承認
                </button>
                
                <button 
                  v-if="canReject(selectedInvoice)" 
                  class="btn btn-danger" 
                  @click="openRejectModal(selectedInvoice.id)"
                  :disabled="actionLoading"
                  data-cy="reject-btn"
                >
                  <i class="fas fa-times me-1"></i>
                  差戻し
                </button>
                
                <button 
                  v-if="canReopen(selectedInvoice)" 
                  class="btn btn-warning" 
                  @click="reopenInvoice(selectedInvoice.id)"
                  :disabled="actionLoading"
                  data-cy="reopen-btn"
                >
                  <i class="fas fa-undo me-1"></i>
                  再申請
                </button>
              </div>
            </div>

            <!-- 承認履歴 -->
            <div v-if="selectedInvoiceDetail?.approvals?.length">
              <h6 class="text-muted">承認履歴</h6>
              <div class="timeline">
                <div 
                  v-for="approval in selectedInvoiceDetail.approvals" 
                  :key="approval.id"
                  class="timeline-item"
                >
                  <div class="timeline-marker" :class="getApprovalMarkerClass(approval.action)"></div>
                  <div class="timeline-content">
                    <div class="d-flex justify-content-between align-items-start">
                      <div>
                        <h6 class="mb-1">{{ getActionDisplay(approval.action) }}</h6>
                        <small class="text-muted">{{ approval.approver_email }}</small>
                      </div>
                      <small class="text-muted">{{ formatDateTime(approval.approved_at) }}</small>
                    </div>
                    <p v-if="approval.comment" class="mb-0 mt-2 text-break">
                      {{ approval.comment }}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- 明細サマリー -->
            <div v-if="selectedInvoiceDetail?.items?.length" class="mt-4">
              <h6 class="text-muted">明細サマリー</h6>
              <div class="table-responsive">
                <table class="table table-sm">
                  <thead class="table-light">
                    <tr>
                      <th>内容</th>
                      <th class="text-end">数量</th>
                      <th class="text-end">金額</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="item in selectedInvoiceDetail.items.slice(0, 5)" :key="item.id">
                      <td>{{ item.description }}</td>
                      <td class="text-end">{{ item.quantity }} {{ getUnitDisplay(item.unit) }}</td>
                      <td class="text-end">{{ formatCurrency(item.amount) }}</td>
                    </tr>
                    <tr v-if="selectedInvoiceDetail.items.length > 5">
                      <td colspan="3" class="text-center text-muted">
                        ...他{{ selectedInvoiceDetail.items.length - 5 }}件
                      </td>
                    </tr>
                  </tbody>
                </table>
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
import { ref, computed, onMounted, watch } from 'vue'
import { 
  StatusDisplayMap,
  StatusColorMap,
  UnitDisplayMap,
  type InvoiceResponse,
  type InvoiceDetailResponse 
} from '../../lib/schemas/invoice'

// リアクティブデータ
const loading = ref(false)
const error = ref<string | null>(null)
const invoices = ref<InvoiceResponse[]>([])
const selectedInvoice = ref<InvoiceResponse | null>(null)
const selectedInvoiceDetail = ref<InvoiceDetailResponse | null>(null)
const activeTab = ref<'pending' | 'rejected' | 'completed'>('pending')
const actionLoading = ref(false)
const pdfLoading = ref(false)
const rejectComment = ref('')
const rejectModal = ref<HTMLElement | null>(null)
const currentRejectInvoiceId = ref<string>('')

// 計算プロパティ
const pendingInvoices = computed(() => 
  invoices.value.filter(inv => ['Submitted', 'Approved'].includes(inv.status))
)

const rejectedInvoices = computed(() => 
  invoices.value.filter(inv => inv.status === 'Rejected')
)

const completedInvoices = computed(() => 
  invoices.value.filter(inv => ['Invoiced', 'Paid'].includes(inv.status))
)

const pendingCount = computed(() => pendingInvoices.value.length)

// メソッド
async function fetchInvoices() {
  loading.value = true
  error.value = null
  
  try {
    // 承認関連のステータスのみ取得
    const statuses = ['Submitted', 'Approved', 'Rejected', 'Invoiced', 'Paid']
    const promises = statuses.map(async (status) => {
      const response = await fetch(`/api/invoices?status=${status}&limit=50`, {
        headers: {
          'x-user-role': 'Manager',
          'x-user-email': 'manager@example.com'
        }
      })
      
      if (!response.ok) {
        throw new Error(`請求書の取得に失敗しました: ${response.status}`)
      }
      
      const data = await response.json()
      return data.data || []
    })
    
    const results = await Promise.all(promises)
    invoices.value = results.flat()
    
  } catch (err) {
    error.value = err instanceof Error ? err.message : '請求書の取得に失敗しました'
    console.error('請求書取得エラー:', err)
  } finally {
    loading.value = false
  }
}

async function selectInvoice(invoice: InvoiceResponse) {
  selectedInvoice.value = invoice
  
  try {
    // 詳細情報を取得
    const response = await fetch(`/api/invoices/${invoice.id}`, {
      headers: {
        'x-user-role': 'Manager',
        'x-user-email': 'manager@example.com'
      }
    })
    
    if (response.ok) {
      selectedInvoiceDetail.value = await response.json()
    }
  } catch (err) {
    console.error('詳細取得エラー:', err)
  }
}

async function approveInvoice(id: string) {
  actionLoading.value = true
  try {
    const response = await fetch(`/api/invoices/${id}/approve`, {
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
    
    // データを再読み込み
    await fetchInvoices()
    
    // 選択中の請求書も更新
    if (selectedInvoice.value?.id === id) {
      await selectInvoice(selectedInvoice.value)
    }
    
  } catch (err) {
    error.value = err instanceof Error ? err.message : '承認に失敗しました'
  } finally {
    actionLoading.value = false
  }
}

function openRejectModal(id: string) {
  currentRejectInvoiceId.value = id
  const modal = new (window as any).bootstrap.Modal(rejectModal.value)
  modal.show()
}

async function rejectInvoice() {
  if (!currentRejectInvoiceId.value || !rejectComment.value.trim()) return
  
  actionLoading.value = true
  try {
    const response = await fetch(`/api/invoices/${currentRejectInvoiceId.value}/reject`, {
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
    currentRejectInvoiceId.value = ''
    
    // データを再読み込み
    await fetchInvoices()
    
    // 選択中の請求書も更新
    if (selectedInvoice.value?.id === currentRejectInvoiceId.value) {
      await selectInvoice(selectedInvoice.value)
    }
    
  } catch (err) {
    error.value = err instanceof Error ? err.message : '差戻しに失敗しました'
  } finally {
    actionLoading.value = false
  }
}

async function reopenInvoice(id: string) {
  actionLoading.value = true
  try {
    const response = await fetch(`/api/invoices/${id}/reopen`, {
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
    
    // データを再読み込み
    await fetchInvoices()
    
    // 選択中の請求書も更新
    if (selectedInvoice.value?.id === id) {
      await selectInvoice(selectedInvoice.value)
    }
    
  } catch (err) {
    error.value = err instanceof Error ? err.message : '再申請に失敗しました'
  } finally {
    actionLoading.value = false
  }
}

async function downloadPdf(id: string, invoiceNo: string) {
  pdfLoading.value = true
  try {
    const response = await fetch(`/api/invoices/${id}/pdf`, {
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
    a.download = `${invoiceNo}.pdf`
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

// 権限チェック関数
function canPerformActions(invoice: InvoiceResponse): boolean {
  const userRole = 'Manager' // TODO: 実際の認証から取得
  return ['Admin', 'Manager'].includes(userRole)
}

function canApprove(invoice: InvoiceResponse): boolean {
  return ['Submitted', 'Approved'].includes(invoice.status)
}

function canReject(invoice: InvoiceResponse): boolean {
  return ['Submitted', 'Approved'].includes(invoice.status)
}

function canReopen(invoice: InvoiceResponse): boolean {
  return invoice.status === 'Rejected'
}

// ユーティリティ関数
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(amount)
}

function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })
  const endDate = new Date(end).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })
  return `${startDate} ～ ${endDate}`
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('ja-JP')
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

function getApprovalMarkerClass(action: string): string {
  const classMap = {
    approve: 'bg-success',
    reject: 'bg-danger',
    request_change: 'bg-warning',
    submit: 'bg-primary'
  }
  return classMap[action as keyof typeof classMap] || 'bg-secondary'
}

// ライフサイクル
onMounted(() => {
  fetchInvoices()
})

// ウォッチャー
watch(activeTab, () => {
  // タブ切り替え時に選択をクリア
  selectedInvoice.value = null
  selectedInvoiceDetail.value = null
})
</script>

<style scoped>
.approvals-page {
  max-width: 1400px;
}

.list-group-item.active {
  background-color: var(--bs-primary);
  border-color: var(--bs-primary);
}

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
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow: 0 0 0 2px var(--bs-border-color);
}

.timeline-item:before {
  content: '';
  position: absolute;
  left: 5px;
  top: 12px;
  bottom: -1.5rem;
  width: 2px;
  background-color: var(--bs-border-color);
}

.timeline-item:last-child:before {
  display: none;
}

.timeline-content {
  min-height: 2rem;
}

@media (max-width: 768px) {
  .col-md-5, .col-md-7 {
    margin-bottom: 1rem;
  }
  
  .card.h-100 {
    height: auto !important;
  }
}
</style>