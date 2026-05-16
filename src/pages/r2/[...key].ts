import type { APIRoute } from 'astro';
import { getEnv } from '../../lib/runtime';

export const prerender = false;

export const GET: APIRoute = async (ctx) => {
  const env = getEnv(ctx);
  const key = ctx.params.key;
  if (!key) return new Response('Not found', { status: 404 });

  const object = await env.UPLOADS.get(key);
  if (!object) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('etag', object.httpEtag);

  return new Response(object.body, { headers });
};
