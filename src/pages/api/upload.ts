import type { APIRoute } from 'astro';
import { nanoid } from 'nanoid';
import { getBoardByViewToken } from '../../lib/db';
import { getEnv } from '../../lib/runtime';
import { getIdentity } from '../../lib/identity';
import { canPostToBoard } from '../../lib/permissions';

export const prerender = false;

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

/**
 * Accepts a multipart upload from the contributor form and stores it in R2.
 * Returns JSON { key } that the client embeds in the message form before submit.
 *
 * For larger files / direct browser uploads, swap this out for an R2 presigned URL.
 */
export const POST: APIRoute = async (ctx) => {
  const env = getEnv(ctx);
  const identity = await getIdentity(ctx.request, env);
  const maxBytes = Number(env.MAX_UPLOAD_BYTES) || 8 * 1024 * 1024;

  const form = await ctx.request.formData().catch(() => null);
  if (!form) return new Response('Expected multipart form', { status: 400 });

  const view_token = String(form.get('view_token') ?? '');
  const file = form.get('file');

  if (!view_token || !(file instanceof File)) {
    return new Response('view_token and file are required', { status: 400 });
  }

  const board = await getBoardByViewToken(env.DB, view_token);
  if (!board) return new Response('Board not found', { status: 404 });
  if (!canPostToBoard(identity, board, view_token)) {
    return new Response('Board is locked or sign-in required', { status: 403 });
  }

  if (!ALLOWED_MIME.has(file.type)) {
    return new Response(`Unsupported type: ${file.type}`, { status: 415 });
  }
  if (file.size > maxBytes) {
    return new Response(`File too large (max ${maxBytes} bytes)`, { status: 413 });
  }

  const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'bin';
  const key = `boards/${board.id}/${nanoid(16)}.${ext}`;

  // R2.put() needs a known length when passed a stream. Buffer the file
  // (it's already <= MAX_UPLOAD_BYTES, default 8 MB).
  const bytes = await file.arrayBuffer();

  await env.UPLOADS.put(key, bytes, {
    httpMetadata: { contentType: file.type },
  });

  return Response.json({ key });
};
