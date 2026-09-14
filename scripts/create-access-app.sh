#!/usr/bin/env bash
# Create (idempotently) the hostname-based Cloudflare Access application that
# gates the Pipeflick Worker. Nothing secret is written to disk.
#
# Environment:
#   CF_ACCESS_API_TOKEN  required. API token with Account | Access: Apps and Policies | Edit.
#                        Export it in the shell only; do NOT put it in .dev.vars or .env,
#                        and do not name it CLOUDFLARE_API_TOKEN (wrangler would pick it up).
#   HOST                 required. Hostname to protect, e.g. pipeflick.<subdomain>.workers.dev
#   ACCOUNT_ID           optional. Defaults to the Pipeflick account.
#   ALLOWED_EMAILS       optional. Comma-separated allow list.
#
# Usage:
#   HOST=pipeflick.your-subdomain.workers.dev scripts/create-access-app.sh
set -euo pipefail

: "${CF_ACCESS_API_TOKEN:?CF_ACCESS_API_TOKEN is not set (export it in this shell only)}"
: "${HOST:?HOST is not set (e.g. pipeflick.<subdomain>.workers.dev)}"
ACCOUNT_ID="${ACCOUNT_ID:-YOUR_CLOUDFLARE_ACCOUNT_ID}"
ALLOWED_EMAILS="${ALLOWED_EMAILS:-owner@example.com,owner.alt@example.com}"

API="https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/access/apps"
AUTH=(-H "Authorization: Bearer ${CF_ACCESS_API_TOKEN}" -H "Content-Type: application/json")

have_jq() { command -v jq >/dev/null 2>&1; }

# Print a readable error and exit 1 for auth / not-enabled failures.
fail_on_api_error() {
  local status="$1" body="$2"
  if [[ "$status" == "401" || "$status" == "403" ]] || grep -q "not_enabled" <<<"$body"; then
    echo "Cloudflare API error (HTTP ${status}):" >&2
    if have_jq; then jq -r '.errors[]? | "  \(.code): \(.message)"' <<<"$body" >&2 || echo "  $body" >&2
    else echo "  $body" >&2; fi
    echo "Hint: enable Zero Trust at https://one.dash.cloudflare.com/ and use a token with Access: Apps and Policies | Edit." >&2
    exit 1
  fi
}

# 1. Idempotency: look for an existing app on this hostname.
LIST_RESP=$(curl -sS "${AUTH[@]}" -w '\n%{http_code}' "${API}?per_page=100")
LIST_STATUS=$(tail -n1 <<<"$LIST_RESP")
LIST_BODY=$(sed '$d' <<<"$LIST_RESP")
fail_on_api_error "$LIST_STATUS" "$LIST_BODY"
if [[ "$LIST_STATUS" != "200" ]]; then
  echo "Listing Access apps failed (HTTP ${LIST_STATUS}): ${LIST_BODY}" >&2
  exit 1
fi

if have_jq; then
  EXISTING=$(jq -r --arg h "$HOST" '.result[]? | select(.domain == $h) | "\(.id) \(.aud)"' <<<"$LIST_BODY" | head -n1)
else
  # Fallback without jq: split into one app per line and grep the host.
  EXISTING=$(tr '{' '\n' <<<"$LIST_BODY" | grep -F "\"domain\":\"${HOST}\"" | head -n1 \
    | sed -E 's/.*"id":"([^"]+)".*"aud":"([^"]+)".*/\1 \2/' || true)
fi

if [[ -n "${EXISTING:-}" ]]; then
  echo "Access application already exists for ${HOST}"
  echo "id:  ${EXISTING%% *}"
  echo "aud: ${EXISTING##* }"
  exit 0
fi

# 2. Build the include array from ALLOWED_EMAILS.
INCLUDE=""
IFS=',' read -ra EMAILS <<<"$ALLOWED_EMAILS"
for e in "${EMAILS[@]}"; do
  e="$(tr -d '[:space:]' <<<"$e")"
  [[ -z "$e" ]] && continue
  INCLUDE+="${INCLUDE:+,}{\"email\":{\"email\":\"${e}\"}}"
done

PAYLOAD=$(cat <<JSON
{
  "type": "self_hosted",
  "name": "Pipeflick",
  "domain": "${HOST}",
  "self_hosted_domains": ["${HOST}"],
  "session_duration": "24h",
  "app_launcher_visible": false,
  "policies": [
    {
      "name": "Vincent only",
      "decision": "allow",
      "include": [${INCLUDE}]
    }
  ]
}
JSON
)

# 3. Create it.
CREATE_RESP=$(curl -sS "${AUTH[@]}" -w '\n%{http_code}' -X POST "$API" --data "$PAYLOAD")
CREATE_STATUS=$(tail -n1 <<<"$CREATE_RESP")
CREATE_BODY=$(sed '$d' <<<"$CREATE_RESP")
fail_on_api_error "$CREATE_STATUS" "$CREATE_BODY"
if [[ "$CREATE_STATUS" != "200" && "$CREATE_STATUS" != "201" ]]; then
  echo "Creating Access app failed (HTTP ${CREATE_STATUS}): ${CREATE_BODY}" >&2
  exit 1
fi

if have_jq; then
  APP_ID=$(jq -r '.result.id' <<<"$CREATE_BODY")
  APP_AUD=$(jq -r '.result.aud' <<<"$CREATE_BODY")
else
  APP_ID=$(sed -E 's/.*"result":\{.*"id":"([^"]+)".*/\1/' <<<"$CREATE_BODY")
  APP_AUD=$(sed -E 's/.*"aud":"([^"]+)".*/\1/' <<<"$CREATE_BODY")
fi

echo "Created Access application for ${HOST}"
echo "id:  ${APP_ID}"
echo "aud: ${APP_AUD}"
echo "allowed: ${ALLOWED_EMAILS}"
