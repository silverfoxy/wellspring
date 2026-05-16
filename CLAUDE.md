# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Wellspring is a self-hosted Kudoboard-style app for creating celebration boards (birthdays, promotions, farewells, etc.). It runs entirely on the Cloudflare Developer Platform using:

- **Astro SSR** with `@astrojs/cloudflare` adapter (server-rendered pages)
- **D1** database for boards and messages
- **R2** for image uploads
- **Cloudflare Access** for optional authentication (two modes: open/single-tenant or gated)
- **Browser Rendering** for PDF/PNG export (optional)

## Development Commands

```bash
# Local development
npm run dev                           # Start dev server (uses local D1)
npx wrangler d1 migrations apply wellspring --local  # Apply migrations locally

# Database migrations (remote)
npm run db:migrate:remote             # Apply migrations to production D1

# Build and deploy
npm run build                         # Build Astro site
npx wrangler deploy                   # Deploy to Cloudflare Workers
npm run deploy                        # Build + deploy in one step

# One-shot setup (provisions everything)
./deploy.sh                           # Creates D1, R2, runs migrations, deploys
./scripts/setup-secrets.sh            # Interactive secrets setup
./scripts/setup-access.sh             # Automated Access policy creation
```

## Authentication Model

The app has two modes controlled by `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` in `wrangler.jsonc`:

1. **No auth** (default): Anyone with URLs can create boards and post. Permissions come from unguessable tokens (`edit_token`, `view_token`, `recipient_token`).

2. **Behind Cloudflare Access**: JWT verification happens in `src/lib/identity.ts`. The middleware in `src/middleware.ts` extracts identity and injects it into `Astro.locals.identity`. Admin permissions come from the `ADMIN_EMAILS` secret.

## Architecture

### Core Library (`src/lib/`)

- **`db.ts`**: All D1 queries (boards, messages, reordering). Uses nanoid for token generation.
- **`identity.ts`**: Cloudflare Access JWT verification. Verifies the `Cf-Access-Jwt-Assertion` header against the team's JWKS. Returns an `Identity` object with `email`, `isAuthenticated`, and `isAdmin`.
- **`permissions.ts`**: Single source of truth for authorization (`canModerateBoard`, `canPostToBoard`, `canEditOwnMessage`, `canCreateBoard`). Always use these helpers instead of inline permission checks.
- **`types.ts`**: TypeScript types, theme/motif/background registries with SVG patterns. All visual themes are defined here as data URIs.
- **`sanitize.ts`**: HTML allowlist sanitizer for rich-text message bodies. Sanitize on write AND on read (defense in depth).
- **`runtime.ts`**: Environment and identity helpers for Astro pages.

### Page Structure (`src/pages/`)

- **`index.astro`**: Board creation form (gated by `canCreateBoard`)
- **`b/[view_token]/index.astro`**: Contributor view (sign board)
- **`b/[view_token]/edit/[edit_token].astro`**: Creator dashboard (reorder, moderate, edit board)
- **`r/[recipient_token].astro`**: Read-only recipient view with reveal animation

### API Endpoints (`src/pages/api/`)

- **`boards.ts`**: POST to create board
- **`messages.ts`**: POST to sign (add message)
- **`moderate.ts`**: POST to hide/delete/lock (admin/owner only)
- **`reorder.ts`**: POST to reorder messages (admin/moderator)
- **`board-update.ts`**: POST to edit title/theme/background (admin/moderator)
- **`upload.ts`**: POST attachment uploads to R2
- **`export.ts`**: GET PDF/PNG export via Browser Rendering
- **`giphy.ts`**: GET GIPHY search proxy
- **`r2/[...key].ts`**: GET R2 attachment proxy

### Middleware

- **`src/middleware.ts`**: Resolves Cloudflare Access identity once per request, injects into `Astro.locals.identity`.

### Database

- **`migrations/`**: Versioned D1 schema. Migrations are append-only (never edit applied migrations).
- Tables: `boards` (id, title, recipient, theme, tokens), `messages` (id, board_id, author, body_html, color, motif, position)

## Important Patterns

1. **Permission checks**: Always use helpers from `permissions.ts`. Don't inline `if (board.created_by_email !== ...)` checks.

2. **HTML sanitization**: Call `sanitizeHtml()` on every render of `body_html`, even though we sanitize on write. Defense in depth.

3. **Migrations**: Never edit an applied migration. Add a new migration with the next number (e.g., `0009_add_new_field.sql`).

4. **Accessibility**: Respect `prefers-reduced-motion` for animations. Any new animations should check this media query.

5. **Token-based URLs**: Each board has three tokens for different access levels:
   - `view_token`: Contributors can sign
   - `recipient_token`: Read-only view for recipient
   - `edit_token`: Full moderation for board creator

6. **Local development**: Cloudflare Access is bypassed in dev (no JWT header). Set `ADMIN_EMAILS=test@test` in `.dev.vars` to act as admin locally.

## Testing Secrets Locally

Create `.dev.vars` in the repo root:

```ini
GIPHY_API_KEY=your_key_here
ADMIN_EMAILS=test@test
```

## Deploy Script Behavior

`./deploy.sh` is idempotent and can be run repeatedly. It:
1. Creates D1 database (or reuses existing) and patches `database_id` into `wrangler.jsonc`
2. Creates R2 bucket (or reuses existing)
3. Applies migrations to remote D1
4. Prompts for secrets (skippable if already set)
5. Builds and deploys

After deployment, run `./scripts/setup-access.sh` to automatically create Cloudflare Access policies if needed.
