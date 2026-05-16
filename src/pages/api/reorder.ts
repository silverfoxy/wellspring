import type { APIRoute } from 'astro';
import { getBoardByEditToken, reorderMessages } from '../../lib/db';
import { getEnv } from '../../lib/runtime';
import { getIdentity } from '../../lib/identity';
import { canModerateBoard } from '../../lib/permissions';

export const prerender = false;

/**
 * Re-orders messages on a board. Moderator-only (admin email or edit_token).
 * Body: JSON { edit_token?: string, order: string[] }.
 */
export const POST: APIRoute = async (ctx) => {
  const env = getEnv(ctx);
  const identity = await getIdentity(ctx.request, env);

  let payload: { edit_token?: unknown; order?: unknown };
  try {
    payload = await ctx.request.json();
  } catch {
    return new Response('Expected JSON', { status: 400 });
  }

  const edit_token = typeof payload.edit_token === 'string' ? payload.edit_token : '';
  const order = Array.isArray(payload.order)
    ? payload.order.filter((v): v is string => typeof v === 'string')
    : [];

  if (order.length === 0) return new Response('Non-empty order is required', { status: 400 });
  if (order.length > 500) return new Response('Too many messages', { status: 413 });

  const board = edit_token ? await getBoardByEditToken(env.DB, edit_token) : null;
  if (!board) return new Response('Forbidden', { status: 403 });
  if (!canModerateBoard(identity, board, edit_token || null)) {
    return new Response('Forbidden', { status: 403 });
  }

  await reorderMessages(env.DB, board.id, order);
  return new Response(null, { status: 204 });
};
