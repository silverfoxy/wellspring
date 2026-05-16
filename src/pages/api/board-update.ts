import type { APIRoute } from 'astro';
import {
  getBoardByEditToken,
  setBoardBackground,
  setBoardTheme,
  updateBoardMeta,
} from '../../lib/db';
import { getEnv } from '../../lib/runtime';
import { getIdentity } from '../../lib/identity';
import { canModerateBoard } from '../../lib/permissions';
import { BOARD_BACKGROUNDS, THEMES } from '../../lib/types';

export const prerender = false;

const VALID_THEME_IDS = new Set<string>(THEMES.map((t) => t.id));
const VALID_BG_IDS = new Set<string>(BOARD_BACKGROUNDS.map((b) => b.id));

/**
 * Updates board appearance (theme color + background pattern). Creator only.
 * Form fields: edit_token, theme, background.
 */
export const POST: APIRoute = async (ctx) => {
  const env = getEnv(ctx);
  const identity = await getIdentity(ctx.request, env);
  const form = await ctx.request.formData().catch(() => null);
  if (!form) return new Response('Expected form data', { status: 400 });

  const edit_token = String(form.get('edit_token') ?? '');
  const theme_raw = String(form.get('theme') ?? '').trim();
  const background_raw = String(form.get('background') ?? '').trim();
  const title_raw = form.has('title') ? String(form.get('title') ?? '').trim() : null;
  const recipient_raw = form.has('recipient') ? String(form.get('recipient') ?? '').trim() : null;

  if (title_raw !== null && (title_raw.length === 0 || title_raw.length > 120)) {
    return new Response('Title must be 1-120 chars', { status: 400 });
  }
  if (recipient_raw !== null && (recipient_raw.length === 0 || recipient_raw.length > 80)) {
    return new Response('Recipient must be 1-80 chars', { status: 400 });
  }

  const board = await getBoardByEditToken(env.DB, edit_token);
  if (!board) return new Response('Forbidden', { status: 403 });
  if (!canModerateBoard(identity, board, edit_token)) {
    return new Response('Forbidden', { status: 403 });
  }

  const meta: { title?: string; recipient?: string } = {};
  if (title_raw !== null && title_raw !== board.title) meta.title = title_raw;
  if (recipient_raw !== null && recipient_raw !== board.recipient) meta.recipient = recipient_raw;
  if (Object.keys(meta).length > 0) {
    await updateBoardMeta(env.DB, board.id, meta);
  }

  if (theme_raw && VALID_THEME_IDS.has(theme_raw) && theme_raw !== board.theme) {
    await setBoardTheme(env.DB, board.id, theme_raw);
  }

  if (background_raw && VALID_BG_IDS.has(background_raw)) {
    const next = background_raw === 'none' ? null : background_raw;
    if (next !== board.background) {
      await setBoardBackground(env.DB, board.id, next);
    }
  }

  return ctx.redirect(`/b/${board.view_token}/edit/${board.edit_token}`, 303);
};
