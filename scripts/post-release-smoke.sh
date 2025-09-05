#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   HOST=http://api.example.com MODE=save DOC_TYPE=invoice EXPECT_HELMET=true EXPECT_RATELIMIT=true BYTES_MIN=2048 ./scripts/post-release-smoke.sh
# Env vars (すべて任意):
HOST="${HOST:-${1:-http://localhost:8787}}"
MODE="${MODE:-download}"         # download | save
DOC_TYPE="${DOC_TYPE:-report}"   # report | invoice
TIMEOUT="${TIMEOUT:-20}"         # curl timeout seconds
RETRIES="${RETRIES:-3}"          # PDF生成のリトライ回数
BYTES_MIN="${BYTES_MIN:-512}"    # 期待する最小PDFサイズ(byte) - invoiceの場合は2048がデフォルト
EXPECT_HELMET="${EXPECT_HELMET:-false}"
EXPECT_RATELIMIT="${EXPECT_RATELIMIT:-false}"
TEST_REFRESH="${TEST_REFRESH:-false}"     # save後のrefresh検証を実行
REFRESH_PATH_KEY="${REFRESH_PATH_KEY:-path}"  # save responseのパスキー名

step() { echo -e "\n==> $*"; }
fail() { echo "❌ $*"; exit 1; }
ok()   { echo "✅ $*"; }

curl_json() { curl -fsS --max-time "$TIMEOUT" "$@"; }

step "[1/4] Readiness (/readyz)"
readiness_json="$(curl_json "$HOST/readyz" | tee /dev/stderr)"
ready="$(jq -r '.ready' <<<"$readiness_json" 2>/dev/null || echo false)"
[[ "$ready" == "true" ]] || fail "ready=false at $HOST/readyz"

step "[2/4] Security 状態 (/health/security)"
sec_json="$(curl_json "$HOST/health/security" | tee /dev/stderr)"
helmet="$(jq -r '.helmet' <<<"$sec_json" 2>/dev/null || echo false)"
rlimit="$(jq -r '.rateLimit' <<<"$sec_json" 2>/dev/null || echo false)"
if [[ "$EXPECT_HELMET" == "true" && "$helmet" != "true" ]]; then fail "helmet not applied"; fi
if [[ "$EXPECT_RATELIMIT" == "true" && "$rlimit" != "true" ]]; then fail "rateLimit not applied"; fi
ok "security ok (helmet=$helmet, rateLimit=$rlimit)"

step "[3/4] Metrics 存在確認 (/metrics)"
if curl -fsS --max-time "$TIMEOUT" "$HOST/metrics" | grep -q 'security_middlewares'; then
  ok "metrics found (security_middlewares)"
else
  echo "⚠️  metrics に security_middlewares が見つかりません（運用方針によりOK）"
fi

# Set doc-specific defaults
if [[ "$DOC_TYPE" == "invoice" ]]; then
  BYTES_MIN="${BYTES_MIN:-2048}"  # Invoices are typically larger
  DOC_ENDPOINT="invoices"
  TEST_DATA='{"partner_id":"test-partner-001","partner_name":"Test Transport Co.","period_start":"2025-08-01","period_end":"2025-08-31","subtotal":10000,"tax":1000,"total":11000,"items":[{"description":"Test delivery service","quantity":5,"unit":"回","unit_price":2000,"amount":10000}]}'
else
  BYTES_MIN="${BYTES_MIN:-512}"   # Reports are smaller
  DOC_ENDPOINT="reports"
  TEST_DATA='{"html":"<html><body>Smoke test report</body></html>"}'
fi

step "[4/4] PDF フロー ($MODE, $DOC_TYPE)"
if [[ "$MODE" == "download" ]]; then
  n=0; pass=false
  while (( n < RETRIES )); do
    if [[ "$DOC_TYPE" == "invoice" ]]; then
      # For invoices, we need to create a test invoice first, then generate PDF
      # This is a simplified test - in practice you'd use the full invoice API
      test_endpoint="$HOST/api/$DOC_ENDPOINT/test/pdf"
    else
      test_endpoint="$HOST/api/$DOC_ENDPOINT/pdf"
    fi
    
    if curl -fsS --max-time "$TIMEOUT" -X POST "$test_endpoint" \
      -H 'Content-Type: application/json' \
      -H 'x-user-role: Manager' \
      -H 'x-user-email: smoke-test@example.com' \
      --data "$TEST_DATA" \
      -o "/tmp/smoke-${DOC_TYPE}.pdf" ; then
      size=$( (stat -f%z "/tmp/smoke-${DOC_TYPE}.pdf" 2>/dev/null || stat -c%s "/tmp/smoke-${DOC_TYPE}.pdf") || echo 0 )
      echo "PDF size: ${size} bytes (${DOC_TYPE})"
      if (( size >= BYTES_MIN )); then pass=true; break; fi
    fi
    ((n++)); sleep 1
  done
  $pass || fail "PDF download failed or too small (<${BYTES_MIN}B) for $DOC_TYPE"
  ok "PDF download OK ($DOC_TYPE)"
else
  if [[ "$DOC_TYPE" == "invoice" ]]; then
    save_endpoint="$HOST/api/$DOC_ENDPOINT/test/pdf/save"
  else
    save_endpoint="$HOST/api/$DOC_ENDPOINT/pdf/save"
  fi
  
  resp="$(curl_json -X POST "$save_endpoint" \
    -H 'Content-Type: application/json' \
    -H 'x-user-role: Manager' \
    -H 'x-user-email: smoke-test@example.com' \
    --data "$TEST_DATA")"
  url="$(jq -r '.url // empty' <<<"$resp")"
  [[ -n "$url" ]] || fail "save response has no url for $DOC_TYPE"
  code="$(curl -s -o /dev/null -w '%{http_code}' -I "$url" || true)"
  echo "HEAD $url -> $code ($DOC_TYPE)"
  [[ "$code" =~ ^20(0|4)$ ]] || fail "saved URL not accessible (HEAD $code) for $DOC_TYPE"
  ok "PDF save & access OK ($DOC_TYPE)"
  
  # Optional: Test refresh flow (save → expire → refresh → access)
  if [[ "$TEST_REFRESH" == "true" ]]; then
    step "[4b/4] PDF Refresh検証 (save→refresh, $DOC_TYPE)"
    path="$(jq -r ".${REFRESH_PATH_KEY} // empty" <<<"$resp")"
    [[ -n "$path" ]] || fail "save response has no ${REFRESH_PATH_KEY} for $DOC_TYPE"
    echo "Stored path: $path ($DOC_TYPE)"
    
    # Request refresh to get new signed URL
    refresh_resp="$(curl_json -X POST "$HOST/api/pdf/refresh" \
      -H 'Content-Type: application/json' \
      --data "{\"path\":\"$path\"}")"
    new_url="$(jq -r '.url // empty' <<<"$refresh_resp")"
    [[ -n "$new_url" ]] || fail "refresh response has no url for $DOC_TYPE"
    
    # Verify new URL is accessible
    new_code="$(curl -s -o /dev/null -w '%{http_code}' -I "$new_url" || true)"
    echo "HEAD $new_url -> $new_code ($DOC_TYPE)"
    [[ "$new_code" =~ ^20(0|4)$ ]] || fail "refreshed URL not accessible (HEAD $new_code) for $DOC_TYPE"
    ok "PDF refresh & access OK ($DOC_TYPE)"
  fi
fi

ok "Smoke passed on $HOST"