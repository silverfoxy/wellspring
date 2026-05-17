# Wellspring

> *A wellspring of warm words.*

A self-hosted, Kudoboard-style app for the moments that matter. Birthdays,
promotions, anniversaries, farewells, thank-yous, anything where a group wants
to lift one person up. Runs entirely on the **Cloudflare Developer Platform**:

- **Workers** + **Astro SSR** (`@astrojs/cloudflare`) for the site
- **D1** for boards/messages
- **R2** for image uploads
- **Browser Run** for PDF/PNG export (optional)
- **Cloudflare Access** for sign-in and admin gating (optional)

Built end-to-end in a couple of evenings. Single Worker, single deploy.

---

## ✨ Features

- Create a board with a title, recipient, and theme
- Anyone signed in can post a message (rich text, images, GIPHY search)
- Per-message colors, decorative motifs, and image attachments
- Drag-and-drop reordering on the creator dashboard (desktop + touch)
- Animated "reveal" experience when the recipient opens their link
- Three share URLs per board:
  - `/b/:view_token` — contributors sign here
  - `/r/:recipient_token` — read-only recipient view
  - `/b/:view_token/edit/:edit_token` — creator dashboard
- PDF/PNG export via Cloudflare Browser Run

## 🔐 Identity model

Two modes, controlled by environment variables in `wrangler.jsonc`:

### Mode A — Single-tenant / no auth (default)

Leave `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` blank. Anyone with the URL can
create boards and post. Action permissions come from the unguessable
`edit_token`/`view_token`/`recipient_token` per board.

### Mode B — Behind Cloudflare Access (recommended for production)

Set `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, and `ADMIN_EMAILS` and put the worker
behind a Cloudflare Zero Trust Access policy. Then:

| Role | What they can do |
| --- | --- |
| **Anyone signed in** | Post messages on any board, edit/delete their own messages |
| **Admin emails** (`ADMIN_EMAILS`) | Create boards; moderate any board; full dashboard access |
| **Board creator** (via `edit_token` URL) | Same as admin, for that board only |
| **Recipient** (via `/r/:recipient_token`) | Read-only view; should be a Bypass path in your Access policy |

The JWT is verified against your Access team's JWKS on every request, so the
email header alone can't be spoofed.

## 🚀 Deploy

### Option 1 — One-click (recommended for self-hosters)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/YOUR_USERNAME/wellspring)

Replace `YOUR_USERNAME` with your fork's path. Clicking the button forks the
repo into the user's GitHub account, provisions the D1 database and R2 bucket
from `wrangler.jsonc`, wires up Workers Builds for CI/CD, and runs the first
deploy.

After the deploy lands, run two bootstrap scripts to finish the job:

```bash
git clone https://github.com/YOUR_USERNAME/wellspring.git   # the auto-forked repo
cd wellspring
npm install

./scripts/setup-secrets.sh    # ADMIN_EMAILS, GIPHY_API_KEY, etc. (interactive)
./scripts/setup-access.sh     # (optional) put the worker behind Cloudflare Access
```

Both scripts are idempotent — re-run them whenever you want to rotate secrets
or tweak Access policies.

### Option 2 — Local clone + deploy script

```bash
git clone https://github.com/YOUR_USERNAME/wellspring.git
cd wellspring
npm install

./deploy.sh                   # provisions D1, R2, runs migrations, deploys
./scripts/setup-secrets.sh    # ADMIN_EMAILS, GIPHY_API_KEY, etc.
./scripts/setup-access.sh     # (optional) Cloudflare Access
```

`deploy.sh` reads the worker name from `wrangler.jsonc`. Run it side-by-side
with different names for staging + prod.

### Option 3 — Fully manual

```bash
npm install
npx wrangler d1 create wellspring                          # paste database_id into wrangler.jsonc
npx wrangler r2 bucket create wellspring-uploads
npx wrangler d1 migrations apply wellspring --remote
npx wrangler secret put ADMIN_EMAILS
npm run build
npx wrangler deploy
```

## 🔒 Cloudflare Access (optional)

### Automated — `scripts/setup-access.sh`

```bash
./scripts/setup-access.sh
```

The script creates a Cloudflare API token prompt, then:

- Discovers your account ID and Zero Trust team domain
- Asks for your worker's URL
- Lists configured identity providers so you can pick one (One-time PIN is
  always available)
- Creates a self-hosted Access application protecting the worker
- Adds a Bypass app for `/r/*` so external recipients view cards without login
- Adds an Allow policy using your chosen IdP for the rest
- Writes `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` into `wrangler.jsonc`
- Re-deploys

The API token needs these permissions:

- **Access: Apps and Policies** → Edit
- **Access: Organizations, Identity Providers, and Groups** → Read
- **Account Settings** → Read

Create one at <https://dash.cloudflare.com/profile/api-tokens>.

### Manual — dashboard

1. Cloudflare dashboard → **Zero Trust** → **Access** → **Applications**
   → **Add an application** → **Self-hosted**.
2. **Application domain**: your worker URL
   (`wellspring.YOURSUBDOMAIN.workers.dev`).
3. **Bypass app** for `/r/*` so external recipients can open their card
   without signing in.
4. **Identity policy** for the rest — pick "Emails ending in `@yourcompany.com`",
   "Google OAuth", "One-time PIN", whatever you prefer.
5. After saving, go to **Settings → AUD tag** and copy the AUD.
6. In `wrangler.jsonc` set:
   ```jsonc
   "vars": {
     "ACCESS_TEAM_DOMAIN": "yourorg.cloudflareaccess.com",
     "ACCESS_AUD": "<paste the AUD tag>",
     "ADMIN_EMAILS": "you@yourcompany.com"
   }
   ```
7. Redeploy:
   ```bash
   npx wrangler deploy
   ```

The worker now reads `Cf-Access-Jwt-Assertion` on every request, verifies it
against your team's public keys, and exposes the verified email as the user
identity throughout the app.

## 🛠️ Local development

```bash
npm install
npx wrangler d1 migrations apply wellspring --local
npm run dev
```

For local GIPHY testing, create a `.dev.vars` file at the repo root:

```ini
GIPHY_API_KEY=your_key_here
```

Cloudflare Access is bypassed in local dev (no `Cf-Access-Jwt-Assertion`
header), so the app falls back to anonymous mode — exactly what you want
for iteration. Set `ADMIN_EMAILS=test@test` to act as admin locally.

## 📁 Project layout

```text
src/
  middleware.ts                 # injects Access identity into Astro.locals
  layouts/Layout.astro          # global styles, nav, page background
  components/BoardMessages.astro
  lib/
    db.ts                       # all D1 queries
    identity.ts                 # Access JWT verification
    permissions.ts              # canCreateBoard, canModerateBoard, etc.
    runtime.ts                  # env + identity helpers
    sanitize.ts                 # HTML allowlist sanitizer
    types.ts                    # board/message types + theme/motif registries
  pages/
    index.astro                 # create-board form
    b/[view_token]/index.astro                 # contributor view
    b/[view_token]/edit/[edit_token].astro     # creator dashboard
    r/[recipient_token].astro                  # recipient (read-only) view + reveal animation
    api/
      boards.ts                 # POST create
      messages.ts               # POST sign
      moderate.ts               # POST hide/delete/lock (admin or owner)
      reorder.ts                # POST reorder (admin/moderator)
      board-update.ts           # POST edit title/theme/bg (admin/moderator)
      upload.ts                 # POST attachment -> R2
      export.ts                 # GET PDF/PNG via Browser Run
      giphy.ts                  # GET GIPHY search proxy
    r2/[...key].ts              # GET R2 attachment proxy
migrations/                     # versioned D1 schema
wrangler.jsonc                  # Cloudflare config
deploy.sh                       # idempotent one-shot deploy
```

## 🤝 Contributing / forking

The codebase is small and dependency-light by design. Patterns to follow:

- **Sanitize on write AND on read**: every place that renders `body_html`
  calls `sanitizeHtml()` again. Don't trust DB data.
- **Permission helpers in `permissions.ts`**: don't sprinkle ad-hoc
  `if (board.created_by_email !== ...)` checks. Add a helper.
- **Migrations are append-only**: never edit an applied migration; add a new
  one with the next number.
- **Reduce-motion respect**: any new animation should check
  `prefers-reduced-motion`.

## License

MIT. Build whatever you want with it.
