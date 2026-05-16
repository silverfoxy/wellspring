import { nanoid } from 'nanoid';
import type { Board, Message } from './types';

const BOARD_ID_LEN = 12;
const TOKEN_LEN = 24;

export interface CreateBoardInput {
  title: string;
  recipient: string;
  theme: string;
  background?: string | null;
  created_by?: string;
  created_by_email?: string | null;
}

export async function createBoard(db: D1Database, input: CreateBoardInput): Promise<Board> {
  const board: Board = {
    id: nanoid(BOARD_ID_LEN),
    title: input.title,
    recipient: input.recipient,
    theme: input.theme || 'default',
    background: input.background ?? null,
    view_token: nanoid(TOKEN_LEN),
    edit_token: nanoid(TOKEN_LEN),
    recipient_token: nanoid(TOKEN_LEN),
    locked: 0,
    created_at: Math.floor(Date.now() / 1000),
    created_by: input.created_by ?? null,
    created_by_email: input.created_by_email ?? null,
  };

  await db
    .prepare(
      `INSERT INTO boards (id, title, recipient, theme, background, view_token, edit_token, recipient_token, locked, created_at, created_by, created_by_email)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    )
    .bind(
      board.id,
      board.title,
      board.recipient,
      board.theme,
      board.background,
      board.view_token,
      board.edit_token,
      board.recipient_token,
      board.created_at,
      board.created_by,
      board.created_by_email,
    )
    .run();

  return board;
}

export async function setBoardBackground(
  db: D1Database,
  boardId: string,
  background: string | null,
): Promise<void> {
  await db
    .prepare(`UPDATE boards SET background = ? WHERE id = ?`)
    .bind(background, boardId)
    .run();
}

export async function setBoardTheme(
  db: D1Database,
  boardId: string,
  theme: string,
): Promise<void> {
  await db
    .prepare(`UPDATE boards SET theme = ? WHERE id = ?`)
    .bind(theme, boardId)
    .run();
}

export interface BoardMetaUpdate {
  title?: string;
  recipient?: string;
}

export async function updateBoardMeta(
  db: D1Database,
  boardId: string,
  update: BoardMetaUpdate,
): Promise<void> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (update.title !== undefined) {
    sets.push('title = ?');
    binds.push(update.title);
  }
  if (update.recipient !== undefined) {
    sets.push('recipient = ?');
    binds.push(update.recipient);
  }
  if (sets.length === 0) return;
  binds.push(boardId);
  await db
    .prepare(`UPDATE boards SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run();
}

export async function getBoardByViewToken(db: D1Database, token: string): Promise<Board | null> {
  const row = await db
    .prepare(`SELECT * FROM boards WHERE view_token = ?`)
    .bind(token)
    .first<Board>();
  return row ?? null;
}

export async function getBoardByEditToken(db: D1Database, token: string): Promise<Board | null> {
  const row = await db
    .prepare(`SELECT * FROM boards WHERE edit_token = ?`)
    .bind(token)
    .first<Board>();
  return row ?? null;
}

export async function getBoardByRecipientToken(
  db: D1Database,
  token: string,
): Promise<Board | null> {
  const row = await db
    .prepare(`SELECT * FROM boards WHERE recipient_token = ?`)
    .bind(token)
    .first<Board>();
  return row ?? null;
}

export async function listMessages(
  db: D1Database,
  boardId: string,
  includeHidden = false,
): Promise<Message[]> {
  // Manual positions sort first (smallest position = first); unset positions fall back to newest first.
  const q = includeHidden
    ? `SELECT * FROM messages WHERE board_id = ?
       ORDER BY (position IS NULL), position ASC, created_at DESC`
    : `SELECT * FROM messages WHERE board_id = ? AND hidden = 0
       ORDER BY (position IS NULL), position ASC, created_at DESC`;
  const res = await db.prepare(q).bind(boardId).all<Message>();
  return res.results ?? [];
}

/**
 * Re-sets the position of every message provided, in the order given.
 * Uses 1-based incrementing positions so future inserts (NULL position) still
 * sort after them by default.
 */
export async function reorderMessages(
  db: D1Database,
  boardId: string,
  orderedIds: string[],
): Promise<void> {
  if (orderedIds.length === 0) return;
  const stmts = orderedIds.map((id, idx) =>
    db
      .prepare(`UPDATE messages SET position = ? WHERE id = ? AND board_id = ?`)
      .bind(idx + 1, id, boardId),
  );
  await db.batch(stmts);
}

export interface CreateMessageInput {
  board_id: string;
  author: string;
  author_email?: string | null;
  body: string;
  body_html?: string | null;
  color?: string;
  motif?: string | null;
  image_key?: string | null;
  image_url?: string | null;
}

export async function createMessage(db: D1Database, input: CreateMessageInput): Promise<Message> {
  const msg: Message = {
    id: nanoid(16),
    board_id: input.board_id,
    author: input.author,
    author_email: input.author_email ?? null,
    body: input.body,
    body_html: input.body_html ?? null,
    color: input.color || '#fff8c5',
    motif: input.motif ?? null,
    image_key: input.image_key ?? null,
    image_url: input.image_url ?? null,
    hidden: 0,
    created_at: Math.floor(Date.now() / 1000),
    position: null,
  };
  await db
    .prepare(
      `INSERT INTO messages (id, board_id, author, author_email, body, body_html, color, motif, image_key, image_url, hidden, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    )
    .bind(
      msg.id,
      msg.board_id,
      msg.author,
      msg.author_email,
      msg.body,
      msg.body_html,
      msg.color,
      msg.motif,
      msg.image_key,
      msg.image_url,
      msg.created_at,
    )
    .run();
  return msg;
}

/** Returns the message row if it exists, regardless of hidden state. */
export async function getMessage(
  db: D1Database,
  boardId: string,
  messageId: string,
): Promise<Message | null> {
  const row = await db
    .prepare(`SELECT * FROM messages WHERE id = ? AND board_id = ?`)
    .bind(messageId, boardId)
    .first<Message>();
  return row ?? null;
}

export interface UpdateMessageInput {
  body?: string;
  body_html?: string | null;
  color?: string;
  motif?: string | null;
  image_key?: string | null;
  image_url?: string | null;
}

export async function updateMessage(
  db: D1Database,
  boardId: string,
  messageId: string,
  input: UpdateMessageInput,
): Promise<void> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  const fields = ['body', 'body_html', 'color', 'motif', 'image_key', 'image_url'] as const;
  for (const f of fields) {
    if (input[f] !== undefined) {
      sets.push(`${f} = ?`);
      binds.push(input[f]);
    }
  }
  if (sets.length === 0) return;
  binds.push(messageId, boardId);
  await db
    .prepare(`UPDATE messages SET ${sets.join(', ')} WHERE id = ? AND board_id = ?`)
    .bind(...binds)
    .run();
}

export async function setMessageHidden(
  db: D1Database,
  boardId: string,
  messageId: string,
  hidden: boolean,
): Promise<void> {
  await db
    .prepare(`UPDATE messages SET hidden = ? WHERE id = ? AND board_id = ?`)
    .bind(hidden ? 1 : 0, messageId, boardId)
    .run();
}

export async function deleteMessage(
  db: D1Database,
  boardId: string,
  messageId: string,
): Promise<string | null> {
  // Return image_key so caller can clean up R2
  const row = await db
    .prepare(`SELECT image_key FROM messages WHERE id = ? AND board_id = ?`)
    .bind(messageId, boardId)
    .first<{ image_key: string | null }>();
  if (!row) return null;
  await db
    .prepare(`DELETE FROM messages WHERE id = ? AND board_id = ?`)
    .bind(messageId, boardId)
    .run();
  return row.image_key;
}

export async function setBoardLocked(
  db: D1Database,
  boardId: string,
  locked: boolean,
): Promise<void> {
  await db
    .prepare(`UPDATE boards SET locked = ? WHERE id = ?`)
    .bind(locked ? 1 : 0, boardId)
    .run();
}
