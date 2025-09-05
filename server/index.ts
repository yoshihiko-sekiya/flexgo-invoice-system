import express from 'express'
import cors from 'cors'
import puppeteer from 'puppeteer'
import { createClient } from '@supabase/supabase-js'
import * as Sentry from '@sentry/node'
import dotenv from 'dotenv'
import { v4 as uuidv4 } from 'uuid'
import * as client from 'prom-client'
import invoiceRoutes from './routes/invoices.js'

// TypeScript型拡張 - Request にrequestId とuser プロパティを追加
declare global {
  namespace Express {
    interface Request {
      requestId: string
      user?: {
        role: string
        email: string
      }
    }
  }
}

// Load environment variables
dotenv.config()

// Initialize Sentry if DSN is provided
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1, // 10% of transactions for performance monitoring
    beforeSend: (event) => {
      // Don't send health check errors to reduce noise
      if (event.request?.url?.includes('/api/health')) {
        return null
      }
      return event
    }
  })
  console.log('📊 Sentry monitoring enabled')
} else {
  console.log('📊 Sentry monitoring disabled (no SENTRY_DSN provided)')
}

// Prometheus metrics setup
const register = new client.Registry()
client.collectDefaultMetrics({ register })

const pdfDuration = new client.Histogram({
  name: 'pdf_duration_seconds',
  help: 'PDF generation duration in seconds',
  buckets: [0.5, 1, 2, 3, 4, 6, 8],
  registers: [register]
})

const pdfRequests = new client.Counter({
  name: 'pdf_requests_total',
  help: 'Total PDF requests',
  registers: [register],
  labelNames: ['route', 'status']
})

const expiredUrlEncounters = new client.Counter({
  name: 'expired_signed_url_encounters_total',
  help: 'Total user encounters with expired signed URLs',
  registers: [register]
})

console.log('📈 Prometheus metrics enabled')

// Performance and error logging utilities
interface PerformanceMetrics {
  operation: string
  requestId: string
  startTime: number
  endTime?: number
  duration?: number
  success?: boolean
  error?: string
  metadata?: Record<string, any>
}

function startTimer(operation: string, requestId: string, metadata?: Record<string, any>): PerformanceMetrics {
  const metrics: PerformanceMetrics = {
    operation,
    requestId,
    startTime: Date.now(),
    metadata: metadata || {}
  }
  
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
      category: 'performance',
      data: { requestId, ...metadata },
      level: 'info'
    })
  }
  
  return metrics
}

function endTimer(metrics: PerformanceMetrics, success: boolean = true, error?: Error | string, additionalData?: Record<string, any>): void {
  metrics.endTime = Date.now()
  metrics.duration = metrics.endTime - metrics.startTime
  metrics.success = success
  
  if (error) {
    metrics.error = error instanceof Error ? error.message : error
  }
  
  const logData = {
    ts: Date.now(),
    level: success ? 'info' : 'error',
    requestId: metrics.requestId,
    operation: metrics.operation,
    msg: success ? 'completed' : 'failed',
    duration: metrics.duration,
    durationMs: `${metrics.duration}ms`,
    success: metrics.success,
    ...metrics.metadata,
    ...additionalData
  }
  
  if (error) {
    logData.error = metrics.error
  }
  
  console.log(JSON.stringify(logData))
  
  // Prometheus metrics for PDF operations
  if (metrics.operation.includes('pdf')) {
    const route = metrics.operation.includes('save') ? 'save' : 'download'
    const status = success ? 'ok' : 'fail'
    
    pdfDuration.observe(metrics.duration / 1000) // Convert ms to seconds
    pdfRequests.inc({ route, status })
  }
  
  if (!success && process.env.SENTRY_DSN && error) {
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: {
        operation: metrics.operation,
        requestId: metrics.requestId
      },
      extra: {
        duration: metrics.duration,
        ...metrics.metadata,
        ...additionalData
      }
    })
  }
  
  if (process.env.SENTRY_DSN) {
    Sentry.addBreadcrumb({
      message: `${metrics.operation} ${success ? 'completed' : 'failed'}`,
      category: 'performance', 
      data: {
        requestId: metrics.requestId,
        duration: metrics.duration,
        success,
        error: metrics.error,
        ...additionalData
      },
      level: success ? 'info' : 'error'
    })
  }
}

const app = express()
const PORT = process.env.API_PORT || 8787

// Supabase client for server-side operations
const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabaseBucket = process.env.SUPABASE_BUCKET || 'reports'
const signedUrlTTLHours = parseInt(process.env.SUPABASE_SIGNED_URL_TTL_HOURS || '168') // Default: 7 days

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

/* --- optional security middlewares --- */
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',').map(s => s.trim()).filter(Boolean)

// 本番セキュリティ判定フラグ
const isProd = process.env.NODE_ENV === 'production'
const securityRequired = isProd || process.env.SECURITY_REQUIRED === 'true'

// CORS健全性チェック（本番で * 禁止 / http 禁止）
const corsOk = !isProd || (
  allowedOrigins.length > 0 &&
  !allowedOrigins.some(o => o === '*' || o.startsWith('http://'))
)

// Chaos engineering - 期限切れ擬似発生（デバッグ用）
const chaosExpireEnabled = process.env.CHAOS_EXPIRE_ENABLED === 'true'

let helmetApplied = false
let rateLimitApplied = false

try {
  const { default: helmet } = await import('helmet')
  app.use(helmet({ contentSecurityPolicy: false }))
  helmetApplied = true
  console.log('🛡️  helmet セキュリティヘッダー適用')
} catch {
  console.warn('⚠️  helmet 未インストールのため無効化（本番は `npm i helmet` 推奨）')
}

try {
  const { default: rateLimit } = await import('express-rate-limit')
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX || 300),
    standardHeaders: true,
    legacyHeaders: false,
  }))
  rateLimitApplied = true
  console.log('🚦 express-rate-limit レート制限適用')
} catch {
  console.warn('⚠️  express-rate-limit 未インストールのため無効化（本番は `npm i express-rate-limit` 推奨）')
}

// CORS設定 - 環境変数からの許可オリジン
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}))

app.locals.security = { helmet: helmetApplied, rateLimit: rateLimitApplied, origins: allowedOrigins }

// Prometheusセキュリティメトリクス
let securityGauge
try {
  securityGauge = new client.Gauge({
    name: 'security_middlewares',
    help: '1 if security middleware is applied',
    labelNames: ['name'],
    registers: [register]
  })
  securityGauge.set({ name: 'helmet' }, helmetApplied ? 1 : 0)
  securityGauge.set({ name: 'rateLimit' }, rateLimitApplied ? 1 : 0)
} catch (error) {
  console.warn('⚠️  Security metrics registration failed:', error.message)
}

// JSON パース設定
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Request ID middleware - リクエスト識別・追跡用
app.use((req, res, next) => {
  const requestId = (req.headers['x-request-id'] as string) || uuidv4()
  req.requestId = requestId
  res.setHeader('x-request-id', requestId)
  
  console.log(JSON.stringify({ 
    ts: Date.now(), 
    level: 'info', 
    requestId, 
    msg: 'request', 
    path: req.path,
    method: req.method
  }))
  
  // Sentry scope にリクエストIDを設定
  if (process.env.SENTRY_DSN) {
    Sentry.configureScope((scope) => {
      scope.setTag('requestId', requestId)
      scope.setContext('request', {
        id: requestId,
        path: req.path,
        method: req.method
      })
    })
  }
  
  next()
})

// ヘルスチェックエンドポイント
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'mentor-lite-api'
  })
})

// セキュリティ診断エンドポイント
app.get('/health/security', (_req, res) => {
  res.json({ 
    ok: helmetApplied && rateLimitApplied, 
    ...app.locals.security 
  })
})

// Readiness probe エンドポイント - 依存関係の可用性を総合判定
app.get('/readyz', (_req, res) => {
  const deps = {
    securityOk: (!securityRequired) || (helmetApplied && rateLimitApplied),
    corsOk,
    sentryOk: true  // DSN有無は任意なのでtrue
  }
  const ready = Object.values(deps).every(Boolean)
  res.status(ready ? 200 : 503).json({ ready, deps })
})

// Chaos engineering - 期限切れ擬似発生エンドポイント（デバッグ用）
if (chaosExpireEnabled) {
  app.get('/debug/expired', (_req, res) => {
    res.status(403).type('text/plain').send('expired (chaos)')
  })
  
  app.head('/debug/expired', (_req, res) => {
    res.status(403).end()
  })
  
  console.log('🔥 Chaos expire endpoint enabled at /debug/expired')
}

// Prometheus メトリクスエンドポイント
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType)
    res.end(await register.metrics())
  } catch (error) {
    res.status(500).end(error)
  }
})

// Invoice API routes - 請求・承認機能
app.use('/api/invoices', invoiceRoutes)

// テレメトリーエンドポイント - 署名URL期限切れ遭遇報告
app.post('/api/telemetry/report-expired', async (req, res) => {
  try {
    const { timestamp, userAgent, url, requestId } = req.body
    
    // Prometheus カウンター増加
    expiredUrlEncounters.inc()
    
    // 構造化ログ出力
    console.log(JSON.stringify({
      ts: Date.now(),
      level: 'warning',
      requestId: req.requestId,
      originalRequestId: requestId,
      msg: 'expired_signed_url_encounter',
      userTimestamp: timestamp,
      userAgent,
      url,
      userRequestId: requestId
    }))
    
    // Sentry breadcrumb記録
    if (process.env.SENTRY_DSN) {
      Sentry.addBreadcrumb({
        message: 'User encountered expired signed URL',
        category: 'telemetry',
        data: {
          requestId: req.requestId,
          originalRequestId: requestId,
          userTimestamp: timestamp,
          userAgent,
          url
        },
        level: 'warning'
      })
    }
    
    res.json({ received: true, timestamp: Date.now() })
    
  } catch (error) {
    console.error('Telemetry error:', error)
    res.status(500).json({ error: 'Telemetry processing failed' })
  }
})

// PDF生成エンドポイント（ダウンロード）
app.post('/api/reports/pdf', async (req, res) => {
  const timer = startTimer('pdf_download', req.requestId, { 
    hasOptions: !!req.body.options,
    htmlLength: req.body.html?.length || 0
  })
  
  try {
    const { html, options = {} } = req.body

    if (!html) {
      endTimer(timer, false, 'Missing HTML content')
      return res.status(400).json({
        error: 'HTML content is required',
        code: 'MISSING_HTML'
      })
    }

    // Puppeteer設定（日本語フォント対応 + サーバー環境対応）
    const browser = await puppeteer.launch({
      headless: 'new', // 新しいheadlessモードを使用
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--font-render-hinting=none', // フォントレンダリング最適化
        '--disable-web-security' // CORS回避（開発環境用）
      ]
    })

    const page = await browser.newPage()
    
    // HTMLコンテンツを設定
    await page.setContent(html, {
      waitUntil: 'networkidle0'
    })

    // PDF生成オプション
    const pdfOptions = {
      format: 'A4' as const,
      printBackground: true,
      margin: {
        top: '1cm',
        right: '1cm',
        bottom: '1cm',
        left: '1cm'
      },
      ...options
    }

    // PDF生成
    const pdfBuffer = await page.pdf(pdfOptions)
    await browser.close()
    
    endTimer(timer, true, undefined, {
      pdfSize: `${(pdfBuffer.length / 1024).toFixed(1)}KB`,
      pdfSizeBytes: pdfBuffer.length,
      format: pdfOptions.format
    })

    // レスポンス設定
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="report.pdf"')
    res.setHeader('Content-Length', pdfBuffer.length)
    
    res.send(pdfBuffer)

  } catch (error) {
    endTimer(timer, false, error instanceof Error ? error : new Error(String(error)))
    
    res.status(500).json({
      error: 'PDF generation failed',
      code: 'PDF_GENERATION_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// 汎用PDF生成 & Storage保存エンドポイント
app.post('/api/pdf/save', async (req, res) => {
  const timer = startTimer('pdf_save', req.requestId, { 
    hasOptions: !!req.body.options,
    hasMetadata: !!req.body.metadata,
    htmlLength: req.body.html?.length || 0,
    type: req.body.type || 'report',
    identifier: req.body.metadata?.driverName || req.body.metadata?.invoiceNumber || req.body.metadata?.companyName || 'unknown'
  })
  
  try {
    const { html, type = 'report', options = {}, metadata = {} } = req.body

    if (!html) {
      endTimer(timer, false, 'Missing HTML content')
      return res.status(400).json({
        error: 'HTML content is required',
        code: 'MISSING_HTML'
      })
    }

    // Puppeteer設定（日本語フォント対応 + サーバー環境対応）
    const browser = await puppeteer.launch({
      headless: 'new', // 新しいheadlessモードを使用
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--font-render-hinting=none', // フォントレンダリング最適化
        '--disable-web-security' // CORS回避（開発環境用）
      ]
    })

    const page = await browser.newPage()
    
    // HTMLコンテンツを設定
    await page.setContent(html, {
      waitUntil: 'networkidle0'
    })

    // PDF生成オプション
    const pdfOptions = {
      format: 'A4' as const,
      printBackground: true,
      margin: {
        top: '1cm',
        right: '1cm',
        bottom: '1cm',
        left: '1cm'
      },
      ...options
    }

    // PDF生成
    const pdfBuffer = await page.pdf(pdfOptions)
    await browser.close()

    // ファイルパス生成（タイプ別）
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const date = now.toISOString().split('T')[0]
    
    let filename: string
    let folderPrefix: string
    
    if (type === 'invoice') {
      const invoiceNumber = metadata.invoiceNumber || 'unknown'
      const companyName = metadata.companyName || 'unknown'
      const sanitizedInvoice = invoiceNumber.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '_')
      const sanitizedCompany = companyName.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '_')
      filename = `invoice_${date}_${sanitizedInvoice}_${sanitizedCompany}.pdf`
      folderPrefix = 'invoices'
    } else {
      // Default: report type
      const driverName = metadata.driverName || 'unknown'
      const sanitizedDriver = driverName.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '_')
      filename = `delivery_report_${date}_${sanitizedDriver}.pdf`
      folderPrefix = 'reports'
    }
    
    const filePath = `${folderPrefix}/${year}/${month}/${filename}`

    // Supabase Storageにアップロード
    const { data, error } = await supabase.storage
      .from(supabaseBucket)
      .upload(filePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
        metadata: {
          ...metadata,
          generatedAt: now.toISOString(),
          filesize: pdfBuffer.length
        }
      })

    if (error) {
      console.error('Storage upload error:', error)
      return res.status(500).json({
        error: 'Storage upload failed',
        code: 'STORAGE_UPLOAD_ERROR',
        message: error.message
      })
    }

    // パブリックURLまたは署名付きURLを取得
    let fileUrl: string
    
    try {
      // まず公開URLを試す
      const { data: publicUrlData } = supabase.storage
        .from(supabaseBucket)
        .getPublicUrl(filePath)
      
      fileUrl = publicUrlData.publicUrl
      
      // 公開バケットでない場合は署名付きURLを生成（7日間有効）
      if (!fileUrl || fileUrl.includes('not-found')) {
        const { data: signedUrlData, error: urlError } = await supabase.storage
          .from(supabaseBucket)
          .createSignedUrl(filePath, signedUrlTTLHours * 60 * 60) // Configurable TTL
        
        if (urlError) throw urlError
        fileUrl = signedUrlData.signedUrl
      }
      
      // Chaos engineering - URL注入（デバッグ用）
      if (chaosExpireEnabled && req.query.chaos === '1') {
        fileUrl = `${req.protocol}://${req.get('Host')}/debug/expired`
        console.log('🔥 Chaos URL injection: replaced with /debug/expired')
      }
    } catch (urlError) {
      console.error('URL generation error:', urlError)
      return res.status(500).json({
        error: 'URL generation failed',
        code: 'URL_GENERATION_ERROR',
        message: urlError instanceof Error ? urlError.message : 'Unknown error'
      })
    }

    endTimer(timer, true, undefined, {
      pdfSize: `${(pdfBuffer.length / 1024).toFixed(1)}KB`,
      pdfSizeBytes: pdfBuffer.length,
      filename,
      storagePath: filePath,
      urlType: fileUrl.includes('sign') ? 'signed' : 'public'
    })
    
    // 成功レスポンス
    res.json({
      success: true,
      url: fileUrl,
      path: filePath,
      filename,
      metadata: {
        bucket: supabaseBucket,
        size: pdfBuffer.length,
        contentType: 'application/pdf',
        generatedAt: now.toISOString()
      }
    })

  } catch (error) {
    endTimer(timer, false, error instanceof Error ? error : new Error(String(error)))
    
    res.status(500).json({
      error: 'PDF save failed',
      code: 'PDF_SAVE_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// 後方互換性のため既存エンドポイントを維持（reportタイプに転送）
app.post('/api/reports/pdf/save', async (req, res) => {
  // 新しい汎用エンドポイントに転送
  req.body.type = 'report'
  
  // 内部的に汎用エンドポイントを呼び出し
  const timer = startTimer('pdf_save_legacy', req.requestId, { 
    hasOptions: !!req.body.options,
    hasMetadata: !!req.body.metadata,
    htmlLength: req.body.html?.length || 0,
    driverName: req.body.metadata?.driverName || 'unknown'
  })
  
  try {
    const { html, options = {}, metadata = {} } = req.body
    const type = 'report'

    if (!html) {
      endTimer(timer, false, 'Missing HTML content')
      return res.status(400).json({
        error: 'HTML content is required',
        code: 'MISSING_HTML'
      })
    }

    // Puppeteer設定（日本語フォント対応 + サーバー環境対応）
    const browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--font-render-hinting=none',
        '--disable-web-security'
      ]
    })

    const page = await browser.newPage()
    
    await page.setContent(html, {
      waitUntil: 'networkidle0'
    })

    const pdfOptions = {
      format: 'A4' as const,
      printBackground: true,
      margin: {
        top: '1cm',
        right: '1cm',
        bottom: '1cm',
        left: '1cm'
      },
      ...options
    }

    const pdfBuffer = await page.pdf(pdfOptions)
    await browser.close()

    // レポート形式のファイルパス生成
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const date = now.toISOString().split('T')[0]
    const driverName = metadata.driverName || 'unknown'
    const sanitizedDriver = driverName.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '_')
    const filename = `delivery_report_${date}_${sanitizedDriver}.pdf`
    const filePath = `reports/${year}/${month}/${filename}`

    const { data, error } = await supabase.storage
      .from(supabaseBucket)
      .upload(filePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
        metadata: {
          ...metadata,
          generatedAt: now.toISOString(),
          filesize: pdfBuffer.length
        }
      })

    if (error) {
      endTimer(timer, false, error)
      return res.status(500).json({
        error: 'Storage upload failed',
        code: 'STORAGE_UPLOAD_ERROR',
        message: error.message
      })
    }

    let fileUrl: string
    
    try {
      const { data: publicUrlData } = supabase.storage
        .from(supabaseBucket)
        .getPublicUrl(filePath)
      
      fileUrl = publicUrlData.publicUrl
      
      if (!fileUrl || fileUrl.includes('not-found')) {
        const { data: signedUrlData, error: urlError } = await supabase.storage
          .from(supabaseBucket)
          .createSignedUrl(filePath, signedUrlTTLHours * 60 * 60)
        
        if (urlError) throw urlError
        fileUrl = signedUrlData.signedUrl
      }
    } catch (urlError) {
      endTimer(timer, false, urlError instanceof Error ? urlError : new Error(String(urlError)))
      return res.status(500).json({
        error: 'URL generation failed',
        code: 'URL_GENERATION_ERROR',
        message: urlError instanceof Error ? urlError.message : 'Unknown error'
      })
    }

    endTimer(timer, true, undefined, {
      pdfSize: `${(pdfBuffer.length / 1024).toFixed(1)}KB`,
      pdfSizeBytes: pdfBuffer.length,
      filename,
      storagePath: filePath,
      urlType: fileUrl.includes('sign') ? 'signed' : 'public'
    })
    
    res.json({
      success: true,
      url: fileUrl,
      path: filePath,
      filename,
      metadata: {
        bucket: supabaseBucket,
        size: pdfBuffer.length,
        contentType: 'application/pdf',
        generatedAt: now.toISOString()
      }
    })

  } catch (error) {
    endTimer(timer, false, error instanceof Error ? error : new Error(String(error)))
    
    res.status(500).json({
      error: 'PDF save failed',
      code: 'PDF_SAVE_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// HTMLプレビューエンドポイント（デバッグ用）
app.post('/api/reports/preview', async (req, res) => {
  try {
    const { html } = req.body

    if (!html) {
      return res.status(400).json({
        error: 'HTML content is required'
      })
    }

    res.setHeader('Content-Type', 'text/html')
    res.send(html)

  } catch (error) {
    console.error('Preview error:', error)
    res.status(500).json({
      error: 'Preview generation failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// レポートテンプレート生成エンドポイント
app.get('/api/reports/template/:type', (req, res) => {
  const { type } = req.params
  
  const templates = {
    mentor: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Mentor Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .title { font-size: 24px; font-weight: bold; color: #333; }
          .subtitle { font-size: 16px; color: #666; margin-top: 10px; }
          .section { margin: 20px 0; }
          .section-title { font-size: 18px; font-weight: bold; margin-bottom: 10px; border-bottom: 2px solid #3880ff; padding-bottom: 5px; }
          .content { line-height: 1.6; }
          .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #999; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">Mentor Session Report</div>
          <div class="subtitle">Generated on {{date}}</div>
        </div>
        
        <div class="section">
          <div class="section-title">Session Details</div>
          <div class="content">
            <p><strong>Mentor:</strong> {{mentorName}}</p>
            <p><strong>Student:</strong> {{studentName}}</p>
            <p><strong>Date:</strong> {{sessionDate}}</p>
            <p><strong>Duration:</strong> {{duration}} minutes</p>
          </div>
        </div>
        
        <div class="section">
          <div class="section-title">Session Summary</div>
          <div class="content">
            {{summary}}
          </div>
        </div>
        
        <div class="section">
          <div class="section-title">Topics Covered</div>
          <div class="content">
            {{topics}}
          </div>
        </div>
        
        <div class="section">
          <div class="section-title">Next Steps</div>
          <div class="content">
            {{nextSteps}}
          </div>
        </div>
        
        <div class="footer">
          Generated by Mentor Lite - {{timestamp}}
        </div>
      </body>
      </html>
    `,
    
    vehicle: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Vehicle Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .title { font-size: 24px; font-weight: bold; color: #333; }
          .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          .table th, .table td { border: 1px solid #ddd; padding: 12px; text-align: left; }
          .table th { background-color: #f2f2f2; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">Vehicle Report</div>
        </div>
        
        <table class="table">
          <tr><th>Vehicle ID</th><td>{{vehicleId}}</td></tr>
          <tr><th>Model</th><td>{{model}}</td></tr>
          <tr><th>License Plate</th><td>{{licensePlate}}</td></tr>
          <tr><th>Status</th><td>{{status}}</td></tr>
        </table>
      </body>
      </html>
    `
  }

  const template = templates[type as keyof typeof templates]
  
  if (!template) {
    return res.status(404).json({
      error: 'Template not found',
      availableTypes: Object.keys(templates)
    })
  }

  res.json({
    type,
    template: template.trim(),
    placeholders: template.match(/\{\{[^}]+\}\}/g) || []
  })
})

// エラーハンドリングミドルウェア
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', error)
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  })
})

// 404ハンドラー
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.originalUrl
  })
})

// 本番でセキュリティ未適用なら fail-fast（環境変数で切替可）
if (securityRequired && (!helmetApplied || !rateLimitApplied)) {
  const failFast = process.env.SECURITY_FAIL_FAST !== 'false'
  console.error('❌ Security middleware missing under required mode. helmet=%s rateLimit=%s corsOk=%s',
    helmetApplied, rateLimitApplied, corsOk)
  if (failFast) {
    console.error('💀 Exiting due to security requirements (set SECURITY_FAIL_FAST=false to bypass)')
    process.exit(1)
  } else {
    console.warn('⚠️  Continuing with /readyz=503 due to SECURITY_FAIL_FAST=false')
  }
}

// サーバー起動
app.listen(PORT, () => {
  console.log(`🚀 Mentor API Server running at http://localhost:${PORT}`)
  console.log(`📋 Available endpoints:`)
  console.log(`   GET  /api/health - Health check`)
  console.log(`   GET  /health/security - Security middleware status`)
  console.log(`   GET  /readyz - Readiness probe (production dependencies)`)
  console.log(`   GET  /metrics - Prometheus metrics`)
  console.log(`   POST /api/telemetry/report-expired - Report expired signed URL encounters`)
  console.log(`   📋 Invoice & Approval APIs (RBAC enabled):`)
  console.log(`   GET  /api/invoices - List invoices (Admin/Manager/Driver)`)
  console.log(`   POST /api/invoices - Create invoice (Manager/Admin)`)
  console.log(`   GET  /api/invoices/:id - Get invoice details (Admin/Manager/Driver)`)
  console.log(`   PATCH /api/invoices/:id - Update invoice (Manager/Admin)`)
  console.log(`   POST /api/invoices/:id/submit - Submit for approval (Manager/Admin)`)
  console.log(`   POST /api/invoices/:id/approve - Approve invoice (Manager/Admin)`)
  console.log(`   POST /api/invoices/:id/reject - Reject invoice (Manager/Admin)`)
  console.log(`   POST /api/invoices/:id/reopen - Reopen rejected invoice (Manager/Admin)`)
  console.log(`   GET  /api/invoices/:id/pdf - Generate invoice PDF (Admin/Manager/Driver)`)
  console.log(`   📄 PDF Generation APIs:`)
  console.log(`   POST /api/reports/pdf - Generate PDF from HTML (download)`)
  console.log(`   POST /api/pdf/save - Generic PDF save to storage (type: report|invoice)`)
  console.log(`   POST /api/reports/pdf/save - Legacy report save (backward compatibility)`)
  console.log(`   POST /api/reports/preview - Preview HTML`)
  console.log(`   GET  /api/reports/template/:type - Get report templates`)
})

export default app