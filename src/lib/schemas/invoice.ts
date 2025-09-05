import { z } from 'zod'

// 請求書明細のZodスキーマ
export const InvoiceItemSchema = z.object({
  id: z.string().optional(),
  delivery_date: z.string().optional(),
  description: z.string().min(1, '内容は必須です'),
  quantity: z.coerce.number().min(0, '数量は0以上である必要があります'),
  unit: z.enum(['stop', 'km', 'hour', 'other'], { 
    errorMap: () => ({ message: '有効な単位を選択してください' })
  }),
  unit_price: z.coerce.number().min(0, '単価は0以上である必要があります'),
  amount: z.coerce.number().min(0, '金額は0以上である必要があります').optional(),
  is_overtime: z.boolean().optional(),
  is_special: z.boolean().optional(),
  vehicle_no: z.string().optional(),
  driver_name: z.string().optional(),
  memo: z.string().optional()
})

// 請求書作成・更新のZodスキーマ
export const InvoiceCreateSchema = z.object({
  partner_id: z.string().min(1, '取引先を選択してください'),
  period_start: z.string().min(1, '期間開始日は必須です'),
  period_end: z.string().min(1, '期間終了日は必須です'),
  rate_card_id: z.string().optional(),
  memo: z.string().optional(),
  items: z.array(InvoiceItemSchema).min(1, '明細を1件以上入力してください')
})

export const InvoiceUpdateSchema = z.object({
  partner_id: z.string().optional(),
  period_start: z.string().optional(), 
  period_end: z.string().optional(),
  rate_card_id: z.string().optional(),
  memo: z.string().optional()
})

// 承認アクションのZodスキーマ
export const ApprovalActionSchema = z.object({
  action: z.enum(['approve', 'reject', 'request_change'], {
    errorMap: () => ({ message: '有効なアクションを選択してください' })
  }),
  comment: z.string().optional(),
  approver_role: z.enum(['field', 'manager', 'accounting']).optional()
})

// フィルタ用のZodスキーマ
export const InvoiceFilterSchema = z.object({
  page: z.coerce.number().min(1).optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  status: z.enum(['Draft', 'Submitted', 'Approved', 'Invoiced', 'Paid', 'Rejected']).optional(),
  partner_id: z.string().optional(),
  period_start: z.string().optional(),
  period_end: z.string().optional()
})

// TypeScript型定義
export type InvoiceItem = z.infer<typeof InvoiceItemSchema>
export type InvoiceCreate = z.infer<typeof InvoiceCreateSchema>
export type InvoiceUpdate = z.infer<typeof InvoiceUpdateSchema>
export type ApprovalAction = z.infer<typeof ApprovalActionSchema>
export type InvoiceFilter = z.infer<typeof InvoiceFilterSchema>

// API レスポンス型
export interface InvoiceResponse {
  id: string
  invoice_no: string
  partner_name: string
  billing_code?: string
  period_start: string
  period_end: string
  status: string
  subtotal: number
  tax: number
  total: number
  currency: string
  item_count: number
  total_stops?: number
  total_km?: number
  total_hours?: number
  created_at: string
  updated_at: string
}

export interface InvoiceDetailResponse extends InvoiceResponse {
  partner_id: string
  partner_email?: string
  partner_phone?: string
  partner_address?: string
  partner_contact_person?: string
  rate_card_id?: string
  payment_due_date?: string
  memo?: string
  created_by?: string
  approved_by?: string
  approved_at?: string
  items: InvoiceItem[]
  approvals: ApprovalEvent[]
}

export interface ApprovalEvent {
  id: string
  approver_role: string
  approver_email: string
  action: string
  comment?: string
  previous_status?: string
  new_status?: string
  approved_at: string
}

export interface Partner {
  id: string
  name: string
  billing_code?: string
  email?: string
  phone?: string
  address?: string
  contact_person?: string
  payment_terms?: number
  closing_day?: number
  is_active: boolean
}

// 単位の表示名マッピング
export const UnitDisplayMap = {
  stop: '件',
  km: 'km', 
  hour: '時間',
  other: 'その他'
} as const

// ステータスの表示名マッピング  
export const StatusDisplayMap = {
  Draft: '下書き',
  Submitted: '承認待ち',
  Approved: '承認済み',
  Invoiced: '請求済み',
  Paid: '入金済み',
  Rejected: '差戻し'
} as const

// ステータスの色分けマッピング
export const StatusColorMap = {
  Draft: 'warning',
  Submitted: 'primary', 
  Approved: 'success',
  Invoiced: 'info',
  Paid: 'success',
  Rejected: 'danger'
} as const