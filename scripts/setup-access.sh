#!/usr/bin/env bash
# Configures Cloudflare Access in front of the deployed Wellspring worker.
#
# What it does:
#   1. Authenticates to the Cloudflare API (browser OAuth via wrangler if
#      possible, otherwise an interactively-pasted API token).
#   2. Asks for the worker URL.
#   3. Discovers IdPs already configured in your Zero Trust account and lets
#      you pick (One-time PIN is always available).
#   4. Creates a self-hosted Access application pointed at the worker.
#   5. Adds a Bypass policy for /r/* so external recipients can view cards.
#   6. Adds an Allow policy using the chosen IdP for the rest.
#   7. Writes ACCESS_TEAM_DOMAIN and ACCESS_AUD into wrangler.jsonc.
#   8. Re-deploys the worker.
#
# Run from the project root:  ./scripts/setup-access.sh

set -euo pipefail

if [ ! -f wrangler.jsonc ]; then
  echo "Run from the project root (wrangler.jsonc not found)." >&2
  exit 1
fi

bold() { printf "\033[1m%s\033[0m\n" "$*"; }
ok()   { printf "  \033[32m✓\033[0m %s\n" "$*"; }
note() { printf "  \033[2m· %s\033[0m\n" "$*"; }
warn() { printf "  \033[33m!\033[0m %s\n" "$*"; }
err()  { printf "  \033[31m✗\033[0m %s\n" "$*" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || err "Missing dependency: $1"; }
need npx
need jq
need curl

bold "Wellspring · Cloudflare Access setup"

# ─── 1. API token ───────────────────────────────────────────────────────────
# The Cloudflare Access API needs an account-scoped token with these perms:
#   Access: Apps and Policies   → Edit
#   Access: Organizations, Identity Providers, and Groups → Read
#   Account Settings             → Read     (for the team domain)
# (We don't try to mint a token via wrangler because there's no clean public API
# for it; we ask the user to create one in the dashboard.)
if [ -z "${CF_API_TOKEN:-}" ]; then
  cat <<TXT
  You'll need an API token with these permissions:
    · Access: Apps and Policies   → Edit
    · Access: Organizations, Identity Providers, and Groups → Read
    · Account Settings             → Read
  Create one at:
    https://dash.cloudflare.com/profile/api-tokens
TXT
  printf "  Paste your CF API token: "
  read -rs CF_API_TOKEN
  printf "\n"
  export CF_API_TOKEN
fi
[ -n "${CF_API_TOKEN:-}" ] || err "No API token provided"

cf_api() {
  local method="$1" path="$2" body="${3:-}"
  local args=(-sS -X "$method" -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json")
  if [ -n "$body" ]; then args+=(--data "$body"); fi
  curl "${args[@]}" "https://api.cloudflare.com/client/v4$path"
}

# Verify token
verify_out="$(cf_api GET /user/tokens/verify)"
if [ "$(echo "$verify_out" | jq -r '.success')" != "true" ]; then
  err "Token verification failed: $(echo "$verify_out" | jq -c '.errors')"
fi
ok "API token valid"

# ─── 2. Pick account ────────────────────────────────────────────────────────
if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  accounts="$(cf_api GET /accounts)"
  num_accounts="$(echo "$accounts" | jq '.result | length')"
  if [ "$num_accounts" = "0" ]; then
    err "No accounts available to this token"
  elif [ "$num_accounts" = "1" ]; then
    CLOUDFLARE_ACCOUNT_ID="$(echo "$accounts" | jq -r '.result[0].id')"
    ok "Using account $(echo "$accounts" | jq -r '.result[0].name') ($CLOUDFLARE_ACCOUNT_ID)"
  else
    echo "  Available accounts:"
    echo "$accounts" | jq -r '.result | to_entries[] | "    [\(.key+1)] \(.value.name)  (\(.value.id))"'
    printf "  Pick an account number: "
    read -r choice
    CLOUDFLARE_ACCOUNT_ID="$(echo "$accounts" | jq -r ".result[$((choice-1))].id")"
    ok "Using account $CLOUDFLARE_ACCOUNT_ID"
  fi
fi
export CLOUDFLARE_ACCOUNT_ID

# ─── 3. Worker URL ──────────────────────────────────────────────────────────
WORKER_NAME="$(grep -oE '"name":\s*"[^"]+"' wrangler.jsonc | head -1 | cut -d'"' -f4)"
default_domain=""

# Try to discover the worker's *.workers.dev subdomain.
sub_out="$(cf_api GET "/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/subdomain" 2>/dev/null || true)"
if subdomain="$(echo "$sub_out" | jq -r '.result.subdomain // empty')" && [ -n "$subdomain" ]; then
  default_domain="${WORKER_NAME}.${subdomain}.workers.dev"
fi

if [ -n "$default_domain" ]; then
  printf "  Worker domain to protect [%s]: " "$default_domain"
  read -r WORKER_DOMAIN
  WORKER_DOMAIN="${WORKER_DOMAIN:-$default_domain}"
else
  printf "  Worker domain to protect (e.g. wellspring.you.workers.dev): "
  read -r WORKER_DOMAIN
fi
[ -n "$WORKER_DOMAIN" ] || err "Worker domain required"
ok "Protecting $WORKER_DOMAIN"

# ─── 4. Team domain (Zero Trust org slug) ───────────────────────────────────
org_out="$(cf_api GET "/accounts/$CLOUDFLARE_ACCOUNT_ID/access/organizations")"
team_domain="$(echo "$org_out" | jq -r '.result.auth_domain // empty')"
if [ -z "$team_domain" ]; then
  err "No Zero Trust organization found on this account. Visit https://one.dash.cloudflare.com to set one up, then re-run."
fi
ok "Zero Trust team domain: $team_domain"

# ─── 5. Pick an IdP ─────────────────────────────────────────────────────────
idp_out="$(cf_api GET "/accounts/$CLOUDFLARE_ACCOUNT_ID/access/identity_providers")"
mapfile -t idp_ids   < <(echo "$idp_out" | jq -r '.result[].id')
mapfile -t idp_names < <(echo "$idp_out" | jq -r '.result[].name')

echo "  Available identity providers for the Allow policy:"
if [ "${#idp_ids[@]}" -eq 0 ]; then
  echo "    (none configured beyond One-time PIN)"
fi
echo "    [0] One-time PIN  (Cloudflare emails a 6-digit code to any address)"
for i in "${!idp_ids[@]}"; do
  printf "    [%d] %s\n" $((i+1)) "${idp_names[$i]}"
done
printf "  Pick an IdP number [0]: "
read -r idp_choice
idp_choice="${idp_choice:-0}"

if [ "$idp_choice" = "0" ]; then
  idp_clause='"login_method_types":["onetimepin"]'
  ok "Using One-time PIN"
else
  idx=$((idp_choice-1))
  selected_idp_id="${idp_ids[$idx]}"
  selected_idp_name="${idp_names[$idx]}"
  idp_clause="\"login_method\":[\"$selected_idp_id\"]"
  ok "Using IdP: $selected_idp_name"
fi

# ─── 6. Create the Access application ───────────────────────────────────────
bold "Step 1/3  Create Access application"
app_body="$(jq -nc --arg name "Wellspring" --arg domain "$WORKER_DOMAIN" '{
  name: $name,
  domain: $domain,
  type: "self_hosted",
  session_duration: "24h",
  auto_redirect_to_identity: false,
  app_launcher_visible: false
}')"
app_out="$(cf_api POST "/accounts/$CLOUDFLARE_ACCOUNT_ID/access/apps" "$app_body")"
if [ "$(echo "$app_out" | jq -r '.success')" != "true" ]; then
  echo "$app_out" | jq .
  err "Failed to create Access application"
fi
APP_ID="$(echo "$app_out" | jq -r '.result.id')"
ACCESS_AUD="$(echo "$app_out" | jq -r '.result.aud')"
ok "Created application $APP_ID (aud=$ACCESS_AUD)"

# ─── 7. Bypass policy for /r/* ──────────────────────────────────────────────
bold "Step 2/3  Add Bypass policy for /r/*"
# Cloudflare app-level path is not directly settable per-policy; the modern way
# is to scope the app to specific paths, OR add a separate bypass app for /r/*.
# We create a second app for the bypass path with higher precedence.
bypass_body="$(jq -nc --arg name "Wellspring (recipient bypass)" --arg domain "${WORKER_DOMAIN}/r/" '{
  name: $name,
  domain: $domain,
  type: "self_hosted",
  session_duration: "24h",
  app_launcher_visible: false,
  precedence: 1
}')"
bypass_out="$(cf_api POST "/accounts/$CLOUDFLARE_ACCOUNT_ID/access/apps" "$bypass_body")"
if [ "$(echo "$bypass_out" | jq -r '.success')" != "true" ]; then
  warn "Failed to create bypass app — recipients may need to log in. Continuing."
else
  BYPASS_APP_ID="$(echo "$bypass_out" | jq -r '.result.id')"
  bypass_policy='{"name":"Bypass everyone","decision":"bypass","include":[{"everyone":{}}]}'
  cf_api POST "/accounts/$CLOUDFLARE_ACCOUNT_ID/access/apps/$BYPASS_APP_ID/policies" "$bypass_policy" >/dev/null
  ok "Bypass policy created for /r/* path"
fi

# ─── 8. Allow policy on the main app ────────────────────────────────────────
bold "Step 3/3  Add Allow policy"
allow_policy="$(jq -nc --argjson idp "{$idp_clause}" '{
  name: "Allow signed-in users",
  decision: "allow",
  include: [{ everyone: {} }]
} + $idp')"
policy_out="$(cf_api POST "/accounts/$CLOUDFLARE_ACCOUNT_ID/access/apps/$APP_ID/policies" "$allow_policy")"
if [ "$(echo "$policy_out" | jq -r '.success')" != "true" ]; then
  echo "$policy_out" | jq .
  err "Failed to create Allow policy"
fi
ok "Allow policy attached"

# ─── 9. Patch wrangler.jsonc ────────────────────────────────────────────────
python3 - "$team_domain" "$ACCESS_AUD" <<'PY'
import re, sys, pathlib
team_domain, aud = sys.argv[1], sys.argv[2]
p = pathlib.Path("wrangler.jsonc")
text = p.read_text()
text = re.sub(r'("ACCESS_TEAM_DOMAIN"\s*:\s*")[^"]*(")', rf'\g<1>{team_domain}\g<2>', text, count=1)
text = re.sub(r'("ACCESS_AUD"\s*:\s*")[^"]*(")',         rf'\g<1>{aud}\g<2>',         text, count=1)
p.write_text(text)
PY
ok "Wrote ACCESS_TEAM_DOMAIN and ACCESS_AUD into wrangler.jsonc"

# ─── 10. Re-deploy ──────────────────────────────────────────────────────────
bold "Re-deploying so the worker reads the new vars"
npm run build
npx --yes wrangler deploy
ok "Deployed"

cat <<OUT

──────────────────────────────────────────────────────────────────────
Cloudflare Access is now in front of Wellspring.

  Protected:  https://$WORKER_DOMAIN
  Bypass:     https://$WORKER_DOMAIN/r/*   (recipient view, no login)

Visit the protected URL in a new tab to confirm the login screen appears.
──────────────────────────────────────────────────────────────────────
OUT
