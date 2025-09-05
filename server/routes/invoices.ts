import express from 'express'
import { createClient } from '@supabase/supabase-js'
import * as Sentry from '@sentry/node'
import * as client from 'prom-client'
import { v4 as uuidv4 } from 'uuid'
import { renderInvoice, generateInvoiceFilename, type InvoiceData } from '../../src/templates/invoice.js'

// TypeScript型定義
interface InvoiceRequest {
  partner_id: string
  period_start: string
  period_end: string
  rate_card_id?: string
  memo?: string
  items?: InvoiceItemRequest[]
}

interface InvoiceItemRequest {
  delivery_date?: string
  description: string
  quantity: number
  unit: 'stop' | 'km' | 'hour' | 'other'
  unit_price?: number
  amount?: number
  is_overtime?: boolean
  is_special?: boolean
  vehicle_no?: string
  driver_name?: string
  memo?: string
}

interface ApprovalRequest {
  action: 'approve' | 'reject' | 'request_change'
  comment?: string
  approver_role: 'field' | 'manager' | 'accounting'
}

// Supabase接続（環境変数から）
const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables for invoices API')
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// Prometheusメトリクス
const register = new client.Registry()

const invoiceRequests = new client.Counter({
  name: 'invoice_requests_total',
  help: 'Total invoice API requests',
  registers: [register],
  labelNames: ['route', 'method', 'status']
})

const invoiceDuration = new client.Histogram({
  name: 'invoice_duration_seconds',
  help: 'Invoice operation duration in seconds',
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [register],
  labelNames: ['operation']
})

const approvalEvents = new client.Counter({
  name: 'approval_events_total',
  help: 'Total approval events',
  registers: [register],
  labelNames: ['action', 'role']
})

// パフォーマンス計測ヘルパー
function startTimer(operation: string, requestId: string, metadata?: Record<string, any>) {
  const start = Date.now()
  
  console.log(JSON.stringify({
    ts: Date.now(),
    level: 'info',
    requestId,
    operation,
    msg: 'started',
    ...metadata
  }))
  
  if (process.env.SENTRY_DSN) {
    Sentry.addBreadcrumb({
      message: `${operation} started`,
      category: 'invoice_api',
      data: { requestId, ...metadata },
      level: 'info'
    })
    Sentry.setTag('operation', operation)
  }
  
  return () => {
    const duration = (Date.now() - start) / 1000
    invoiceDuration.observe({ operation }, duration)
    
    console.log(JSON.stringify({
      ts: Date.now(),
      level: 'info',
      requestId,
      operation,
      msg: 'completed',
      duration: duration * 1000,
      durationMs: `${duration * 1000}ms`
    }))
  }
}

// RBAC認証ミドルウェア
function requireRole(allowedRoles: string[]) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // TODO: 実際の認証システムと連携
    // 現在はヘッダーからロールを取得（開発用）
    const userRole = req.headers['x-user-role'] as string || 'Driver'
    const userEmail = req.headers['x-user-email'] as string || 'unknown@example.com'
    
    if (!allowedRoles.includes(userRole)) {
      console.log(JSON.stringify({
        ts: Date.now(),
        level: 'warning',
        requestId: req.requestId,
        msg: 'access_denied',
        userRole,
        requiredRoles: allowedRoles,
        path: req.path
      }))
      
      invoiceRequests.inc({ 
        route: req.route?.path || req.path, 
        method: req.method, 
        status: 'forbidden' 
      })
      
      return res.status(403).json({
        error: 'Insufficient privileges',
        code: 'ACCESS_DENIED',
        required: allowedRoles,
        current: userRole
      })
    }
    
    // リクエストにユーザー情報を付与
    req.user = { role: userRole, email: userEmail }
    next()
  }
}

// 監査ログ記録ヘルパー
async function recordAuditLog(
  tableName: string, 
  recordId: string, 
  operation: 'INSERT' | 'UPDATE' | 'DELETE',
  oldValues: any,
  newValues: any,
  changedBy: string,
  requestId: string
) {
  try {
    await supabase.from('audit_logs').insert({
      table_name: tableName,
      record_id: recordId,
      operation,
      old_values: oldValues,
      new_values: newValues,
      changed_by: changedBy,
      request_id: requestId,
      changed_at: new Date().toISOString()
    })
  } catch (error) {
    console.error('Audit log failed:', error)
    // 監査ログ失敗は業務継続を妨げない
  }
}

// 請求書番号生成
function generateInvoiceNumber(partnerCode: string): string {
  const date = new Date()
  const year = date.getFullYear().toString().slice(-2)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
  return `INV-${partnerCode}-${year}${month}-${randomSuffix}`
}

const router = express.Router()

// GET /api/invoices - 請求書一覧
router.get('/', requireRole(['Admin', 'Manager', 'Driver']), async (req, res) => {
  const endTimer = startTimer('invoice_list', req.requestId, {
    query: req.query
  })
  
  try {
    const { page = 1, limit = 20, status, partner_id } = req.query
    const offset = (Number(page) - 1) * Number(limit)
    
    let query = supabase
      .from('v_invoice_totals')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + Number(limit) - 1)
    
    if (status) {
      query = query.eq('status', status)
    }
    
    if (partner_id) {
      query = query.eq('partner_id', partner_id)
    }
    
    // Driverロールは自分が作成したもののみ閲覧可能
    if (req.user?.role === 'Driver') {
      query = query.eq('created_by', req.user.email)
    }
    
    const { data, error, count } = await query
    
    if (error) throw error
    
    invoiceRequests.inc({ 
      route: '/invoices', 
      method: 'GET', 
      status: 'ok' 
    })
    
    res.json({
      data,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: count || 0,
        totalPages: Math.ceil((count || 0) / Number(limit))
      }
    })
    
  } catch (error) {
    console.error('Invoice list error:', error)
    
    invoiceRequests.inc({ 
      route: '/invoices', 
      method: 'GET', 
      status: 'error' 
    })
    
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(error, {
        tags: { operation: 'invoice_list', requestId: req.requestId }
      })
    }
    
    res.status(500).json({
      error: 'Failed to fetch invoices',
      code: 'FETCH_ERROR'
    })
  } finally {
    endTimer()
  }
})

// POST /api/invoices - 請求書作成
router.post('/', requireRole(['Manager', 'Admin']), async (req, res) => {
  const endTimer = startTimer('invoice_create', req.requestId, {
    partnerId: req.body.partner_id,
    itemCount: req.body.items?.length || 0
  })
  
  try {
    const requestData: InvoiceRequest = req.body
    
    // バリデーション
    if (!requestData.partner_id || !requestData.period_start || !requestData.period_end) {
      invoiceRequests.inc({ 
        route: '/invoices', 
        method: 'POST', 
        status: 'validation_error' 
      })
      
      return res.status(400).json({
        error: 'Missing required fields',
        code: 'VALIDATION_ERROR',
        required: ['partner_id', 'period_start', 'period_end']
      })
    }
    
    // 取引先情報取得
    const { data: partner, error: partnerError } = await supabase
      .from('partners')
      .select('*')
      .eq('id', requestData.partner_id)
      .single()
    
    if (partnerError || !partner) {
      return res.status(400).json({
        error: 'Partner not found',
        code: 'PARTNER_NOT_FOUND'
      })
    }
    
    // 有効な単価表取得
    let rateCardId = requestData.rate_card_id
    if (!rateCardId) {
      const { data: activeRateCard } = await supabase
        .rpc('fn_get_active_rate_card', { 
          p_partner_id: requestData.partner_id 
        })
      rateCardId = activeRateCard
    }
    
    // 請求書番号生成
    const invoiceNo = generateInvoiceNumber(partner.billing_code || 'UNK')
    
    // 請求書作成
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert({
        partner_id: requestData.partner_id,
        invoice_no: invoiceNo,
        period_start: requestData.period_start,
        period_end: requestData.period_end,
        rate_card_id: rateCardId,
        memo: requestData.memo,
        created_by: req.user?.email
      })
      .select()
      .single()
    
    if (invoiceError) throw invoiceError
    
    // 明細追加
    if (requestData.items && requestData.items.length > 0) {
      const items = requestData.items.map(item => ({
        invoice_id: invoice.id,
        delivery_date: item.delivery_date,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price || 0,
        amount: item.amount || (item.quantity * (item.unit_price || 0)),
        is_overtime: item.is_overtime || false,
        is_special: item.is_special || false,
        vehicle_no: item.vehicle_no,
        driver_name: item.driver_name,
        memo: item.memo
      }))
      
      const { error: itemsError } = await supabase
        .from('invoice_items')
        .insert(items)
      
      if (itemsError) throw itemsError
    }
    
    // 合計金額計算
    const { data: totals } = await supabase
      .rpc('fn_compute_invoice_total', { p_invoice_id: invoice.id })
    
    if (totals && totals.length > 0) {
      const { subtotal, tax, total } = totals[0]
      
      await supabase
        .from('invoices')
        .update({ subtotal, tax, total })
        .eq('id', invoice.id)
    }
    
    // 監査ログ記録
    await recordAuditLog(
      'invoices',
      invoice.id,
      'INSERT',
      null,
      { ...invoice, items: requestData.items },
      req.user?.email || 'system',
      req.requestId
    )
    
    invoiceRequests.inc({ 
      route: '/invoices', 
      method: 'POST', 
      status: 'ok' 
    })
    
    if (process.env.SENTRY_DSN) {
      Sentry.setTag('invoice_created', invoice.id)
    }
    
    res.status(201).json({
      id: invoice.id,
      invoice_no: invoice.invoice_no,
      status: invoice.status,
      subtotal: totals?.[0]?.subtotal || 0,
      tax: totals?.[0]?.tax || 0,
      total: totals?.[0]?.total || 0
    })
    
  } catch (error) {
    console.error('Invoice creation error:', error)
    
    invoiceRequests.inc({ 
      route: '/invoices', 
      method: 'POST', 
      status: 'error' 
    })
    
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(error, {
        tags: { operation: 'invoice_create', requestId: req.requestId }
      })
    }
    
    res.status(500).json({
      error: 'Failed to create invoice',
      code: 'CREATION_ERROR'
    })
  } finally {
    endTimer()
  }
})

// GET /api/invoices/:id - 請求書詳細
router.get('/:id', requireRole(['Admin', 'Manager', 'Driver']), async (req, res) => {
  const endTimer = startTimer('invoice_get', req.requestId, {
    invoiceId: req.params.id
  })
  
  try {
    let query = supabase
      .from('v_invoice_totals')
      .select('*')
      .eq('id', req.params.id)
    
    // Driverロールは自分が作成したもののみ閲覧可能
    if (req.user?.role === 'Driver') {
      query = query.eq('created_by', req.user.email)
    }
    
    const { data: invoice, error: invoiceError } = await query.single()
    
    if (invoiceError || !invoice) {
      return res.status(404).json({
        error: 'Invoice not found',
        code: 'NOT_FOUND'
      })
    }
    
    // 明細取得
    const { data: items, error: itemsError } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', req.params.id)
      .order('delivery_date', { ascending: true })
    
    if (itemsError) throw itemsError
    
    // 承認履歴取得
    const { data: approvals, error: approvalsError } = await supabase
      .from('approvals')
      .select('*')
      .eq('invoice_id', req.params.id)
      .order('approved_at', { ascending: true })
    
    if (approvalsError) throw approvalsError
    
    invoiceRequests.inc({ 
      route: '/invoices/:id', 
      method: 'GET', 
      status: 'ok' 
    })
    
    res.json({
      ...invoice,
      items,
      approvals
    })
    
  } catch (error) {
    console.error('Invoice get error:', error)
    
    invoiceRequests.inc({ 
      route: '/invoices/:id', 
      method: 'GET', 
      status: 'error' 
    })
    
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(error, {
        tags: { operation: 'invoice_get', requestId: req.requestId }
      })
    }
    
    res.status(500).json({
      error: 'Failed to fetch invoice',
      code: 'FETCH_ERROR'
    })
  } finally {
    endTimer()
  }
})

// PATCH /api/invoices/:id - 請求書更新
router.patch('/:id', requireRole(['Manager', 'Admin']), async (req, res) => {
  const endTimer = startTimer('invoice_update', req.requestId, {
    invoiceId: req.params.id
  })
  
  try {
    // 現在の請求書取得
    const { data: currentInvoice, error: getError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', req.params.id)
      .single()
    
    if (getError || !currentInvoice) {
      return res.status(404).json({
        error: 'Invoice not found',
        code: 'NOT_FOUND'
      })
    }
    
    // Draft状態のみ更新可能
    if (currentInvoice.status !== 'Draft') {
      return res.status(400).json({
        error: 'Only Draft invoices can be updated',
        code: 'INVALID_STATUS',
        current_status: currentInvoice.status
      })
    }
    
    // 更新可能フィールドのみ抽出
    const allowedFields = ['partner_id', 'period_start', 'period_end', 'rate_card_id', 'memo']
    const updateData: any = {}
    
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field]
      }
    }
    
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        error: 'No valid fields to update',
        code: 'NO_FIELDS'
      })
    }
    
    // 更新実行
    const { data: updatedInvoice, error: updateError } = await supabase
      .from('invoices')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single()
    
    if (updateError) throw updateError
    
    // 監査ログ記録
    await recordAuditLog(
      'invoices',
      req.params.id,
      'UPDATE',
      currentInvoice,
      updatedInvoice,
      req.user?.email || 'system',
      req.requestId
    )
    
    invoiceRequests.inc({ 
      route: '/invoices/:id', 
      method: 'PATCH', 
      status: 'ok' 
    })
    
    res.json(updatedInvoice)
    
  } catch (error) {
    console.error('Invoice update error:', error)
    
    invoiceRequests.inc({ 
      route: '/invoices/:id', 
      method: 'PATCH', 
      status: 'error' 
    })
    
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(error, {
        tags: { operation: 'invoice_update', requestId: req.requestId }
      })
    }
    
    res.status(500).json({
      error: 'Failed to update invoice',
      code: 'UPDATE_ERROR'
    })
  } finally {
    endTimer()
  }
})

// POST /api/invoices/:id/submit - 承認申請
router.post('/:id/submit', requireRole(['Manager', 'Admin']), async (req, res) => {
  const endTimer = startTimer('invoice_submit', req.requestId, {
    invoiceId: req.params.id
  })
  
  try {
    const { data: invoice, error: getError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', req.params.id)
      .single()
    
    if (getError || !invoice) {
      return res.status(404).json({
        error: 'Invoice not found',
        code: 'NOT_FOUND'
      })
    }
    
    if (invoice.status !== 'Draft') {
      return res.status(400).json({
        error: 'Only Draft invoices can be submitted',
        code: 'INVALID_STATUS',
        current_status: invoice.status
      })
    }
    
    // ステータス更新
    const { error: updateError } = await supabase
      .from('invoices')
      .update({ 
        status: 'Submitted',
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
    
    if (updateError) throw updateError
    
    // 承認イベント記録
    await supabase.from('approvals').insert({
      invoice_id: req.params.id,
      approver_role: 'field',
      approver_email: req.user?.email,
      action: 'approve',
      comment: req.body.comment,
      previous_status: 'Draft',
      new_status: 'Submitted'
    })
    
    approvalEvents.inc({ action: 'submit', role: 'field' })
    
    invoiceRequests.inc({ 
      route: '/invoices/:id/submit', 
      method: 'POST', 
      status: 'ok' 
    })
    
    res.json({
      message: 'Invoice submitted for approval',
      status: 'Submitted'
    })
    
  } catch (error) {
    console.error('Invoice submit error:', error)
    
    invoiceRequests.inc({ 
      route: '/invoices/:id/submit', 
      method: 'POST', 
      status: 'error' 
    })
    
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(error, {
        tags: { operation: 'invoice_submit', requestId: req.requestId }
      })
    }
    
    res.status(500).json({
      error: 'Failed to submit invoice',
      code: 'SUBMIT_ERROR'
    })
  } finally {
    endTimer()
  }
})

// POST /api/invoices/:id/approve - 承認
router.post('/:id/approve', requireRole(['Manager', 'Admin']), async (req, res) => {
  const endTimer = startTimer('invoice_approve', req.requestId, {
    invoiceId: req.params.id
  })
  
  try {
    const approvalData: ApprovalRequest = req.body
    
    const { data: invoice, error: getError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', req.params.id)
      .single()
    
    if (getError || !invoice) {
      return res.status(404).json({
        error: 'Invoice not found',
        code: 'NOT_FOUND'
      })
    }
    
    // 承認可能ステータスチェック
    const validTransitions = {
      'Submitted': 'Approved',
      'Approved': 'Invoiced'
    }
    
    if (!validTransitions[invoice.status as keyof typeof validTransitions]) {
      return res.status(400).json({
        error: 'Invalid status for approval',
        code: 'INVALID_STATUS',
        current_status: invoice.status
      })
    }
    
    const newStatus = validTransitions[invoice.status as keyof typeof validTransitions]
    
    // ステータス更新
    const updateData: any = { 
      status: newStatus,
      updated_at: new Date().toISOString()
    }
    
    if (newStatus === 'Approved') {
      updateData.approved_by = req.user?.email
      updateData.approved_at = new Date().toISOString()
    } else if (newStatus === 'Invoiced') {
      updateData.invoiced_at = new Date().toISOString()
    }
    
    const { error: updateError } = await supabase
      .from('invoices')
      .update(updateData)
      .eq('id', req.params.id)
    
    if (updateError) throw updateError
    
    // 承認イベント記録
    await supabase.from('approvals').insert({
      invoice_id: req.params.id,
      approver_role: approvalData.approver_role || 'manager',
      approver_email: req.user?.email,
      action: 'approve',
      comment: approvalData.comment,
      previous_status: invoice.status,
      new_status: newStatus
    })
    
    approvalEvents.inc({ 
      action: 'approve', 
      role: approvalData.approver_role || 'manager' 
    })
    
    invoiceRequests.inc({ 
      route: '/invoices/:id/approve', 
      method: 'POST', 
      status: 'ok' 
    })
    
    res.json({
      message: 'Invoice approved successfully',
      status: newStatus
    })
    
  } catch (error) {
    console.error('Invoice approve error:', error)
    
    invoiceRequests.inc({ 
      route: '/invoices/:id/approve', 
      method: 'POST', 
      status: 'error' 
    })
    
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(error, {
        tags: { operation: 'invoice_approve', requestId: req.requestId }
      })
    }
    
    res.status(500).json({
      error: 'Failed to approve invoice',
      code: 'APPROVE_ERROR'
    })
  } finally {
    endTimer()
  }
})

// POST /api/invoices/:id/reject - 差戻し
router.post('/:id/reject', requireRole(['Manager', 'Admin']), async (req, res) => {
  const endTimer = startTimer('invoice_reject', req.requestId, {
    invoiceId: req.params.id
  })
  
  try {
    const approvalData: ApprovalRequest = req.body
    
    if (!approvalData.comment) {
      return res.status(400).json({
        error: 'Comment is required for rejection',
        code: 'COMMENT_REQUIRED'
      })
    }
    
    const { data: invoice, error: getError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', req.params.id)
      .single()
    
    if (getError || !invoice) {
      return res.status(404).json({
        error: 'Invoice not found',
        code: 'NOT_FOUND'
      })
    }
    
    if (!['Submitted', 'Approved'].includes(invoice.status)) {
      return res.status(400).json({
        error: 'Invalid status for rejection',
        code: 'INVALID_STATUS',
        current_status: invoice.status
      })
    }
    
    // ステータスをRejectedに更新
    const { error: updateError } = await supabase
      .from('invoices')
      .update({ 
        status: 'Rejected',
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
    
    if (updateError) throw updateError
    
    // 承認イベント記録
    await supabase.from('approvals').insert({
      invoice_id: req.params.id,
      approver_role: approvalData.approver_role || 'manager',
      approver_email: req.user?.email,
      action: 'reject',
      comment: approvalData.comment,
      previous_status: invoice.status,
      new_status: 'Rejected'
    })
    
    approvalEvents.inc({ 
      action: 'reject', 
      role: approvalData.approver_role || 'manager' 
    })
    
    invoiceRequests.inc({ 
      route: '/invoices/:id/reject', 
      method: 'POST', 
      status: 'ok' 
    })
    
    res.json({
      message: 'Invoice rejected successfully',
      status: 'Rejected'
    })
    
  } catch (error) {
    console.error('Invoice reject error:', error)
    
    invoiceRequests.inc({ 
      route: '/invoices/:id/reject', 
      method: 'POST', 
      status: 'error' 
    })
    
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(error, {
        tags: { operation: 'invoice_reject', requestId: req.requestId }
      })
    }
    
    res.status(500).json({
      error: 'Failed to reject invoice',
      code: 'REJECT_ERROR'
    })
  } finally {
    endTimer()
  }
})

// POST /api/invoices/:id/reopen - 再申請
router.post('/:id/reopen', requireRole(['Manager', 'Admin']), async (req, res) => {
  const endTimer = startTimer('invoice_reopen', req.requestId, {
    invoiceId: req.params.id
  })
  
  try {
    const { data: invoice, error: getError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', req.params.id)
      .single()
    
    if (getError || !invoice) {
      return res.status(404).json({
        error: 'Invoice not found',
        code: 'NOT_FOUND'
      })
    }
    
    if (invoice.status !== 'Rejected') {
      return res.status(400).json({
        error: 'Only Rejected invoices can be reopened',
        code: 'INVALID_STATUS',
        current_status: invoice.status
      })
    }
    
    // ステータスをDraftに戻す
    const { error: updateError } = await supabase
      .from('invoices')
      .update({ 
        status: 'Draft',
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
    
    if (updateError) throw updateError
    
    // 承認イベント記録
    await supabase.from('approvals').insert({
      invoice_id: req.params.id,
      approver_role: 'field',
      approver_email: req.user?.email,
      action: 'request_change',
      comment: req.body.comment || 'Reopened for modification',
      previous_status: 'Rejected',
      new_status: 'Draft'
    })
    
    approvalEvents.inc({ action: 'reopen', role: 'field' })
    
    invoiceRequests.inc({ 
      route: '/invoices/:id/reopen', 
      method: 'POST', 
      status: 'ok' 
    })
    
    res.json({
      message: 'Invoice reopened for modification',
      status: 'Draft'
    })
    
  } catch (error) {
    console.error('Invoice reopen error:', error)
    
    invoiceRequests.inc({ 
      route: '/invoices/:id/reopen', 
      method: 'POST', 
      status: 'error' 
    })
    
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(error, {
        tags: { operation: 'invoice_reopen', requestId: req.requestId }
      })
    }
    
    res.status(500).json({
      error: 'Failed to reopen invoice',
      code: 'REOPEN_ERROR'
    })
  } finally {
    endTimer()
  }
})

// GET /api/invoices/:id/pdf - 請求書PDF生成（既存パイプライン委譲）
router.get('/:id/pdf', requireRole(['Admin', 'Manager', 'Driver']), async (req, res) => {
  const endTimer = startTimer('invoice_pdf', req.requestId, {
    invoiceId: req.params.id
  })
  
  try {
    // 請求書データ取得
    const { data: invoice, error: invoiceError } = await supabase
      .from('v_invoice_totals')
      .select('*')
      .eq('id', req.params.id)
      .single()
    
    if (invoiceError || !invoice) {
      return res.status(404).json({
        error: 'Invoice not found',
        code: 'NOT_FOUND'
      })
    }
    
    // 明細取得
    const { data: items, error: itemsError } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', req.params.id)
      .order('delivery_date', { ascending: true })
    
    if (itemsError) throw itemsError
    
    // 請求書テンプレート用データ変換
    const invoiceData: InvoiceData = {
      id: invoice.id,
      invoice_no: invoice.invoice_no,
      period_start: invoice.period_start,
      period_end: invoice.period_end,
      status: invoice.status,
      subtotal: invoice.subtotal || 0,
      tax: invoice.tax || 0,
      total: invoice.total || 0,
      currency: 'JPY',
      payment_due_date: invoice.payment_due_date,
      created_at: invoice.created_at,
      partner_name: invoice.partner_name,
      partner_billing_code: invoice.billing_code,
      partner_email: invoice.partner_email,
      partner_phone: invoice.partner_phone,
      partner_address: invoice.partner_address,
      partner_contact_person: invoice.partner_contact_person,
      items: items || [],
      item_count: invoice.item_count,
      total_stops: invoice.total_stops,
      total_km: invoice.total_km,
      total_hours: invoice.total_hours
    }
    
    // プロ仕様の請求書HTMLテンプレート生成
    const invoiceHtml = renderInvoice(invoiceData)
    
    // ファイル名生成
    const filename = generateInvoiceFilename(invoiceData)
    
    // 既存のPDF生成エンドポイントを内部的に呼び出し
    const pdfResponse = await fetch(`${req.protocol}://${req.get('Host')}/api/reports/pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': req.requestId
      },
      body: JSON.stringify({
        html: invoiceHtml,
        options: {
          format: 'A4',
          margin: {
            top: '2cm',
            right: '1cm',
            bottom: '2cm',
            left: '1cm'
          }
        }
      })
    })
    
    if (!pdfResponse.ok) {
      throw new Error('PDF generation failed')
    }
    
    const pdfBuffer = await pdfResponse.arrayBuffer()
    
    invoiceRequests.inc({ 
      route: '/invoices/:id/pdf', 
      method: 'GET', 
      status: 'ok' 
    })
    
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(Buffer.from(pdfBuffer))
    
  } catch (error) {
    console.error('Invoice PDF error:', error)
    
    invoiceRequests.inc({ 
      route: '/invoices/:id/pdf', 
      method: 'GET', 
      status: 'error' 
    })
    
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(error, {
        tags: { operation: 'invoice_pdf', requestId: req.requestId }
      })
    }
    
    res.status(500).json({
      error: 'Failed to generate invoice PDF',
      code: 'PDF_ERROR'
    })
  } finally {
    endTimer()
  }
})

// Express Requestへのuser情報付与の型定義
declare global {
  namespace Express {
    interface Request {
      user?: {
        role: string
        email: string
      }
    }
  }
}

export default router