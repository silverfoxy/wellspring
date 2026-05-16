import type { APIRoute } from 'astro';
import { getEnv } from '../../lib/runtime';

export const prerender = false;

interface GiphyImage {
  url: string;
  width: string;
  height: string;
}

interface GiphyItem {
  id: string;
  title: string;
  images: {
    fixed_width: GiphyImage;
    fixed_height_small: GiphyImage;
    original: GiphyImage;
  };
}

interface GiphyResponse {
  data: GiphyItem[];
}

/**
 * Proxies the GIPHY search API so the key stays server-side.
 * Set the GIPHY_API_KEY secret: `npx wrangler secret put GIPHY_API_KEY`
 */
export const GET: APIRoute = async (ctx) => {
  const env = getEnv(ctx) as Env & { GIPHY_API_KEY?: string };
  const apiKey = env.GIPHY_API_KEY?.trim();
  if (!apiKey) {
    return new Response('GIPHY not configured. Set GIPHY_API_KEY secret.', { status: 501 });
  }

  const q = ctx.url.searchParams.get('q')?.trim() ?? '';
  const limit = Math.min(Number(ctx.url.searchParams.get('limit') ?? 24), 50);

  const params = new URLSearchParams({
    api_key: apiKey,
    limit: String(limit),
    rating: 'pg-13',
  });
  if (q) params.set('q', q);

  const endpoint = q
    ? `https://api.giphy.com/v1/gifs/search?${params.toString()}`
    : `https://api.giphy.com/v1/gifs/trending?${params.toString()}`;

  const res = await fetch(endpoint);
  if (!res.ok) {
    console.error('GIPHY API error', { status: res.status });
    return new Response('Upstream error', { status: 502 });
  }

  const data = (await res.json()) as GiphyResponse;

  // Trim payload to only what the client needs.
  const items = data.data.map((g) => ({
    id: g.id,
    title: g.title,
    preview: g.images.fixed_width.url,
    full: g.images.original.url,
  }));

  return Response.json(
    { items },
    {
      headers: {
        // Cache trending results briefly at the edge.
        'Cache-Control': q ? 'public, max-age=60' : 'public, max-age=300',
      },
    },
  );
};
