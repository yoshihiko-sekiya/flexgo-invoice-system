/**
 * 日報レポートテンプレート
 * 統一されたHTML生成とスタイリング
 */

export type DailyReport = {
  date: string
  driver: string
  count: number
  distance: number
  note?: string
}

/**
 * 日報レポートのHTMLを生成
 * @param data - レポートデータ
 * @returns 完全なHTML文書
 */
export function renderDailyReport(data: DailyReport): string {
  const formattedDate = new Date(data.date).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  })
  
  const generatedAt = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'numeric', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

  const avgDistance = data.count > 0 ? (data.distance / data.count).toFixed(1) : '0.0'

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>配送日報 - ${data.driver} - ${data.date}</title>
  
  <!-- Google Fonts: Noto Sans JP -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;700&display=swap" rel="stylesheet">
  
  <style>
    /* A4サイズ想定のページスタイル */
    @page {
      size: A4;
      margin: 20mm;
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: 'Noto Sans JP', 'Hiragino Sans', 'ヒラギノ角ゴシック', 'Yu Gothic', '游ゴシック', 'Meiryo', 'メイリオ', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: #333;
      background: #fff;
      max-width: 210mm; /* A4幅 */
      margin: 0 auto;
      padding: 20mm;
    }
    
    .header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 3px solid #2563eb;
      padding-bottom: 20px;
    }
    
    .title {
      font-size: 24px;
      font-weight: 700;
      color: #2563eb;
      margin-bottom: 8px;
    }
    
    .subtitle {
      font-size: 14px;
      color: #6b7280;
      font-weight: 300;
    }
    
    .info-section {
      margin-bottom: 30px;
    }
    
    .section-title {
      font-size: 16px;
      font-weight: 500;
      color: #374151;
      margin-bottom: 15px;
      padding-bottom: 5px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .info-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      font-size: 14px;
    }
    
    .info-table th,
    .info-table td {
      padding: 12px 16px;
      text-align: left;
      border: 1px solid #e5e7eb;
    }
    
    .info-table th {
      background-color: #f9fafb;
      font-weight: 500;
      color: #374151;
      width: 30%;
    }
    
    .info-table td {
      background-color: #fff;
      font-weight: 400;
    }
    
    .stats-row {
      background-color: #eff6ff !important;
    }
    
    .stats-value {
      font-size: 18px;
      font-weight: 700;
      color: #2563eb;
    }
    
    .note-section {
      margin-top: 30px;
    }
    
    .note-content {
      background-color: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 16px;
      min-height: 80px;
      white-space: pre-wrap;
      font-size: 14px;
      line-height: 1.6;
    }
    
    .footer {
      margin-top: 40px;
      text-align: center;
      font-size: 12px;
      color: #9ca3af;
      border-top: 1px solid #e5e7eb;
      padding-top: 16px;
    }
    
    .highlight-box {
      background: linear-gradient(135deg, #2563eb, #3b82f6);
      color: white;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
      margin: 20px 0;
    }
    
    .highlight-number {
      font-size: 32px;
      font-weight: 700;
      display: block;
      margin-bottom: 4px;
    }
    
    .highlight-label {
      font-size: 14px;
      opacity: 0.9;
      font-weight: 300;
    }
    
    /* 印刷用スタイル */
    @media print {
      body {
        margin: 0;
        padding: 0;
        max-width: none;
      }
      
      .header {
        page-break-after: avoid;
      }
      
      .info-table {
        page-break-inside: avoid;
      }
      
      .note-section {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">配送日報レポート</div>
    <div class="subtitle">Generated on ${generatedAt}</div>
  </div>
  
  <div class="info-section">
    <div class="section-title">基本情報</div>
    <table class="info-table">
      <tr>
        <th>作業日</th>
        <td>${formattedDate}</td>
      </tr>
      <tr>
        <th>ドライバー</th>
        <td>${data.driver}</td>
      </tr>
    </table>
  </div>
  
  <div class="highlight-box">
    <span class="highlight-number">${data.count}</span>
    <span class="highlight-label">配送完了件数</span>
  </div>
  
  <div class="info-section">
    <div class="section-title">実績データ</div>
    <table class="info-table">
      <tr class="stats-row">
        <th>総走行距離</th>
        <td class="stats-value">${data.distance} km</td>
      </tr>
      <tr class="stats-row">
        <th>平均距離/件</th>
        <td class="stats-value">${avgDistance} km</td>
      </tr>
      <tr>
        <th>配送効率</th>
        <td>${data.distance > 0 ? (data.count / data.distance * 100).toFixed(1) : '0.0'} 件/100km</td>
      </tr>
    </table>
  </div>
  
  ${data.note ? `
  <div class="note-section">
    <div class="section-title">メモ・特記事項</div>
    <div class="note-content">${data.note}</div>
  </div>
  ` : ''}
  
  <div class="footer">
    <div>Generated by Mentor Lite System</div>
    <div>${generatedAt} - Document ID: RPT-${data.date.replace(/-/g, '')}-${data.driver.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}</div>
  </div>
</body>
</html>`
}