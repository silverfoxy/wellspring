import type { APIRoute } from 'astro';
import { createBoard } from '../../lib/db';
import { getEnv } from '../../lib/runtime';
import { getIdentity } from '../../lib/identity';
import { canCreateBoard } from '../../lib/permissions';
import { BOARD_BACKGROUNDS } from '../../lib/types';

export const prerender = false;

const VALID_BACKGROUND_IDS = new Set<string>(BOARD_BACKGROUNDS.map((b) => b.id));

export const POST: APIRoute = async (ctx) => {
  const env = getEnv(ctx);
  const identity = await getIdentity(ctx.request, env);
  const accessConfigured = Boolean(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD);
  if (!canCreateBoard(identity, accessConfigured)) {
    const msg = identity.isAuthenticated
      ? 'Only site admins can create boards. Ask an admin to add your email to ADMIN_EMAILS.'
      : 'Sign-in required to create a board.';
    return new Response(msg, { status: 403 });
  }

  let form: FormData;
  try {
    form = await ctx.request.formData();
  } catch {
    return new Response('Expected form data', { status: 400 });
  }

  const title = String(form.get('title') ?? '').trim();
  const recipient = String(form.get('recipient') ?? '').trim();
  const theme = String(form.get('theme') ?? 'default').trim();
  const background_raw = String(form.get('background') ?? '').trim();
  const background = VALID_BACKGROUND_IDS.has(background_raw) && background_raw !== 'none'
    ? background_raw
    : null;
  const created_by = String(form.get('created_by') ?? '').trim() || undefined;

  if (!title || !recipient) {
    return new Response('title and recipient are required', { status: 400 });
  }
  if (title.length > 120 || recipient.length > 80) {
    return new Response('title/recipient too long', { status: 400 });
  }

  const board = await createBoard(env.DB, {
    title,
    recipient,
    theme,
    background,
    created_by,
    created_by_email: identity.email,
  });

  // Redirect creator to the edit dashboard
  return ctx.redirect(`/b/${board.view_token}/edit/${board.edit_token}`, 303);
};
