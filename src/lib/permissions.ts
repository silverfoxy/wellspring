import type { Board, Message } from './types';
import { isSameUser, type Identity } from './identity';

/**
 * Single source of truth for "can this user X this thing".
 * Each helper accepts the identity and the relevant rows; tokens are still
 * honored as fallbacks for backward compatibility (and for external recipients).
 */

export function canModerateBoard(
  identity: Identity,
  board: Board,
  providedEditToken: string | null,
): boolean {
  if (identity.isAdmin) return true;
  if (isSameUser(identity, board.created_by_email)) return true;
  if (providedEditToken && providedEditToken === board.edit_token) return true;
  return false;
}

export function canEditOwnMessage(
  identity: Identity,
  board: Board,
  message: Message,
  providedEditToken: string | null,
): boolean {
  if (canModerateBoard(identity, board, providedEditToken)) return true;
  return isSameUser(identity, message.author_email);
}

export function canPostToBoard(
  identity: Identity,
  board: Board,
  providedViewToken: string | null,
): boolean {
  if (board.locked === 1) return false;
  // Identity is sufficient when Access is enabled and the user is logged in.
  if (identity.isAuthenticated) return true;
  // Otherwise require the view token (back-compat / non-Access mode).
  return providedViewToken !== null && providedViewToken === board.view_token;
}

/**
 * Decides whether the request can reach the create-board flow.
 *  - No Access configured: anyone can create (single-tenant / dev mode).
 *  - Access configured: only admins (ADMIN_EMAILS) can create.
 * Posting / signing existing boards stays open to any authenticated user;
 * see `canPostToBoard`.
 */
export function canCreateBoard(identity: Identity, accessConfigured: boolean): boolean {
  if (!accessConfigured) return true;
  return identity.isAdmin;
}
