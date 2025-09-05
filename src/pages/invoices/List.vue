<template>
  <div class="invoice-list">
    <!-- ヘッダー -->
    <div class="d-flex justify-content-between align-items-center mb-4">
      <h1 class="h3">請求書管理</h1>
      <router-link 
        to="/invoices/new" 
        class="btn btn-primary"
        v-if="canCreate"
        data-cy="create-invoice-btn"
      >
        <i class="fas fa-plus me-1"></i>
        新規作成
      </router-link>
    </div>

    <!-- フィルタ -->
    <div class="card mb-4">
      <div class="card-body">
        <h6 class="card-title">検索・フィルタ</h6>
        <form @submit.prevent="handleSearch" class="row g-3">
          <!-- 期間フィルタ -->
          <div class="col-md-3">
            <label class="form-label">期間（開始）</label>
            <input 
              type="date" 
              class="form-control"
              v-model="filters.period_start"
              data-cy="filter-period-start"
            />
          </div>
          <div class="col-md-3">
            <label class="form-label">期間（終了）</label>
            <input 
              type="date" 
              class="form-control"
              v-model="filters.period_end"
              data-cy="filter-period-end"
            />
          </div>

          <!-- ステータスフィルタ -->
          <div class="col-md-3">
            <label class="form-label">ステータス</label>
            <select class="form-select" v-model="filters.status" data-cy="filter-status">
              <option value="">全て</option>
              <option 
                v-for="(label, status) in statusOptions" 
                :key="status" 
                :value="status"
              >
                {{ label }}
              </option>
            </select>
          </div>

          <!-- 取引先フィルタ -->
          <div class="col-md-3">
            <label class="form-label">取引先</label>
            <select class="form-select" v-model="filters.partner_id" data-cy="filter-partner">
              <option value="">全て</option>
              <option 
                v-for="partner in partners" 
                :key="partner.id" 
                :value="partner.id"
              >
                {{ partner.name }}
              </option>
            </select>
          </div>

          <!-- 検索ボタン -->
          <div class="col-12">
            <button type="submit" class="btn btn-primary me-2" data-cy="search-btn">
              <i class="fas fa-search me-1"></i>
              検索
            </button>
            <button type="button" class="btn btn-outline-secondary" @click="clearFilters" data-cy="clear-filters-btn">
              <i class="fas fa-times me-1"></i>
              クリア
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ローディング -->
    <div v-if="loading" class="text-center py-4">
      <div class="spinner-border" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    </div>

    <!-- エラー表示 -->
    <div v-if="error" class="alert alert-danger">
      {{ error }}
    </div>

    <!-- 請求書一覧テーブル -->
    <div v-if="!loading && !error" class="card">
      <div class="card-body">
        <div class="table-responsive">
          <table class="table table-hover">
            <thead class="table-light">
              <tr>
                <th>請求書番号</th>
                <th>取引先</th>
                <th>期間</th>
                <th>金額</th>
                <th>ステータス</th>
                <th>作成日</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="invoices.length === 0">
                <td colspan="7" class="text-center text-muted py-4">
                  請求書が見つかりません
                </td>
              </tr>
              <tr 
                v-for="invoice in invoices" 
                :key="invoice.id"
                class="clickable-row"
                @click="goToDetail(invoice.id)"
              >
                <td>
                  <strong>{{ invoice.invoice_no }}</strong>
                </td>
                <td>
                  {{ invoice.partner_name }}
                  <small v-if="invoice.billing_code" class="text-muted d-block">
                    {{ invoice.billing_code }}
                  </small>
                </td>
                <td>
                  <small>{{ formatDateRange(invoice.period_start, invoice.period_end) }}</small>
                </td>
                <td class="text-end">
                  <strong>{{ formatCurrency(invoice.total) }}</strong>
                  <small class="text-muted d-block">
                    ({{ invoice.item_count || 0 }}件)
                  </small>
                </td>
                <td>
                  <span :class="getStatusBadgeClass(invoice.status)">
                    {{ getStatusDisplay(invoice.status) }}
                  </span>
                </td>
                <td>
                  <small>{{ formatDate(invoice.created_at) }}</small>
                </td>
                <td>
                  <div class="btn-group" role="group">
                    <button 
                      class="btn btn-sm btn-outline-primary" 
                      @click.stop="goToDetail(invoice.id)"
                      title="詳細"
                    >
                      <i class="fas fa-eye"></i>
                    </button>
                    <button 
                      class="btn btn-sm btn-outline-success" 
                      @click.stop="downloadPdf(invoice.id, invoice.invoice_no)"
                      title="PDF"
                    >
                      <i class="fas fa-file-pdf"></i>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- ページネーション -->
        <nav v-if="pagination.totalPages > 1" aria-label="請求書ページネーション">
          <ul class="pagination justify-content-center mt-4">
            <li class="page-item" :class="{ disabled: pagination.page <= 1 }">
              <button class="page-link" @click="changePage(pagination.page - 1)">
                前へ
              </button>
            </li>
            
            <li 
              v-for="page in visiblePages" 
              :key="page"
              class="page-item" 
              :class="{ active: page === pagination.page }"
            >
              <button class="page-link" @click="changePage(page)">
                {{ page }}
              </button>
            </li>
            
            <li class="page-item" :class="{ disabled: pagination.page >= pagination.totalPages }">
              <button class="page-link" @click="changePage(pagination.page + 1)">
                次へ
              </button>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { 
  InvoiceFilterSchema, 
  StatusDisplayMap, 
  StatusColorMap,
  type InvoiceFilter, 
  type InvoiceResponse,
  type Partner 
} from '../../lib/schemas/invoice'

const router = useRouter()

// リアクティブデータ
const loading = ref(false)
const error = ref<string | null>(null)
const invoices = ref<InvoiceResponse[]>([])
const partners = ref<Partner[]>([])

const filters = reactive<InvoiceFilter>({
  page: 1,
  limit: 20,
  status: '',
  partner_id: '',
  period_start: '',
  period_end: ''
})

const pagination = reactive({
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0
})

// 計算プロパティ
const statusOptions = computed(() => StatusDisplayMap)

const canCreate = computed(() => {
  // TODO: 実際のユーザー権限チェック
  const userRole = 'Manager' // ヘッダーから取得予定
  return ['Admin', 'Manager'].includes(userRole)
})

const visiblePages = computed(() => {
  const currentPage = pagination.page
  const totalPages = pagination.totalPages
  const pages: number[] = []
  
  // 最大5ページまで表示
  const maxVisible = 5
  let start = Math.max(1, currentPage - Math.floor(maxVisible / 2))
  let end = Math.min(totalPages, start + maxVisible - 1)
  
  // 終端調整
  if (end - start < maxVisible - 1) {
    start = Math.max(1, end - maxVisible + 1)
  }
  
  for (let i = start; i <= end; i++) {
    pages.push(i)
  }
  
  return pages
})

// メソッド
async function fetchInvoices() {
  loading.value = true
  error.value = null
  
  try {
    // フィルタのバリデーション
    const validatedFilters = InvoiceFilterSchema.parse(filters)
    
    // APIパラメータ構築
    const params = new URLSearchParams()
    
    Object.entries(validatedFilters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.append(key, String(value))
      }
    })
    
    const response = await fetch(`/api/invoices?${params}`, {
      headers: {
        'x-user-role': 'Manager', // TODO: 実際の認証から取得
        'x-user-email': 'manager@example.com'
      }
    })
    
    if (!response.ok) {
      throw new Error(`請求書の取得に失敗しました: ${response.status}`)
    }
    
    const data = await response.json()
    invoices.value = data.data || []
    
    // ページネーション情報更新
    if (data.pagination) {
      pagination.page = data.pagination.page
      pagination.limit = data.pagination.limit
      pagination.total = data.pagination.total
      pagination.totalPages = data.pagination.totalPages
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
    // const response = await fetch('/api/partners')
    // const data = await response.json()
    // partners.value = data.data || []
    
    // 開発用モックデータ
    partners.value = [
      { id: '1', name: 'ABC運輸株式会社', billing_code: 'ABC001', is_active: true },
      { id: '2', name: 'DEF物流', billing_code: 'DEF002', is_active: true },
      { id: '3', name: 'GHI配送サービス', billing_code: 'GHI003', is_active: true }
    ] as Partner[]
  } catch (err) {
    console.error('取引先取得エラー:', err)
  }
}

function handleSearch() {
  filters.page = 1
  fetchInvoices()
}

function clearFilters() {
  filters.page = 1
  filters.status = ''
  filters.partner_id = ''
  filters.period_start = ''
  filters.period_end = ''
  fetchInvoices()
}

function changePage(page: number) {
  if (page >= 1 && page <= pagination.totalPages) {
    filters.page = page
    fetchInvoices()
  }
}

function goToDetail(id: string) {
  router.push(`/invoices/${id}`)
}

async function downloadPdf(id: string, invoiceNo: string) {
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
    
    // PDF ダウンロード処理
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `invoice_${invoiceNo}.pdf`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
    
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'PDF生成に失敗しました'
    console.error('PDF生成エラー:', err)
  }
}

// ユーティリティ関数
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ja-JP', { 
    style: 'currency', 
    currency: 'JPY' 
  }).format(amount)
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('ja-JP')
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

// ライフサイクル
onMounted(() => {
  fetchInvoices()
  fetchPartners()
})

// ウォッチャー
watch(
  () => filters.page,
  () => fetchInvoices()
)
</script>

<style scoped>
.clickable-row {
  cursor: pointer;
}

.clickable-row:hover {
  background-color: var(--bs-table-hover-bg);
}

.invoice-list {
  max-width: 1200px;
}

@media (max-width: 768px) {
  .table-responsive {
    font-size: 0.9rem;
  }
  
  .btn-group .btn {
    padding: 0.25rem 0.5rem;
  }
}
</style>