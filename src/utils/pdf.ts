/**
 * PDF生成ユーティリティ
 * FLEX GO標準 - API経由でPDFダウンロード機能
 */

// E2E環境検出
const isE2E = typeof window !== 'undefined' && (window as any).Cypress

export interface DownloadReportOptions {
  filename?: string
  mode?: 'download' | 'save'
  type?: 'report' | 'invoice' // Document type for generic API
  pdfOptions?: {
    format?: 'A4' | 'A3' | 'Letter'
    printBackground?: boolean
    margin?: {
      top?: string
      right?: string
      bottom?: string
      left?: string
    }
  }
  metadata?: {
    // Report specific
    driverName?: string
    date?: string
    deliveryCount?: number
    totalDistance?: number
    // Invoice specific
    invoiceNumber?: string
    companyName?: string
    total?: number
    issueDate?: string
    [key: string]: any
  }
}

export interface SaveReportResponse {
  success: boolean
  url: string
  path?: string
  filename?: string
  bytes?: number // E2E compatibility
  metadata?: {
    bucket: string
    size: number
    contentType: string
    generatedAt: string
  }
}

/**
 * HTMLからPDFレポートを生成してダウンロード
 * @param html - PDF生成用HTMLコンテンツ
 * @param options - ダウンロードオプション
 */
export async function downloadReport(
  html: string, 
  options: DownloadReportOptions = {}
): Promise<{ bytes?: number }> {
  try {
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787'
    
    // APIリクエスト実行
    const response = await fetch(`${apiBaseUrl}/api/reports/pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        html,
        options: options.pdfOptions || {}
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`PDF generation failed: ${response.status} - ${errorData.message || 'Unknown error'}`)
    }

    // Blobデータを取得
    const blob = await response.blob()
    
    // ★ E2E: 実DLはスキップ、メタだけ返す
    if (isE2E) {
      console.log('🧪 E2E Mode: PDF download skipped, returning metadata only')
      return { bytes: blob.size }
    }
    
    // ファイル名生成（YYYY-MM-DD形式）
    const today = new Date()
    const dateStr = today.toISOString().split('T')[0]
    const filename = options.filename || `report_${dateStr}.pdf`

    // ダウンロード実行
    const downloadUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = filename
    link.style.display = 'none'
    
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    // クリーンアップ
    URL.revokeObjectURL(downloadUrl)
    
    return { bytes: blob.size }
    
  } catch (error) {
    console.error('PDF download error:', error)
    throw error instanceof Error ? error : new Error('PDF download failed')
  }
}

/**
 * レポートテンプレートを取得
 * @param type - テンプレートタイプ ('mentor' | 'vehicle')
 */
export async function getReportTemplate(type: 'mentor' | 'vehicle'): Promise<{
  type: string
  template: string
  placeholders: string[]
}> {
  try {
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787'
    
    const response = await fetch(`${apiBaseUrl}/api/reports/template/${type}`)
    
    if (!response.ok) {
      throw new Error(`Template fetch failed: ${response.status}`)
    }
    
    return await response.json()
    
  } catch (error) {
    console.error('Template fetch error:', error)
    throw error instanceof Error ? error : new Error('Template fetch failed')
  }
}

/**
 * HTMLプレビュー（デバッグ用）
 * @param html - プレビュー用HTMLコンテンツ
 */
export async function previewReport(html: string): Promise<string> {
  try {
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787'
    
    const response = await fetch(`${apiBaseUrl}/api/reports/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ html })
    })

    if (!response.ok) {
      throw new Error(`Preview generation failed: ${response.status}`)
    }

    return await response.text()
    
  } catch (error) {
    console.error('Preview error:', error)
    throw error instanceof Error ? error : new Error('Preview generation failed')
  }
}

/**
 * HTMLからPDFレポートを生成してダウンロードまたは保存
 * @param html - PDF生成用HTMLコンテンツ
 * @param options - ダウンロード/保存オプション
 * @returns save モードの場合はレスポンス、download モードの場合は void
 */
export async function downloadOrSaveReport(
  html: string, 
  options: DownloadReportOptions = {}
): Promise<SaveReportResponse | { bytes?: number }> {
  const mode = options.mode || 'download'
  
  if (mode === 'save') {
    return await saveReportToStorage(html, options)
  } else {
    return await downloadReport(html, options)
  }
}

/**
 * HTMLからPDFを生成してSupabase Storageに保存
 * @param html - PDF生成用HTMLコンテンツ
 * @param options - 保存オプション
 */
export async function saveReportToStorage(
  html: string, 
  options: DownloadReportOptions = {}
): Promise<SaveReportResponse> {
  try {
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787'
    
    // APIリクエスト実行（汎用保存用エンドポイント）
    const response = await fetch(`${apiBaseUrl}/api/pdf/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        html,
        type: options.type || 'report',
        options: options.pdfOptions || {},
        metadata: options.metadata || {}
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      
      // 署名URL期限切れの可能性を検出して報告
      if (response.status === 403 || 
          (errorData.message && errorData.message.includes('expired')) ||
          (errorData.code && errorData.code === 'EXPIRED_SIGNED_URL')) {
        try {
          // 期限切れ遭遇を記録
          await reportExpiredSignedUrl(apiBaseUrl, response.headers.get('x-request-id'))
        } catch (telemetryError) {
          console.warn('Failed to report expired signed URL:', telemetryError)
        }
      }
      
      throw new Error(`PDF save failed: ${response.status} - ${errorData.message || 'Unknown error'}`)
    }

    const result: SaveReportResponse = await response.json()
    
    // ★ E2E: 実コピー/トーストはスキップ
    if (isE2E) {
      console.log('🧪 E2E Mode: Toast and clipboard operations skipped')
      return { 
        success: result.success, 
        url: result.url, 
        bytes: result.metadata?.size 
      }
    }
    
    // 成功トースト表示
    await showToast('PDFがクラウドに保存されました', 'success')
    
    // URLをクリップボードにコピー
    if (navigator.clipboard && result.url) {
      try {
        await navigator.clipboard.writeText(result.url)
        await showToast('URLをクリップボードにコピーしました', 'success')
      } catch (clipError) {
        console.warn('Clipboard copy failed:', clipError)
      }
    }
    
    return result
    
  } catch (error) {
    console.error('PDF save error:', error)
    if (!isE2E) {
      await showToast('PDF保存に失敗しました', 'danger')
    }
    throw error instanceof Error ? error : new Error('PDF save failed')
  }
}

/**
 * E2E-safe PDF save utility function
 */
export async function saveReport(html: string): Promise<SaveReportResponse> {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787'
  
  const response = await fetch(`${apiBaseUrl}/api/reports/pdf/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html })
  })
  
  if (!response.ok) {
    throw new Error(`PDF SAVE API ${response.status}`)
  }
  
  const data = await response.json()
  
  // ★ E2E: 実コピー/トーストはスキップ
  return { 
    success: data.success,
    url: data.url, 
    bytes: data.metadata?.size 
  }
}

/**
 * 署名URL期限切れ遭遇を報告
 * @param apiBaseUrl - API ベースURL
 * @param requestId - リクエストID（あれば）
 */
async function reportExpiredSignedUrl(apiBaseUrl: string, requestId?: string | null): Promise<void> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/telemetry/report-expired`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(requestId && { 'x-request-id': requestId })
      },
      body: JSON.stringify({
        timestamp: Date.now(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        requestId: requestId || undefined
      })
    })
    
    if (!response.ok) {
      console.warn(`Telemetry report failed: ${response.status}`)
    }
  } catch (error) {
    console.warn('Telemetry network error:', error)
  }
}

/**
 * トースト表示ヘルパー関数
 */
async function showToast(message: string, color: 'success' | 'danger' = 'success'): Promise<void> {
  try {
    // Ionic Vue のtoastControllerを使用
    const { toastController } = await import('@ionic/vue')
    const toast = await toastController.create({
      message,
      duration: 3000,
      color,
      position: 'top'
    })
    await toast.present()
  } catch (error) {
    // フォールバック: コンソール出力
    console.log(`Toast: ${message}`)
  }
}