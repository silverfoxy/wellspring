import type { APIRoute } from 'astro';
import { getEnv } from '../../lib/runtime';

export const prerender = false;

export const GET: APIRoute = (ctx) => {
  const env = getEnv(ctx);
  const cfLogout = env.ACCESS_TEAM_DOMAIN
    ? `https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/logout`
    : '/';
  return new Response(null, {
    status: 302,
    headers: {
      // Delete the CF Access cookie so our cookie-based identity check
      // immediately sees the user as logged out.
      'Set-Cookie': 'CF_Authorization=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax',
      Location: cfLogout,
    },
  });
};
