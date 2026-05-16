import type { APIRoute } from 'astro';
import {
  deleteMessage,
  getBoardByEditToken,
  getBoardByViewToken,
  getMessage,
  setBoardLocked,
  setMessageHidden,
} from '../../lib/db';
import { getEnv } from '../../lib/runtime';
import { getIdentity, isSameUser } from '../../lib/identity';
import { canEditOwnMessage, canModerateBoard } from '../../lib/permissions';

export const prerender = false;

/**
 * Combined moderation endpoint.
 * - Full-board actions (hide/show/lock/unlock/delete-any): require edit_token OR admin/creator identity.
 * - "delete-own": message author can delete their own message (no token needed).
 *
 * Required form fields: action, message_id (for message-scoped actions),
 *   plus either edit_token (moderator path) or view_token (self-edit path).
 */
export const POST: APIRoute = async (ctx) => {
  const env = getEnv(ctx);
  const identity = await getIdentity(ctx.request, env);
  const form = await ctx.request.formData().catch(() => null);
  if (!form) return new Response('Expected form data', { status: 400 });

  const edit_token = form.get('edit_token') ? String(form.get('edit_token')) : null;
  const view_token = form.get('view_token') ? String(form.get('view_token')) : null;
  const action = String(form.get('action') ?? '');
  const message_id = String(form.get('message_id') ?? '');

  // Resolve the board via whichever token was provided.
  const board = edit_token
    ? await getBoardByEditToken(env.DB, edit_token)
    : view_token
      ? await getBoardByViewToken(env.DB, view_token)
      : null;
  if (!board) return new Response('Forbidden', { status: 403 });

  const isModerator = canModerateBoard(identity, board, edit_token);

  const moderatorActions = new Set(['hide', 'show', 'lock', 'unlock']);
  if (moderatorActions.has(action) && !isModerator) {
    return new Response('Forbidden', { status: 403 });
  }

  switch (action) {
    case 'hide':
      await setMessageHidden(env.DB, board.id, message_id, true);
      break;
    case 'show':
      await setMessageHidden(env.DB, board.id, message_id, false);
      break;
    case 'delete': {
      // Moderator can delete anything; otherwise the author can delete their own.
      if (!isModerator) {
        const msg = await getMessage(env.DB, board.id, message_id);
        if (!msg || !canEditOwnMessage(identity, board, msg, edit_token)) {
          return new Response('Forbidden', { status: 403 });
        }
      }
      const key = await deleteMessage(env.DB, board.id, message_id);
      if (key) {
        await env.UPLOADS.delete(key).catch(() => {});
      }
      break;
    }
    case 'lock':
      await setBoardLocked(env.DB, board.id, true);
      break;
    case 'unlock':
      await setBoardLocked(env.DB, board.id, false);
      break;
    default:
      return new Response('Unknown action', { status: 400 });
  }

  // Redirect back to wherever the user came from.
  if (isModerator && edit_token) {
    return ctx.redirect(`/b/${board.view_token}/edit/${board.edit_token}`, 303);
  }
  return ctx.redirect(`/b/${board.view_token}`, 303);
};

// Quiet the linter: helper is exported here for symmetry but kept silent.
void isSameUser;
