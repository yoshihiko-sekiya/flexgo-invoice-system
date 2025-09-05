#!/usr/bin/env bash
set -euo pipefail

NAME="${NAME:-mentor-api}"
NS_STG="${NS_STG:-staging}"
NS_PROD="${NS_PROD:-production}"

mkurl() {
  local ns="$1" name="$2"
  local host tls h i
  host=$(kubectl -n "$ns" get ingress "$name" -o jsonpath='{.spec.rules[0].host}' 2>/dev/null || true)
  tls=$(kubectl -n "$ns" get ingress "$name" -o jsonpath='{.spec.tls[0].hosts[0]}' 2>/dev/null || true)
  if [[ -n "$host" ]]; then
    [[ -n "$tls" ]] && echo "https://$host" || echo "http://$host"
    return
  fi
  h=$(kubectl -n "$ns" get svc "$name" -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || true)
  i=$(kubectl -n "$ns" get svc "$name" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)
  if [[ -n "$h" ]]; then echo "http://$h:8787"; elif [[ -n "$i" ]]; then echo "http://$i:8787"; fi
}

STG_URL=$(mkurl "$NS_STG" "$NAME" || true)
PROD_URL=$(mkurl "$NS_PROD" "$NAME" || true)

echo "Detected:"
echo "  STG_URL=$STG_URL"
echo "  PROD_URL=$PROD_URL"
[[ -n "$STG_URL" ]]  && echo "export STG_URL=\"$STG_URL\""
[[ -n "$PROD_URL" ]] && echo "export PROD_URL=\"$PROD_URL\""