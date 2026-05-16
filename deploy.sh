#!/usr/bin/env bash
# Idempotent one-shot deploy script for Wellspring.
# Run from the project root:  ./deploy.sh [worker-name]
#
# What it does:
#   1. Logs you into Cloudflare via wrangler if needed
#   2. Creates the D1 database (or reuses existing) and writes its ID into wrangler.jsonc
#   3. Creates the R2 bucket (or reuses existing)
#   4. Applies any pending D1 migrations to the REMOTE database
#   5. Prompts for ADMIN_EMAILS and optional GIPHY_API_KEY secrets
#   6. Builds Astro and runs `wrangler deploy`
#
# Cloudflare Access setup is documented separately in README.md — run this
# script first, then attach an Access application to the worker route and set
# the ACCESS_TEAM_DOMAIN / ACCESS_AUD vars in wrangler.jsonc.

set -euo pipefail

WORKER_NAME="${1:-$(grep -oE '"name":\s*"[^"]+"' wrangler.jsonc | head -1 | cut -d'"' -f4)}"
DB_NAME="$WORKER_NAME"
BUCKET_NAME="$WORKER_NAME-uploads"

bold() { printf "\033[1m%s\033[0m\n" "$*"; }
note() { printf "  \033[2m· %s\033[0m\n" "$*"; }
ok()   { printf "  \033[32m✓\033[0m %s\n" "$*"; }
warn() { printf "  \033[33m!\033[0m %s\n" "$*"; }
err()  { printf "  \033[31m✗\033[0m %s\n" "$*"; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || err "Missing dependency: $1"; }
need npx
need jq

bold "Wellspring deploy → worker: $WORKER_NAME"

# 1. Login check
if ! npx --yes wrangler whoami >/dev/null 2>&1; then
  warn "Not logged in to Cloudflare. Attempting login..."
  if ! npx --yes wrangler login; then
    err "Login failed. Please run 'npx wrangler login' manually, or set CLOUDFLARE_API_TOKEN environment variable."
  fi
  # Verify login succeeded
  if ! npx --yes wrangler whoami >/dev/null 2>&1; then
    err "Authentication failed. Please run 'npx wrangler login' manually, or set CLOUDFLARE_API_TOKEN environment variable."
  fi
fi
ok "Authenticated with Cloudflare"

# 2. D1 database
bold "Step 1/5  D1 database"
LIST_OUT="$(npx --yes wrangler d1 list --json 2>/dev/null || true)"
EXISTING_ID="$(printf '%s' "$LIST_OUT" | jq -r --arg n "$DB_NAME" '.[] | select(.name==$n) | .uuid' 2>/dev/null | head -1 || true)"
if [ -z "$EXISTING_ID" ]; then
  note "Creating new database '$DB_NAME'..."
  CREATE_OUT="$(npx --yes wrangler d1 create "$DB_NAME" 2>&1)" || { echo "$CREATE_OUT"; err "wrangler d1 create failed"; }
  # Parse the database_id from the human-readable output:
  #     "database_id": "3e5738a3-951c-4f5b-9fac-976709eadf2f"
  EXISTING_ID="$(printf '%s' "$CREATE_OUT" | grep -oE '"database_id"[^"]*"[a-f0-9-]{36}"' | grep -oE '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}' | head -1)"
  if [ -z "$EXISTING_ID" ]; then
    echo "$CREATE_OUT"
    err "Could not parse database_id from wrangler output"
  fi
  ok "Created D1 database $EXISTING_ID"
else
  ok "Reusing existing D1 database $EXISTING_ID"
fi

# Patch the database_id into wrangler.jsonc (only the primary DB binding, not the historical "remote" one)
# We look for the first occurrence of "REPLACE_WITH_DATABASE_ID" or an existing UUID after `"binding": "DB"`.
python3 - "$EXISTING_ID" <<'PY' >/dev/null
import json, re, sys, pathlib
new_id = sys.argv[1]
p = pathlib.Path("wrangler.jsonc")
text = p.read_text()
# Replace the first database_id value that appears after the "DB" binding entry.
# This regex only touches the immediate following database_id, leaving any other
# entries (historical "remote: true" bindings, etc.) untouched.
patched = re.sub(
    r'("binding"\s*:\s*"DB"[^}]*?"database_id"\s*:\s*")[^"]*(")',
    rf'\g<1>{new_id}\g<2>',
    text,
    count=1,
    flags=re.DOTALL,
)
if patched == text:
    sys.exit(0)
p.write_text(patched)
PY
ok "Wrote database_id into wrangler.jsonc"

# 3. R2 bucket
bold "Step 2/5  R2 bucket"
BUCKET_LIST="$(npx --yes wrangler r2 bucket list 2>&1 || true)"
if printf '%s' "$BUCKET_LIST" | grep -q "^\s*name:\s*${BUCKET_NAME}\s*$"; then
  ok "R2 bucket '$BUCKET_NAME' already exists"
else
  note "Creating R2 bucket '$BUCKET_NAME'..."
  CREATE_OUT="$(npx --yes wrangler r2 bucket create "$BUCKET_NAME" 2>&1)" || { echo "$CREATE_OUT"; err "wrangler r2 bucket create failed"; }
  ok "Created R2 bucket"
fi

# 4. Apply migrations
bold "Step 3/5  Database migrations"
npx --yes wrangler d1 migrations apply "$DB_NAME" --remote
ok "Migrations applied"

# 5. Secrets
bold "Step 4/5  Secrets"
# Worker may not exist yet on first run; suppress errors and parse defensively.
existing_secrets="$(npx --yes wrangler secret list --name "$WORKER_NAME" --format json 2>/dev/null | jq -r '.[].name' 2>/dev/null || true)"

prompt_secret() {
  local key="$1"
  local desc="$2"
  if echo "$existing_secrets" | grep -qx "$key"; then
    ok "Secret '$key' already set (leave blank to keep, or paste a new value)"
  else
    note "Secret '$key' not set — $desc"
  fi
  printf "    Enter %s (leave blank to skip): " "$key"
  read -rs value
  printf "\n"
  if [ -n "$value" ]; then
    printf "%s" "$value" | npx --yes wrangler secret put "$key" --name "$WORKER_NAME" >/dev/null
    ok "Saved $key"
  fi
}

prompt_secret ADMIN_EMAILS  "comma-separated list of admin emails (e.g. you@x.com,boss@x.com)"
prompt_secret GIPHY_API_KEY "GIPHY API key (optional — leave blank to disable GIF search)"
prompt_secret CF_ACCOUNT_ID "Cloudflare account id (optional — only needed for PDF/PNG export)"
prompt_secret CF_API_TOKEN  "Cloudflare API token with 'Browser Rendering: Edit' (optional)"

# 6. Build + deploy
bold "Step 5/5  Build and deploy"
npm run build
npx --yes wrangler deploy
ok "Deployed!"

cat <<'OUT'

──────────────────────────────────────────────────────────────────────
Wellspring is live!

Next steps:
  1. Visit your worker URL. You should see the create-board form (or a
     friendly message if you set ADMIN_EMAILS and aren't on the list).
  2. Optional — gate it with Cloudflare Access:
       a. Dashboard → Zero Trust → Access → Applications → Add an app
       b. Type: Self-hosted ; Domain: your-worker.workers.dev
       c. Add a Bypass rule for path '/r/*' (recipient links)
       d. Add a "Service Auth" or email policy for the rest
       e. After saving, open Application settings → Application Audience
          and copy the AUD tag. Add it as `ACCESS_AUD` in wrangler.jsonc,
          and set `ACCESS_TEAM_DOMAIN` (e.g. yourorg.cloudflareaccess.com).
          Run `npx wrangler deploy` again.
──────────────────────────────────────────────────────────────────────
OUT
