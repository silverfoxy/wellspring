/**
 * Cloudflare Access identity verification.
 *
 * When the app sits behind Access, every request includes:
 *   - Cf-Access-Authenticated-User-Email   (verified email)
 *   - Cf-Access-Jwt-Assertion              (signed JWT)
 *
 * We verify the JWT against the Access team's JWKS. The email header alone
 * isn't enough — any origin could spoof it if Access is misconfigured.
 *
 * Required env vars:
 *   ACCESS_TEAM_DOMAIN   e.g. "yourteam.cloudflareaccess.com" (no scheme)
 *   ACCESS_AUD           the AUD tag for this application
 * Optional:
 *   ADMIN_EMAILS         comma-separated list of admin emails
 */

export interface Identity {
  /** Verified email of the signed-in user, if any. */
  email: string | null;
  /** True when Access vouched for this request. */
  isAuthenticated: boolean;
  /** True when the email is in the ADMIN_EMAILS allowlist. */
  isAdmin: boolean;
}

const ANON: Identity = { email: null, isAuthenticated: false, isAdmin: false };

let cachedJwks: { keys: JsonWebKey[]; expiresAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000; // 1h

async function fetchJwks(teamDomain: string): Promise<JsonWebKey[]> {
  if (cachedJwks && cachedJwks.expiresAt > Date.now()) return cachedJwks.keys;
  const url = `https://${teamDomain}/cdn-cgi/access/certs`;
  const res = await fetch(url, { cf: { cacheTtl: 3600 } });
  if (!res.ok) throw new Error(`Failed to fetch Access JWKS: ${res.status}`);
  const data = (await res.json()) as { keys: JsonWebKey[] };
  cachedJwks = { keys: data.keys, expiresAt: Date.now() + JWKS_TTL_MS };
  return data.keys;
}

function base64UrlDecode(input: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (input.length % 4)) % 4);
  const b64 = (input + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

interface JwtHeader {
  alg: string;
  kid: string;
}

interface AccessJwtPayload {
  email?: string;
  aud?: string | string[];
  exp?: number;
  iss?: string;
}

async function verifyJwt(
  token: string,
  teamDomain: string,
  expectedAud: string,
): Promise<AccessJwtPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  let header: JwtHeader;
  let payload: AccessJwtPayload;
  try {
    header = JSON.parse(decodeText(base64UrlDecode(h!))) as JwtHeader;
    payload = JSON.parse(decodeText(base64UrlDecode(p!))) as AccessJwtPayload;
  } catch {
    return null;
  }

  if (header.alg !== 'RS256') return null;

  // exp
  if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) return null;

  // iss
  const expectedIss = `https://${teamDomain}`;
  if (payload.iss !== expectedIss) return null;

  // aud
  const auds = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
  if (!auds.includes(expectedAud)) return null;

  // signature
  const keys = await fetchJwks(teamDomain);
  const jwk = keys.find((k) => (k as JsonWebKey & { kid?: string }).kid === header.kid);
  if (!jwk) return null;

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  const signed = new TextEncoder().encode(`${h}.${p}`);
  const sig = base64UrlDecode(s!);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, signed);
  return ok ? payload : null;
}

function parseAdmins(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

function cookieValue(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1] ?? null;
}

/**
 * Resolve the identity from the incoming request. Returns an anonymous identity
 * when Access isn't configured or the JWT is missing/invalid.
 */
export async function getIdentity(
  request: Request,
  env: Env & { ACCESS_TEAM_DOMAIN?: string; ACCESS_AUD?: string; ADMIN_EMAILS?: string },
): Promise<Identity> {
  const teamDomain = env.ACCESS_TEAM_DOMAIN?.trim();
  const aud = env.ACCESS_AUD?.trim();
  // No Access config — anonymous mode (back-compat with token-only flows).
  if (!teamDomain || !aud) return ANON;

  // On bypass-policy paths CF Access strips the assertion header but the
  // CF_Authorization cookie is still sent by the browser. Fall back to it so
  // authenticated users are recognised on public/bypassed pages.
  const token =
    request.headers.get('Cf-Access-Jwt-Assertion') ||
    cookieValue(request, 'CF_Authorization');
  if (!token) return ANON;

  const payload = await verifyJwt(token, teamDomain, aud);
  if (!payload?.email) return ANON;

  const email = payload.email.toLowerCase();
  const admins = parseAdmins(env.ADMIN_EMAILS);
  return { email, isAuthenticated: true, isAdmin: admins.has(email) };
}

/** Convenience: true if email matches the identity (case-insensitive). */
export function isSameUser(identity: Identity, email: string | null | undefined): boolean {
  if (!identity.email || !email) return false;
  return identity.email === email.toLowerCase();
}
