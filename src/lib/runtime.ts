import type { APIContext, AstroGlobal } from 'astro';
import type { Identity } from './identity';

/**
 * Pulls the Cloudflare bindings out of `Astro.locals.runtime.env`.
 * Throws if called outside the Cloudflare adapter (e.g. preview without bindings).
 */
export function getEnv(ctx: APIContext | AstroGlobal): Env {
  const runtime = (ctx.locals as App.Locals | undefined)?.runtime;
  if (!runtime?.env) {
    throw new Error('Cloudflare bindings unavailable. Run with `wrangler dev` or enable platformProxy.');
  }
  return runtime.env;
}

/** Returns the Access identity attached by middleware, or an anonymous fallback. */
export function getRequestIdentity(ctx: APIContext | AstroGlobal): Identity {
  return (
    (ctx.locals as { identity?: Identity } | undefined)?.identity ?? {
      email: null,
      isAuthenticated: false,
      isAdmin: false,
    }
  );
}

/** Escape user input for safe HTML embedding. */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

/** Build the public URL for an R2 object. Prefer the worker proxy route. */
export function imageUrl(key: string): string {
  return `/r2/${encodeURIComponent(key)}`;
}
