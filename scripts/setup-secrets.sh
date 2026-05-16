#!/usr/bin/env bash
# Interactive secret bootstrap for Wellspring.
#
# Reads the worker name from wrangler.jsonc, then prompts for each known secret.
# Uses `wrangler secret put` (so you get whatever OAuth/login wrangler already
# has - no new API tokens to manage).
#
# Run from the project root:  ./scripts/setup-secrets.sh
#
# Secrets handled:
#   ADMIN_EMAILS    comma-separated emails that can create boards / moderate
#   GIPHY_API_KEY   for the in-form GIF picker (optional)
#   CF_ACCOUNT_ID   for PDF/PNG export (optional)
#   CF_API_TOKEN    for PDF/PNG export (optional)

set -euo pipefail

if [ ! -f wrangler.jsonc ]; then
  echo "Run from the project root (wrangler.jsonc not found)." >&2
  exit 1
fi

WORKER_NAME="$(grep -oE '"name":\s*"[^"]+"' wrangler.jsonc | head -1 | cut -d'"' -f4)"
if [ -z "$WORKER_NAME" ]; then
  echo "Could not read worker name from wrangler.jsonc" >&2
  exit 1
fi

bold() { printf "\033[1m%s\033[0m\n" "$*"; }
ok()   { printf "  \033[32m✓\033[0m %s\n" "$*"; }
note() { printf "  \033[2m· %s\033[0m\n" "$*"; }
err()  { printf "  \033[31m✗\033[0m %s\n" "$*" >&2; exit 1; }

bold "Wellspring · secret setup → worker: $WORKER_NAME"

# Confirm wrangler is logged in (uses cached OAuth where available).
if ! npx --yes wrangler whoami >/dev/null 2>&1; then
  note "Not logged in to Cloudflare. Opening browser..."
  npx --yes wrangler login
fi
ok "Authenticated with Cloudflare"

# List existing secrets (silent failure if the worker doesn't exist yet).
existing_secrets="$(
  npx --yes wrangler secret list --name "$WORKER_NAME" --format json 2>/dev/null \
    | jq -r '.[].name' 2>/dev/null || true
)"

prompt_secret() {
  local key="$1"
  local desc="$2"
  local sensitive="${3:-yes}"  # yes => -s for read (no echo), no => echoed

  if echo "$existing_secrets" | grep -qx "$key"; then
    printf "  \033[33m·\033[0m %s is already set. Leave blank to keep, paste new value to update.\n" "$key"
  else
    printf "  \033[2m·\033[0m %s — %s\n" "$key" "$desc"
  fi

  printf "    Enter %s (blank to skip): " "$key"
  if [ "$sensitive" = "yes" ]; then
    read -rs value
    printf "\n"
  else
    read -r value
  fi

  if [ -n "$value" ]; then
    printf "%s" "$value" | npx --yes wrangler secret put "$key" --name "$WORKER_NAME" >/dev/null
    ok "Saved $key"
  fi
}

bold "Step 1/2  Required"
prompt_secret ADMIN_EMAILS \
  "comma-separated list of emails that can create boards (e.g. you@x.com,boss@x.com)" \
  no  # not sensitive; visible while typing helps

bold "Step 2/2  Optional"
prompt_secret GIPHY_API_KEY \
  "from https://developers.giphy.com/dashboard/  — enables GIF search in the post form"

prompt_secret CF_ACCOUNT_ID \
  "your Cloudflare account ID  — needed for PDF/PNG export" \
  no

prompt_secret CF_API_TOKEN \
  "an API token with 'Browser Rendering: Edit' permission  — needed for PDF/PNG export"

cat <<OUT

──────────────────────────────────────────────────────────────────────
Secrets saved.

If you want to gate the app behind Cloudflare Access, run:
  ./scripts/setup-access.sh
──────────────────────────────────────────────────────────────────────
OUT
