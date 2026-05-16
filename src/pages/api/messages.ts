import type { APIRoute } from 'astro';
import { createMessage, getBoardByViewToken } from '../../lib/db';
import { getEnv } from '../../lib/runtime';
import { getIdentity } from '../../lib/identity';
import { canPostToBoard } from '../../lib/permissions';
import { sanitizeHtml, htmlToText } from '../../lib/sanitize';
import { NOTE_MOTIFS } from '../../lib/types';

const VALID_MOTIF_IDS = new Set<string>(NOTE_MOTIFS.map((m) => m.id));

export const prerender = false;

const MAX_BODY_LEN = 2000;
const MAX_AUTHOR_LEN = 60;

// Only allow GIPHY-hosted GIF URLs to prevent the field becoming an arbitrary image embed.
const ALLOWED_IMAGE_HOSTS = ['media.giphy.com', 'i.giphy.com', 'media0.giphy.com', 'media1.giphy.com', 'media2.giphy.com', 'media3.giphy.com', 'media4.giphy.com'];

function validateGifUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    if (!ALLOWED_IMAGE_HOSTS.includes(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export const POST: APIRoute = async (ctx) => {
  const env = getEnv(ctx);
  const identity = await getIdentity(ctx.request, env);
  const form = await ctx.request.formData().catch(() => null);
  if (!form) return new Response('Expected form data', { status: 400 });

  const view_token = String(form.get('view_token') ?? '');
  const author = String(form.get('author') ?? '').trim();
  const body_html_raw = String(form.get('body_html') ?? '').trim();
  const body_html = body_html_raw ? sanitizeHtml(body_html_raw) : '';
  // Plain-text fallback: prefer the explicit `body` field if sent, else derive from HTML.
  const body = (String(form.get('body') ?? '').trim() || htmlToText(body_html)).slice(0, MAX_BODY_LEN);
  const color = String(form.get('color') ?? '#fff8c5');
  const motif_raw = String(form.get('motif') ?? '').trim();
  const motif = VALID_MOTIF_IDS.has(motif_raw) && motif_raw !== 'none' ? motif_raw : null;
  const image_key_raw = String(form.get('image_key') ?? '').trim();
  const image_url_raw = String(form.get('image_url') ?? '').trim();
  const image_key = image_key_raw || null;
  const image_url = image_url_raw ? validateGifUrl(image_url_raw) : null;

  if (!view_token || !author || (!body && !image_key && !image_url)) {
    return new Response('author and body (or image) are required', { status: 400 });
  }
  if (author.length > MAX_AUTHOR_LEN || body.length > MAX_BODY_LEN) {
    return new Response('input too long', { status: 400 });
  }

  const board = await getBoardByViewToken(env.DB, view_token);
  if (!board) return new Response('Board not found', { status: 404 });
  if (!canPostToBoard(identity, board, view_token)) {
    return new Response('Board is locked or sign-in required', { status: 403 });
  }

  await createMessage(env.DB, {
    board_id: board.id,
    author,
    author_email: identity.email,
    body,
    body_html: body_html || null,
    color,
    motif,
    image_key,
    image_url,
  });

  return ctx.redirect(`/b/${board.view_token}#new`, 303);
};
