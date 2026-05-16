import { defineMiddleware } from 'astro:middleware';
import { getIdentity } from './lib/identity';
import type { Identity } from './lib/identity';

/**
 * Resolve the Cloudflare Access identity once per request and stash it on
 * `Astro.locals.identity` so pages and endpoints can consume it without
 * re-verifying the JWT.
 */
export const onRequest = defineMiddleware(async (ctx, next) => {
  const runtime = (ctx.locals as App.Locals).runtime;
  if (runtime?.env) {
    const identity: Identity = await getIdentity(ctx.request, runtime.env);
    (ctx.locals as App.Locals & { identity: Identity }).identity = identity;
  }
  return next();
});
