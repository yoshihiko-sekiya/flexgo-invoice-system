/**
 * Invoice Template Generator
 * 請求書テンプレート生成 - Enhanced for Phase 3
 */

export interface InvoiceItem {
  id: string
  delivery_date?: string
  description: string
  quantity: number
  unit: string
  unit_price: number
  amount: number
  is_overtime?: boolean
  is_special?: boolean
  vehicle_no?: string
  driver_name?: string
  memo?: string
}

export interface InvoiceData {
  // 請求書基本情報
  id: string
  invoice_no: string
  period_start: string
  period_end: string
  status: string
  subtotal: number
  tax: number
  total: number
  currency: string
  payment_due_date?: string
  created_at: string
  
  // 取引先情報
  partner_name: string
  partner_billing_code?: string
  partner_email?: string
  partner_phone?: string
  partner_address?: string
  partner_contact_person?: string
  
  // 請求明細
  items?: InvoiceItem[]
  
  // 集計情報
  item_count?: number
  total_stops?: number
  total_km?: number
  total_hours?: number
}

// 会社情報（環境変数から取得、デフォルト値設定）
const COMPANY_INFO = {
  name: process.env.COMPANY_NAME || 'FLEX GO株式会社',
  address: process.env.COMPANY_ADDRESS || '〒123-4567 東京都千代田区○○1-2-3',
  phone: process.env.COMPANY_PHONE || 'TEL: 03-1234-5678',
  email: process.env.COMPANY_EMAIL || 'billing@flexgo.co.jp',
  registration: process.env.COMPANY_REGISTRATION || 'T1234567890123',
  bank_info: process.env.COMPANY_BANK || '○○銀行 ○○支店 普通 1234567',
  ceo: process.env.COMPANY_CEO || '代表取締役 田中太郎'
}

// 数値のフォーマット（3桁区切り）
function formatCurrency(amount: number, currency: string = 'JPY'): string {
  if (currency === 'JPY') {
    return `¥${amount.toLocaleString('ja-JP')}`
  }
  return `${amount.toLocaleString('ja-JP')} ${currency}`
}

// 日付のフォーマット（YYYY年MM月DD日）
function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${year}年${month}月${day}日`
}

// 単位の日本語表示
function formatUnit(unit: string): string {
  const unitMap: Record<string, string> = {
    'stop': '件',
    'km': 'km',
    'hour': '時間',
    'other': 'その他'
  }
  return unitMap[unit] || unit
}

export function renderInvoice(data: InvoiceData): string {
  const currentDate = formatDate(new Date().toISOString())
  const periodStart = formatDate(data.period_start)
  const periodEnd = formatDate(data.period_end)
  const dueDateDisplay = data.payment_due_date ? formatDate(data.payment_due_date) : '請求書発行日より30日以内'
  
  // 明細行のHTML生成
  const itemsRows = (data.items || []).map((item, index) => {
    const deliveryDate = item.delivery_date ? formatDate(item.delivery_date) : ''
    const isOvertimeSpecial = item.is_overtime || item.is_special
    const specialMark = isOvertimeSpecial ? '※' : ''
    
    return `
      <tr class="item-row">
        <td class="text-center">${index + 1}</td>
        <td class="text-center">${deliveryDate}</td>
        <td class="description">
          ${item.description}${specialMark}
          ${item.vehicle_no ? `<br><small>車両: ${item.vehicle_no}</small>` : ''}
          ${item.driver_name ? `<br><small>運転者: ${item.driver_name}</small>` : ''}
          ${item.memo ? `<br><small>${item.memo}</small>` : ''}
        </td>
        <td class="text-right">${item.quantity.toLocaleString('ja-JP')}</td>
        <td class="text-center">${formatUnit(item.unit)}</td>
        <td class="text-right">${formatCurrency(item.unit_price)}</td>
        <td class="text-right amount">${formatCurrency(item.amount)}</td>
      </tr>
    `
  }).join('')
  
  // 特殊料金の注釈
  const hasSpecialItems = data.items?.some(item => item.is_overtime || item.is_special)
  const specialNote = hasSpecialItems ? '<p class="note">※時間外・特殊料金を含む</p>' : ''

  return `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>請求書 ${data.invoice_no}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap');
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Noto Sans JP', 'MS Gothic', sans-serif;
      font-size: 12px;
      line-height: 1.4;
      color: #333;
      background: white;
    }
    
    .container {
      max-width: 210mm;
      margin: 0 auto;
      padding: 15mm 10mm;
      background: white;
      min-height: 297mm; /* A4 height */
    }
    
    /* ヘッダー */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 20px;
      border-bottom: 2px solid #333;
      padding-bottom: 15px;
    }
    
    .company-info {
      flex: 1;
    }
    
    .company-name {
      font-size: 18px;
      font-weight: 700;
      color: #2c5aa0;
      margin-bottom: 5px;
    }
    
    .company-details {
      font-size: 10px;
      line-height: 1.5;
      color: #666;
    }
    
    .invoice-title {
      flex: 0 0 auto;
      text-align: center;
      margin-left: 20px;
    }
    
    .invoice-title h1 {
      font-size: 24px;
      font-weight: 700;
      color: #333;
      margin-bottom: 5px;
    }
    
    .invoice-no {
      font-size: 14px;
      color: #666;
      margin-bottom: 3px;
    }
    
    .invoice-date {
      font-size: 10px;
      color: #999;
    }
    
    /* 取引先・支払情報 */
    .invoice-info {
      display: flex;
      justify-content: space-between;
      margin-bottom: 25px;
    }
    
    .client-info, .payment-info {
      flex: 1;
      padding: 15px;
      border: 1px solid #ddd;
      background: #fafafa;
    }
    
    .client-info {
      margin-right: 10px;
    }
    
    .payment-info {
      margin-left: 10px;
    }
    
    .section-title {
      font-size: 12px;
      font-weight: 700;
      color: #2c5aa0;
      margin-bottom: 8px;
      border-bottom: 1px solid #2c5aa0;
      padding-bottom: 2px;
    }
    
    .client-name {
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 5px;
    }
    
    .client-details, .payment-details {
      font-size: 10px;
      line-height: 1.6;
      color: #555;
    }
    
    /* 請求期間・総額 */
    .summary-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding: 15px;
      background: linear-gradient(135deg, #f0f7ff 0%, #e6f2ff 100%);
      border: 1px solid #2c5aa0;
      border-radius: 5px;
    }
    
    .period-info {
      flex: 1;
    }
    
    .period-title {
      font-size: 12px;
      font-weight: 700;
      color: #2c5aa0;
      margin-bottom: 3px;
    }
    
    .period-dates {
      font-size: 14px;
      color: #333;
    }
    
    .total-amount {
      flex: 0 0 auto;
      text-align: right;
      margin-left: 20px;
    }
    
    .total-label {
      font-size: 12px;
      color: #666;
      margin-bottom: 3px;
    }
    
    .total-value {
      font-size: 20px;
      font-weight: 700;
      color: #d63384;
      text-shadow: 1px 1px 2px rgba(0,0,0,0.1);
    }
    
    /* 明細テーブル */
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      border: 2px solid #333;
    }
    
    .items-table th {
      background: linear-gradient(135deg, #2c5aa0 0%, #1e3f73 100%);
      color: white;
      font-weight: 700;
      font-size: 11px;
      padding: 10px 8px;
      text-align: center;
      border: 1px solid #1e3f73;
    }
    
    .items-table td {
      padding: 8px;
      border: 1px solid #ddd;
      vertical-align: top;
    }
    
    .item-row:nth-child(even) {
      background-color: #f9f9f9;
    }
    
    .item-row:hover {
      background-color: #f0f7ff;
    }
    
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    
    .description {
      line-height: 1.5;
      min-width: 200px;
    }
    
    .amount {
      font-weight: 500;
      color: #2c5aa0;
    }
    
    /* 集計テーブル */
    .totals-table {
      width: 300px;
      margin-left: auto;
      border-collapse: collapse;
      margin-bottom: 20px;
      border: 1px solid #333;
    }
    
    .totals-table th,
    .totals-table td {
      padding: 8px 12px;
      border: 1px solid #ddd;
      text-align: right;
    }
    
    .totals-table th {
      background-color: #f5f5f5;
      font-weight: 700;
      color: #333;
      text-align: left;
      width: 120px;
    }
    
    .subtotal-row { background-color: #fafafa; }
    .tax-row { background-color: #fff3cd; }
    .total-row { 
      background: linear-gradient(135deg, #d63384 0%, #b02a5b 100%);
      color: white;
      font-weight: 700;
      font-size: 14px;
    }
    
    /* フッター */
    .footer {
      margin-top: auto;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    
    .bank-info {
      flex: 1;
      margin-right: 20px;
    }
    
    .notes {
      flex: 1;
      margin-left: 20px;
    }
    
    .footer-section-title {
      font-size: 11px;
      font-weight: 700;
      color: #2c5aa0;
      margin-bottom: 5px;
    }
    
    .footer-content {
      font-size: 10px;
      line-height: 1.5;
      color: #666;
    }
    
    .note {
      font-size: 10px;
      color: #666;
      margin-top: 10px;
      font-style: italic;
    }
    
    /* 印刷最適化 */
    @media print {
      body { 
        font-size: 11px; 
        -webkit-print-color-adjust: exact;
      }
      .container { 
        padding: 10mm; 
      }
      .items-table th {
        background: #2c5aa0 !important;
        color: white !important;
      }
      .total-row {
        background: #d63384 !important;
        color: white !important;
      }
    }
    
    /* 空の場合のメッセージ */
    .no-items {
      text-align: center;
      padding: 30px;
      color: #999;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- ヘッダー -->
    <div class="header">
      <div class="company-info">
        <div class="company-name">${COMPANY_INFO.name}</div>
        <div class="company-details">
          ${COMPANY_INFO.address}<br>
          ${COMPANY_INFO.phone} / ${COMPANY_INFO.email}<br>
          登録番号: ${COMPANY_INFO.registration}<br>
          ${COMPANY_INFO.ceo}
        </div>
      </div>
      <div class="invoice-title">
        <h1>請求書</h1>
        <div class="invoice-no">No. ${data.invoice_no}</div>
        <div class="invoice-date">発行日: ${currentDate}</div>
      </div>
    </div>
    
    <!-- 取引先・支払情報 -->
    <div class="invoice-info">
      <div class="client-info">
        <div class="section-title">請求先</div>
        <div class="client-name">${data.partner_name} 御中</div>
        <div class="client-details">
          ${data.partner_billing_code ? `請求コード: ${data.partner_billing_code}<br>` : ''}
          ${data.partner_address ? `${data.partner_address}<br>` : ''}
          ${data.partner_contact_person ? `担当: ${data.partner_contact_person}<br>` : ''}
          ${data.partner_phone ? `TEL: ${data.partner_phone}<br>` : ''}
          ${data.partner_email ? `E-mail: ${data.partner_email}` : ''}
        </div>
      </div>
      
      <div class="payment-info">
        <div class="section-title">お支払情報</div>
        <div class="payment-details">
          <strong>支払期限: ${dueDateDisplay}</strong><br>
          <br>
          <strong>お振込先:</strong><br>
          ${COMPANY_INFO.bank_info}<br>
          <br>
          <small>※振込手数料はお客様にてご負担願います</small>
        </div>
      </div>
    </div>
    
    <!-- 請求期間・総額サマリー -->
    <div class="summary-row">
      <div class="period-info">
        <div class="period-title">請求対象期間</div>
        <div class="period-dates">${periodStart} ～ ${periodEnd}</div>
      </div>
      <div class="total-amount">
        <div class="total-label">ご請求金額 (税込)</div>
        <div class="total-value">${formatCurrency(data.total, data.currency)}</div>
      </div>
    </div>
    
    <!-- 明細テーブル -->
    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 30px;">No.</th>
          <th style="width: 80px;">配送日</th>
          <th style="width: 250px;">内容</th>
          <th style="width: 60px;">数量</th>
          <th style="width: 40px;">単位</th>
          <th style="width: 80px;">単価</th>
          <th style="width: 100px;">金額</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows || '<tr><td colspan="7" class="no-items">明細がありません</td></tr>'}
      </tbody>
    </table>
    
    ${specialNote}
    
    <!-- 集計テーブル -->
    <table class="totals-table">
      <tr class="subtotal-row">
        <th>小計 (税抜)</th>
        <td>${formatCurrency(data.subtotal, data.currency)}</td>
      </tr>
      <tr class="tax-row">
        <th>消費税</th>
        <td>${formatCurrency(data.tax, data.currency)}</td>
      </tr>
      <tr class="total-row">
        <th>合計 (税込)</th>
        <td>${formatCurrency(data.total, data.currency)}</td>
      </tr>
    </table>
    
    <!-- フッター -->
    <div class="footer">
      <div class="bank-info">
        <div class="footer-section-title">振込先口座</div>
        <div class="footer-content">
          ${COMPANY_INFO.bank_info.replace(/\s+/g, '<br>')}<br>
          口座名義: ${COMPANY_INFO.name}
        </div>
      </div>
      
      <div class="notes">
        <div class="footer-section-title">ご請求に関するお問い合わせ</div>
        <div class="footer-content">
          ${COMPANY_INFO.name}<br>
          ${COMPANY_INFO.phone}<br>
          ${COMPANY_INFO.email}
        </div>
        
        ${data.item_count ? `
        <div class="note">
          配送実績: ${data.item_count || 0}件
          ${data.total_stops ? ` / 配送件数: ${data.total_stops}件` : ''}
          ${data.total_km ? ` / 走行距離: ${data.total_km}km` : ''}
          ${data.total_hours ? ` / 作業時間: ${data.total_hours}時間` : ''}
        </div>
        ` : ''}
      </div>
    </div>
  </div>
</body>
</html>
  `.trim()
}

// ファイル名生成関数
export function generateInvoiceFilename(data: InvoiceData): string {
  const periodStart = new Date(data.period_start)
  const year = periodStart.getFullYear()
  const month = String(periodStart.getMonth() + 1).padStart(2, '0')
  
  // 取引先名をファイル名用にサニタイズ
  const partnerName = data.partner_name
    .replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '_')
    .substring(0, 20) // 長すぎる場合は切り詰め
  
  // 請求書番号をファイル名用にサニタイズ
  const invoiceNo = data.invoice_no
    .replace(/[^a-zA-Z0-9-_]/g, '_')
  
  return `invoice_${year}${month}_${partnerName}_${invoiceNo}.pdf`
}