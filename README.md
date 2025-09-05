# Mentor Lite App 📱

Vue 3 + Ionic + Capacitor application with PDF report generation functionality.

## Features
- 🔐 Authentication with Supabase
- 📊 Dashboard and reporting system
- 📄 PDF report generation with Puppeteer
- 🗺️ Map integration with Mapbox
- 📱 Mobile-first responsive design

## PDF Generation System

### Document Types

The system supports multiple document types with a generic API:

#### 1. Delivery Reports (`/reports/preview`)
- **Access**: Navigate to Reports → レポート プレビュー
- **Fill Form**: Enter delivery details (date, driver, count, distance, memo)
- **Preview**: View real-time HTML preview on the right
- **Generate PDF**: Click "PDFを生成" to download formatted report
- **Filename**: Auto-generated as `delivery_report_YYYY-MM-DD_DriverName.pdf`
- **Storage Path**: `reports/YYYY/MM/filename.pdf`

#### 2. Invoices (`/invoices/preview`)
- **Access**: Navigate to `/invoices/preview` directly
- **Fill Form**: Enter invoice details (company info, items, tax, bank info)
- **Preview**: Real-time HTML preview with professional formatting
- **Generate PDF**: Download or save to cloud storage
- **Filename**: Auto-generated as `invoice_YYYY-MM-DD_InvoiceNumber_CompanyName.pdf`
- **Storage Path**: `invoices/YYYY/MM/filename.pdf`

Demo data is pre-filled for quick testing. The system validates required fields before PDF generation.

## Testing

End-to-end tests validate the PDF generation flow using Cypress:

```bash
# Run E2E tests in headless mode
npm run test:e2e

# Open Cypress Test Runner (interactive)
npm run cy:open
```

**Prerequisites**: Make sure both frontend (`npm run dev`) and API server (`npm run dev:api`) are running before executing tests. Tests verify form validation, PDF API calls (200 status), and error handling scenarios.

**CIでのE2E実行**: GitHub Actionsが main/develop ブランチへのPush/PRで自動的にE2Eテストを実行します。ワークフローは日本語フォントをインストールし、`npm run e2e:run` でdev:all起動→API health check待機→Cypress実行の流れを自動化します。テスト失敗時はスクリーンショットと動画をアーティファクトとしてアップロードしてデバッグを支援します。

## Server Requirements

For PDF generation to work correctly, especially with Japanese text:

**Fonts** (Linux/Docker environments):
```bash
# Ubuntu/Debian
sudo apt-get install fonts-noto-cjk

# CentOS/RHEL
sudo yum install google-noto-cjk-fonts

# Alpine Linux (Docker)
apk add --no-cache font-noto-cjk
```

**Puppeteer Dependencies** (Linux/Docker):
```bash
# Ubuntu/Debian
sudo apt-get install -y libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libxss1 libasound2

# Alpine Linux (Docker)
apk add --no-cache chromium nss freetype freetype-dev harfbuzz ca-certificates
```

Without proper fonts, Japanese characters may appear as squares (文字化け) in generated PDFs.

## Development

```bash
# Start both frontend and API server
npm run dev:all

# Frontend only (port 5174)
npm run dev

# API server only (port 8787)
npm run dev:api
```

Built with Vue 3, Ionic, TypeScript, Supabase, and Puppeteer.

## Production Deployment

### Railway Deployment (API Server)

The API server is containerized and ready for Railway deployment:

```bash
# 1. Build Docker image locally (optional testing)
docker build -f server/Dockerfile -t mentor-api .
docker run -p 8787:8787 -e NODE_ENV=production mentor-api

# 2. Deploy to Railway
# Connect your GitHub repo to Railway
# Railway will automatically use railway.json configuration
```

**Required Environment Variables** (Railway Dashboard → Variables):
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
SUPABASE_BUCKET=reports
SUPABASE_SIGNED_URL_TTL_HOURS=168
CORS_ORIGINS=https://your-frontend-domain.com,https://admin.your-domain.com
NODE_ENV=production
API_PORT=8787
```

**Security Environment Variables**:
```
SECURITY_REQUIRED=true          # Force helmet/rate-limit in production
SECURITY_FAIL_FAST=false        # Allow startup with /readyz=503 instead of exit(1)
CORS_ORIGINS=https://domain.com  # Production: HTTPS only, no wildcards (*)
```

**Railway Features**:
- ✅ Automatic deploys from `main` branch
- ✅ Japanese font support (Noto Sans CJK)
- ✅ Puppeteer + Chrome dependencies included
- ✅ Health checks at `/api/health`
- ✅ Horizontal scaling ready

**Frontend Configuration**:
Update your frontend `.env.local`:
```bash
VITE_API_BASE_URL=https://your-app-name.railway.app
```

### Docker Compose (Local Development)

```yaml
# docker-compose.yml
version: '3.8'
services:
  api:
    build:
      context: .
      dockerfile: server/Dockerfile
    ports:
      - "8787:8787"
    environment:
      - NODE_ENV=development
      - SUPABASE_URL=https://demo.supabase.co
      - SUPABASE_SERVICE_ROLE_KEY=demo-key
      - SUPABASE_BUCKET=reports
    volumes:
      - ./server:/app/server
      - ./src/templates:/app/src/templates

## CI/CD Setup (GitHub Actions)

Because of GitHub's workflow permissions, pushing `.github/workflows` from some clients may be blocked. This repo includes ready-to-use templates under `ci-workflows/`.

Quick setup:
- Copy each template to `.github/workflows/` via GitHub Web UI:
  - `ci-workflows/smoke.yml` → `.github/workflows/smoke.yml`
  - `ci-workflows/e2e.yml` → `.github/workflows/e2e.yml`
  - `ci-workflows/promtool.yml` → `.github/workflows/promtool.yml`
- Or locally print contents to copy/paste:
  - `bash scripts/print-workflows.sh`
- Add GitHub Secrets (Settings → Secrets and variables → Actions):
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  - (optional) `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

Workflows overview:
- `Smoke (Invoices)`: staging save+refresh, production download-only
- `E2E (Invoices)`: local dev servers + Cypress E2E for invoice flow
- `Promtool`: static validation of `prometheus-rule.yml`
```

## Storage Security & Access Control

### Supabase Storage Configuration

**Bucket Setup** (Supabase Dashboard → Storage):
```sql
-- Create private bucket (recommended for sensitive reports)
INSERT INTO storage.buckets (id, name, public) VALUES ('reports', 'reports', false);

-- Or create public bucket (if reports can be openly accessible)  
INSERT INTO storage.buckets (id, name, public) VALUES ('reports', 'reports', true);
```

**Access Control Policies**:
```sql
-- Private bucket: Only service role can manage files
CREATE POLICY "Service role can manage reports" ON storage.objects
FOR ALL USING (bucket_id = 'reports' AND auth.role() = 'service_role');

-- Public bucket: Authenticated users can read, service role can manage
CREATE POLICY "Authenticated can view reports" ON storage.objects  
FOR SELECT USING (bucket_id = 'reports' AND auth.role() = 'authenticated');

CREATE POLICY "Service role can manage reports" ON storage.objects
FOR ALL USING (bucket_id = 'reports' AND auth.role() = 'service_role');
```

**公開/非公開バケットの使い分け**:

| バケット種別 | 用途 | セキュリティ | アクセス方法 | 運用コスト |
|-------------|------|-------------|-------------|-----------|
| **非公開 (推奨)** | 機密性の高い配送データ | 🔒 高セキュリティ | 署名付きURL (TTL制限) | 🔧 定期クリーンアップ必要 |
| **公開** | 一般公開可能なレポート | ⚠️ 低セキュリティ | 直接URL | 🚀 メンテナンス不要 |

**セキュリティ考慮事項**:
- ✅ **署名付きURL**: 一時的アクセス (TTL: 1-168時間設定可能)  
- 🔒 **サービスロールキー**: フロントエンドに絶対露出禁止
- 🕒 **TTL管理**: `SUPABASE_SIGNED_URL_TTL_HOURS` で期限調整

### Maintenance & Cleanup

**Automated Cleanup**:
```bash
# Test cleanup (dry run)
npm run cleanup:dry

# Execute cleanup (removes expired files)
npm run cleanup

# Manual cleanup with custom TTL
SUPABASE_SIGNED_URL_TTL_HOURS=72 npm run cleanup
```

**Cron Job Setup** (Production):
```bash
# Add to crontab for weekly cleanup
0 2 * * 0 cd /app && npm run cleanup >> /var/log/cleanup.log 2>&1
```

**Environment Variables**:
- `SUPABASE_SIGNED_URL_TTL_HOURS=168` - URL expiry (hours)
- `CLEANUP_DRY_RUN=true` - Test mode without deletions
- `CLEANUP_DISABLED=true` - Disable cleanup (useful for E2E tests)

### 削除手順・運用ガイド

**手動削除（緊急時）**:
```bash
# 特定ファイルの削除
curl -X DELETE \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "https://your-project.supabase.co/storage/v1/object/reports/path/to/file.pdf"

# フォルダ内の一括削除
curl -X DELETE \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prefixes":["reports/2024/01/"]}' \
  "https://your-project.supabase.co/storage/v1/object/reports"
```

**定期メンテナンス計画**:
1. **日次**: ログ監視（storage usage, API errors）
2. **週次**: クリーンアップスクリプト実行
3. **月次**: ストレージ使用量・コスト確認
4. **四半期**: TTL設定の見直し

**トラブルシューティング**:
```bash
# ストレージ使用量確認
curl -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "https://your-project.supabase.co/rest/v1/storage/buckets"

# 失敗したクリーンアップの再実行
CLEANUP_DRY_RUN=true npm run cleanup  # まず確認
npm run cleanup  # 実行

# 古いファイルの強制削除（30日以上）
SUPABASE_SIGNED_URL_TTL_HOURS=720 npm run cleanup
```

## Monitoring & Troubleshooting

### Performance Metrics & Logging

The API server includes comprehensive performance monitoring and error tracking:

```bash
# Example logs for successful PDF generation
⏱️  [pdf_download] Started {"hasOptions":true,"htmlLength":15420}
✅ [pdf_download] Completed in 2341ms {"operation":"pdf_download","duration":"2341ms","success":true,"pdfSize":"156.3KB","pdfSizeBytes":160051,"format":"A4"}

# Example logs for PDF save to storage  
⏱️  [pdf_save] Started {"hasOptions":true,"hasMetadata":true,"htmlLength":15420,"driverName":"山田太郎"}
✅ [pdf_save] Completed in 3127ms {"operation":"pdf_save","duration":"3127ms","success":true,"pdfSize":"156.3KB","filename":"delivery_report_2025-08-12_山田太郎.pdf","urlType":"signed"}

# Example error logs
❌ [pdf_download] Failed after 5234ms {"operation":"pdf_download","error":"Navigation timeout exceeded"}
```

**Optional Sentry Integration**:
Set `SENTRY_DSN` environment variable to enable error tracking and performance monitoring:
```bash
SENTRY_DSN=https://your-key@sentry.io/project-id
```

### Common Issues & Solutions

#### **🐌 遅い PDF 生成の確認ポイント (>3秒)**

**ログで確認すべき項目**:
```bash
# 1. 生成時間チェック
grep "pdf_download.*Completed" /var/log/app.log | tail -10
# 期待値: <3000ms、警告: >5000ms、問題: >10000ms

# 2. HTMLサイズチェック  
grep "htmlLength" /var/log/app.log | tail -10
# 期待値: <30KB、注意: >50KB、問題: >100KB

# 3. PDFサイズチェック
grep "pdfSizeBytes" /var/log/app.log | tail -10
# 期待値: <500KB、注意: >1MB、問題: >5MB
```

**対処法**:
- **>5s**: Puppeteer timeout増加、画像最適化
- **HTMLサイズ>50KB**: DOM複雑度削減、インライン画像削減  
- **サーバーリソース**: CPU/メモリ使用量監視

#### **❌ 失敗時の確認ポイント**

**エラー種別と対処**:
```bash
# PDF生成失敗パターン別確認
grep -A2 -B2 "pdf.*Failed" /var/log/app.log | tail -20

# 1. Navigation timeout → Puppeteer設定調整
# 2. Missing fonts → fonts-noto-cjk インストール確認
# 3. HTML parsing → テンプレート構文チェック
# 4. Chrome launch → 依存関係インストール確認
```

**段階的デバッグ**:
1. **API接続確認**: `curl http://localhost:8787/api/health`
2. **最小HTML test**: 上記 curl コマンドで単純HTMLテスト
3. **フォント確認**: `fc-list | grep -i noto` で日本語フォント存在確認
4. **リソース確認**: `htop` でCPU/メモリ使用率確認

#### **☁️ ストレージ関連失敗**

**よくある失敗パターン**:
- `STORAGE_UPLOAD_ERROR` → Supabase認証情報・バケット権限確認
- `URL_GENERATION_ERROR` → バケット public/private 設定確認  
- Network timeout → Supabase サービス状況確認

**Debug Commands**:
```bash
# Test PDF generation with curl
curl -X POST http://localhost:8787/api/reports/pdf \
  -H "Content-Type: application/json" \
  -d '{"html":"<html><body style=\"font-family: Noto Sans JP\">テスト</body></html>"}' \
  --output test.pdf

# Check health endpoint
curl http://localhost:8787/api/health

# Monitor logs in real-time
tail -f /var/log/mentor-api.log | grep -E "\[pdf_|ERROR|WARN"
```

### Prometheus Alerting Rules

The included `prometheus-rule.yml` defines TTL超過率アラートとパフォーマンス監視ルールを提供します。**署名URL期限切れアラート**では、成功したPDF保存操作に対する期限切れ遭遇の比率を監視し、**WARN (>3%/15分)** および **CRIT (>10%/15分)** の2段階でアラートします。**SLOバーンレートアラート**は99%可用性（30日間）を前提とし、エラーバジェット消費速度に基づいて **Fast Burn（数時間で枯渇）** と **Slow Burn（数日で枯渇）** を早期検知します。これらのしきい値・係数は運用開始後の実績に基づいて調整可能で、例えばより厳しいSLO要件の場合は係数を下げる、またはビジネス要件に応じてSLO目標値自体を変更することを検討してください。

**主要な監視クエリ例**:
```promql
# 署名URL期限切れ率（リアルタイム）
sum(rate(expired_signed_url_encounters_total[15m])) / 
clamp_min(sum(rate(pdf_requests_total{route="save",status="ok"}[15m])), 1) * 100

# PDF生成パフォーマンス（recording rules）
job:pdf_duration_seconds:p50   # P50レイテンシ
job:pdf_duration_seconds:p95   # P95レイテンシ  
job:pdf_error_rate5m           # エラー率（5分間）

# 時間別期限切れ遭遇数
increase(expired_signed_url_encounters_total[1h])
```

### Grafana Dashboard Import

プロジェクトに含まれる `ops/grafana/dashboards/pdf.json` を使用してPDFパフォーマンス監視ダッシュボードをすぐに利用できます。Grafana UI で **「+ Import」→「Upload JSON file」** から `pdf.json` をアップロードするか、JSON内容をコピー&ペーストしてインポートしてください。ダッシュボードには **P95レイテンシ現在値**、**P50/P95推移**、**エラー率**、**署名URL期限切れ率**、**リクエスト量** の5つのパネルが含まれ、recording rulesを活用した高速クエリで即座に運用監視を開始できます。

### Alert Response Procedures

アラート発生時の対応手順は **[PDF Service Alert Runbook](docs/observability/runbooks/pdf.md)** を参照してください。各アラート（署名URL期限切れ、P95レイテンシ、エラー率、SLOバーンレート）に対する即座確認・切り分け・対応手順が標準化されており、requestIdを使ったSentry追跡、メトリクス確認コマンド、緊急時のTTL延長・ロールバック手順が含まれています。

## Adding New Document Templates

To add a new document type (e.g., estimates, contracts):

### 1. Create Template File
```typescript
// src/templates/estimate.ts
export interface EstimateData {
  estimateNumber: string
  // ... your data structure
}

export function renderEstimate(data: EstimateData): string {
  return `<!DOCTYPE html>...` // Your HTML template
}
```

### 2. Create Preview Page
```vue
<!-- src/pages/estimates/Preview.vue -->
<template>
  <!-- Similar structure to invoices/Preview.vue -->
</template>

<script setup lang="ts">
import { renderEstimate } from '@/templates/estimate'
// Use downloadOrSaveReport with type: 'estimate'
</script>
```

### 3. Add Route
```typescript
// src/router/index.ts
{
  path: '/estimates',
  component: () => import('@/components/layout/AppShell.vue'),
  children: [{
    path: 'preview',
    component: () => import('@/pages/estimates/Preview.vue')
  }]
}
```

### 4. Update Server Logic
```typescript
// server/index.ts - Add new type to filename generation
if (type === 'estimate') {
  filename = `estimate_${date}_${sanitizedId}.pdf`
  folderPrefix = 'estimates'
}
```

### 5. Add Navigation
Update your app navigation to include the new document type.

### Template Best Practices
- ✅ Use Noto Sans JP font for Japanese text support
- ✅ Include print media queries for proper PDF formatting
- ✅ Test with various data sizes and edge cases  
- ✅ Follow existing naming conventions
- ✅ Add TypeScript interfaces for type safety

### API Usage
```typescript
// Frontend usage
await downloadOrSaveReport(html, {
  mode: 'save',
  type: 'estimate', // Your new type
  metadata: {
    estimateNumber: 'EST-2025-001',
    // ... relevant metadata
  }
})
```

The generic `/api/pdf/save` endpoint automatically handles new document types with proper storage organization (`type/YYYY/MM/filename.pdf`).
