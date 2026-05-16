import type { APIRoute } from 'astro';
import { getBoardByEditToken } from '../../lib/db';
import { getEnv } from '../../lib/runtime';
import { getIdentity } from '../../lib/identity';
import { canModerateBoard } from '../../lib/permissions';

export const prerender = false;

/**
 * Exports a board as a PDF using Cloudflare Browser Run.
 *
 * Requires either:
 *  - A Browser Run binding `BROWSER` (uncomment in wrangler.jsonc), OR
 *  - Secrets `CF_ACCOUNT_ID` and `CF_API_TOKEN` set with `wrangler secret put`,
 *    and Browser Run enabled on your account.
 *
 * This route uses the REST API path for simplicity. Swap to `env.BROWSER.fetch(...)`
 * if you prefer the binding approach (no API token needed).
 */
export const GET: APIRoute = async (ctx) => {
  const env = getEnv(ctx) as Env & {
    CF_ACCOUNT_ID?: string;
    CF_API_TOKEN?: string;
  };
  const identity = await getIdentity(ctx.request, env);

  const edit_token = ctx.url.searchParams.get('edit_token') ?? '';
  const format = ctx.url.searchParams.get('format') === 'png' ? 'png' : 'pdf';

  const board = await getBoardByEditToken(env.DB, edit_token);
  if (!board) return new Response('Forbidden', { status: 403 });
  if (!canModerateBoard(identity, board, edit_token)) {
    return new Response('Forbidden', { status: 403 });
  }

  const accountId = env.CF_ACCOUNT_ID;
  const apiToken = env.CF_API_TOKEN;
  if (!accountId || !apiToken) {
    return new Response(
      'Export not configured. Set CF_ACCOUNT_ID and CF_API_TOKEN secrets with `wrangler secret put`.',
      { status: 501 },
    );
  }

  const origin = ctx.url.origin;
  const printUrl = `${origin}/b/${board.view_token}?print=1`;

  const endpoint =
    format === 'pdf'
      ? `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/pdf`
      : `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/screenshot`;

  const body =
    format === 'pdf'
      ? { url: printUrl, viewport: { width: 1200, height: 1600 } }
      : {
          url: printUrl,
          screenshotOptions: { fullPage: true, type: 'png' },
          viewport: { width: 1200, height: 1600 },
        };

  const upstream = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    console.error('Browser Run export failed', { status: upstream.status, text });
    return new Response('Export failed', { status: 502 });
  }

  const fileName = `${board.recipient.replace(/[^a-z0-9-_]/gi, '_')}_wellspring.${format}`;
  return new Response(upstream.body, {
    headers: {
      'Content-Type': format === 'pdf' ? 'application/pdf' : 'image/png',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  });
};
