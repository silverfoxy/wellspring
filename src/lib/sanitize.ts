/**
 * Tiny HTML sanitizer for our rich-text editor output.
 *
 * Strategy:
 *  - Parse with a regex tokenizer (no DOMParser available in Workers w/o browser-rendering).
 *  - Drop any tag not in the allowlist.
 *  - Per-tag allowlists for attributes.
 *  - `<a>` href must be `http(s):` or `mailto:`; forces `target="_blank" rel="noopener noreferrer"`.
 *  - `style` only allows a fixed set of safe declarations (text-align, font-weight, font-style, text-decoration).
 *
 * NOT a general-purpose sanitizer. Sufficient for the small set of tags our
 * toolbar produces. Sanitize on insert AND on render.
 */

const ALLOWED_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 'br', 'p', 'div', 'span', 'a',
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href']),
  p: new Set(['style']),
  div: new Set(['style']),
  span: new Set(['style']),
};

// Only these CSS declarations are kept in style="..."
const ALLOWED_STYLE_PROPS = new Set([
  'text-align',
  'font-weight',
  'font-style',
  'text-decoration',
]);

const ALLOWED_STYLE_VALUES = /^[a-zA-Z0-9 ,#%()._-]+$/;

const SAFE_URL = /^(https?:|mailto:)/i;

interface AttrPair {
  name: string;
  value: string;
}

function parseAttrs(raw: string): AttrPair[] {
  const out: AttrPair[] = [];
  // attr="value", attr='value', attr=value, or bare attr
  const re = /([a-zA-Z_:][a-zA-Z0-9_.:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    out.push({ name: m[1]!.toLowerCase(), value: m[2] ?? m[3] ?? m[4] ?? '' });
  }
  return out;
}

function sanitizeStyle(value: string): string {
  const decls = value
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean);
  const keep: string[] = [];
  for (const d of decls) {
    const idx = d.indexOf(':');
    if (idx < 0) continue;
    const prop = d.slice(0, idx).trim().toLowerCase();
    const val = d.slice(idx + 1).trim();
    if (!ALLOWED_STYLE_PROPS.has(prop)) continue;
    if (!ALLOWED_STYLE_VALUES.test(val)) continue;
    keep.push(`${prop}: ${val}`);
  }
  return keep.join('; ');
}

function escapeAttr(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!,
  );
}

// Matches a valid HTML entity reference we should leave alone:
//   &name;   (e.g. &nbsp; &amp; &lt; &copy;)
//   &#123;   (numeric, decimal)
//   &#x1F;   (numeric, hex)
const VALID_ENTITY = /^&(?:#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]+);/;

function escapeText(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === '<') {
      out += '&lt;';
    } else if (c === '>') {
      out += '&gt;';
    } else if (c === '&') {
      // Preserve existing valid entity references; escape stray ampersands.
      const tail = s.slice(i);
      const m = tail.match(VALID_ENTITY);
      if (m) {
        out += m[0];
        i += m[0].length - 1;
      } else {
        out += '&amp;';
      }
    } else {
      out += c;
    }
  }
  return out;
}

export function sanitizeHtml(input: string): string {
  if (!input) return '';
  // Cap input length to keep this cheap (rendered text is also capped server-side).
  const src = input.slice(0, 20000);
  let out = '';
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) {
      out += escapeText(src.slice(i));
      break;
    }
    if (lt > i) out += escapeText(src.slice(i, lt));

    const gt = src.indexOf('>', lt);
    if (gt < 0) {
      // Unterminated tag — escape the rest.
      out += escapeText(src.slice(lt));
      break;
    }

    const tagRaw = src.slice(lt + 1, gt);
    const closing = tagRaw.startsWith('/');
    const nameMatch = (closing ? tagRaw.slice(1) : tagRaw).match(/^([a-zA-Z][a-zA-Z0-9]*)/);
    if (!nameMatch) {
      // Not a real tag (e.g. <!--, <?, weird chars) — drop entirely.
      i = gt + 1;
      continue;
    }
    const tag = nameMatch[1]!.toLowerCase();

    if (!ALLOWED_TAGS.has(tag)) {
      i = gt + 1;
      continue;
    }

    if (closing) {
      out += `</${tag}>`;
      i = gt + 1;
      continue;
    }

    // Opening tag — process attrs.
    const attrRaw = tagRaw.slice(nameMatch[0]!.length);
    const attrs = parseAttrs(attrRaw);
    const allowed = ALLOWED_ATTRS[tag] ?? new Set<string>();
    const kept: string[] = [];
    let safeHref = '';
    for (const { name, value } of attrs) {
      if (!allowed.has(name)) continue;
      if (name === 'href') {
        if (SAFE_URL.test(value)) safeHref = value;
        continue;
      }
      if (name === 'style') {
        const clean = sanitizeStyle(value);
        if (clean) kept.push(`style="${escapeAttr(clean)}"`);
        continue;
      }
      kept.push(`${name}="${escapeAttr(value)}"`);
    }

    if (tag === 'a') {
      if (!safeHref) {
        // Drop <a> with no safe href entirely (its content is preserved).
        i = gt + 1;
        continue;
      }
      kept.push(`href="${escapeAttr(safeHref)}"`);
      kept.push('target="_blank"');
      kept.push('rel="noopener noreferrer"');
    }

    // Self-closing <br>
    if (tag === 'br') {
      out += '<br>';
      i = gt + 1;
      continue;
    }

    out += `<${tag}${kept.length ? ' ' + kept.join(' ') : ''}>`;
    i = gt + 1;
  }
  return out;
}

/** Strip all tags and return a plain-text fallback (used for the `body` column). */
export function htmlToText(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>|<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
