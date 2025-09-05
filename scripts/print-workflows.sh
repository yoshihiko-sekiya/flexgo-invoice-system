#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== ci-workflows/smoke.yml ===" && echo
sed -n '1,999p' "$ROOT_DIR/ci-workflows/smoke.yml"
echo
echo "=== ci-workflows/e2e.yml ===" && echo
sed -n '1,999p' "$ROOT_DIR/ci-workflows/e2e.yml"
echo
echo "=== ci-workflows/promtool.yml ===" && echo
sed -n '1,999p' "$ROOT_DIR/ci-workflows/promtool.yml"

cat << 'TIP'

Tip:
1) Open your GitHub repo → Actions → "New workflow" → "set up a workflow yourself".
2) Paste each content into .github/workflows/<name>.yml and commit.
3) Add Secrets in Settings → Secrets and variables → Actions.

TIP

