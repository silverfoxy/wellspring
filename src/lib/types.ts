export interface Board {
  id: string;
  title: string;
  recipient: string;
  theme: string;
  background: string | null;
  view_token: string;
  edit_token: string;
  recipient_token: string;
  locked: number;
  created_at: number;
  created_by: string | null;
  created_by_email: string | null;
}

export interface Message {
  id: string;
  board_id: string;
  author: string;
  author_email: string | null;
  body: string;
  body_html: string | null;
  color: string;
  motif: string | null;
  image_key: string | null;
  image_url: string | null;
  hidden: number;
  created_at: number;
  position: number | null;
}

/**
 * Decorative SVG patterns rendered behind the page background.
 * Each value is a CSS `background-image` (data: URI). Kept low-opacity so they
 * don't fight the notes. `size` controls the repeat tile size.
 */
function svgUrl(svg: string): string {
  // url-encode the minimum set so it's a valid data: URI
  const encoded = svg
    .replace(/\n/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/"/g, "'")
    .replace(/#/g, '%23')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E');
  return `url("data:image/svg+xml,${encoded}")`;
}

// Confetti dots
const PATTERN_CONFETTI = svgUrl(`
  <svg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'>
    <g fill='#f59e0b' opacity='0.25'>
      <circle cx='10' cy='15' r='3'/>
      <rect x='55' y='20' width='6' height='3' rx='1.5' transform='rotate(30 58 21)'/>
      <circle cx='30' cy='45' r='2.5' fill='#ec4899'/>
      <rect x='65' y='55' width='5' height='3' rx='1.5' fill='#8b5cf6' transform='rotate(-20 67 56)'/>
      <circle cx='15' cy='70' r='2' fill='#10b981'/>
      <rect x='40' y='65' width='5' height='3' rx='1.5' fill='#3b82f6' transform='rotate(45 42 66)'/>
    </g>
  </svg>
`);

// Cloud puffs
const PATTERN_SKY = svgUrl(`
  <svg xmlns='http://www.w3.org/2000/svg' width='160' height='100' viewBox='0 0 160 100'>
    <g fill='#ffffff' opacity='0.6'>
      <ellipse cx='30' cy='30' rx='22' ry='10'/>
      <ellipse cx='40' cy='25' rx='12' ry='8'/>
      <ellipse cx='110' cy='70' rx='25' ry='11'/>
      <ellipse cx='120' cy='65' rx='14' ry='8'/>
    </g>
  </svg>
`);

// Hearts
const PATTERN_ROSE = svgUrl(`
  <svg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'>
    <g fill='#e11d48' opacity='0.18'>
      <path d='M20 20 C 20 14, 28 12, 28 18 C 28 12, 36 14, 36 20 C 36 26, 28 32, 28 32 C 28 32, 20 26, 20 20 Z'/>
      <path d='M55 55 C 55 49, 63 47, 63 53 C 63 47, 71 49, 71 55 C 71 61, 63 67, 63 67 C 63 67, 55 61, 55 55 Z'/>
    </g>
  </svg>
`);

// Mint leaves
const PATTERN_MINT = svgUrl(`
  <svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'>
    <g fill='#059669' opacity='0.2'>
      <path d='M20 30 C 10 20, 25 8, 38 18 C 50 28, 35 40, 20 30 Z M29 24 L 35 35' stroke='#059669' stroke-width='1' fill='#10b981'/>
      <path d='M70 70 C 60 60, 75 48, 88 58 C 100 68, 85 80, 70 70 Z M79 64 L 85 75' stroke='#059669' stroke-width='1' fill='#10b981'/>
      <path d='M75 18 C 70 10, 82 5, 88 13 C 93 22, 82 28, 75 18 Z' fill='#10b981'/>
    </g>
  </svg>
`);

// Lavender sprigs
const PATTERN_LAVENDER = svgUrl(`
  <svg xmlns='http://www.w3.org/2000/svg' width='100' height='120' viewBox='0 0 100 120'>
    <g opacity='0.28'>
      <g transform='translate(20 10)'>
        <line x1='10' y1='5' x2='10' y2='55' stroke='#7c3aed' stroke-width='1.5'/>
        <circle cx='10' cy='10' r='3' fill='#a78bfa'/>
        <circle cx='7' cy='18' r='3' fill='#a78bfa'/>
        <circle cx='13' cy='18' r='3' fill='#a78bfa'/>
        <circle cx='10' cy='26' r='3' fill='#a78bfa'/>
        <circle cx='7' cy='34' r='3' fill='#a78bfa'/>
        <circle cx='13' cy='34' r='3' fill='#a78bfa'/>
      </g>
      <g transform='translate(65 60) rotate(20)'>
        <line x1='10' y1='5' x2='10' y2='50' stroke='#7c3aed' stroke-width='1.5'/>
        <circle cx='10' cy='10' r='3' fill='#a78bfa'/>
        <circle cx='7' cy='18' r='3' fill='#a78bfa'/>
        <circle cx='13' cy='18' r='3' fill='#a78bfa'/>
        <circle cx='10' cy='26' r='3' fill='#a78bfa'/>
      </g>
    </g>
  </svg>
`);

export const THEMES = [
  {
    id: 'default',
    name: 'Confetti',
    bg: 'linear-gradient(135deg,#fef3c7,#fde68a)',
    pattern: PATTERN_CONFETTI,
    patternSize: '80px 80px',
  },
  {
    id: 'sky',
    name: 'Sky',
    bg: 'linear-gradient(135deg,#dbeafe,#bfdbfe)',
    pattern: PATTERN_SKY,
    patternSize: '160px 100px',
  },
  {
    id: 'rose',
    name: 'Rose',
    bg: 'linear-gradient(135deg,#ffe4e6,#fecdd3)',
    pattern: PATTERN_ROSE,
    patternSize: '80px 80px',
  },
  {
    id: 'mint',
    name: 'Mint',
    bg: 'linear-gradient(135deg,#d1fae5,#a7f3d0)',
    pattern: PATTERN_MINT,
    patternSize: '100px 100px',
  },
  {
    id: 'lavender',
    name: 'Lavender',
    bg: 'linear-gradient(135deg,#ede9fe,#ddd6fe)',
    pattern: PATTERN_LAVENDER,
    patternSize: '100px 120px',
  },
] as const;

export const NOTE_COLORS = [
  '#fff8c5', '#fecdd3', '#bfdbfe', '#a7f3d0', '#ddd6fe', '#fed7aa', '#fbcfe8',
];

/**
 * Optional decorative motifs for individual notes. Each entry has a small label
 * (used in the picker) and a CSS `background-image` value that gets tiled in
 * the corner of the note as a low-opacity watermark.
 */
export interface NoteMotif {
  id: string;
  label: string;
  emoji: string;     // shown in the picker
  pattern: string;   // CSS background-image
  size: string;      // tile size
}

export const NOTE_MOTIFS: readonly NoteMotif[] = [
  { id: 'none', label: 'None', emoji: '∅', pattern: 'none', size: '0 0' },
  {
    id: 'hearts',
    label: 'Hearts',
    emoji: '💗',
    pattern: svgUrl(`
      <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'>
        <g opacity='0.85'>
          <path d='M14 24 C 6 16, 12 6, 18 12 C 24 6, 30 16, 18 26 Z' fill='#e11d48'/>
          <path d='M30 36 C 24 30, 28 22, 32 26 C 36 22, 40 30, 32 38 Z' fill='#f43f5e'/>
        </g>
      </svg>`),
    size: '72px 72px',
  },
  {
    id: 'stars',
    label: 'Stars',
    emoji: '⭐',
    pattern: svgUrl(`
      <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'>
        <g opacity='0.9'>
          <path d='M18 6 L 22 16 L 32 17 L 24 24 L 27 34 L 18 28 L 9 34 L 12 24 L 4 17 L 14 16 Z' fill='#f59e0b'/>
          <path d='M36 28 L 38 33 L 43 34 L 39 37 L 40 42 L 36 39 L 32 42 L 33 37 L 29 34 L 34 33 Z' fill='#fbbf24'/>
        </g>
      </svg>`),
    size: '72px 72px',
  },
  {
    id: 'leaves',
    label: 'Leaves',
    emoji: '🌿',
    pattern: svgUrl(`
      <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'>
        <g opacity='0.85'>
          <path d='M8 38 C 2 24, 22 8, 32 18 C 38 26, 28 38, 8 38 Z' fill='#10b981'/>
          <path d='M8 38 C 14 30, 24 22, 32 18' stroke='#047857' stroke-width='1.2' fill='none'/>
          <path d='M14 32 L 22 28 M18 36 L 26 32' stroke='#047857' stroke-width='0.8' fill='none'/>
        </g>
      </svg>`),
    size: '72px 72px',
  },
  {
    id: 'sparkles',
    label: 'Sparkles',
    emoji: '✨',
    pattern: svgUrl(`
      <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'>
        <g fill='#a855f7' opacity='0.9'>
          <path d='M20 8 L 22 18 L 32 20 L 22 22 L 20 32 L 18 22 L 8 20 L 18 18 Z'/>
          <path d='M36 26 L 37 31 L 42 32 L 37 33 L 36 38 L 35 33 L 30 32 L 35 31 Z' fill='#c084fc'/>
          <circle cx='10' cy='38' r='1.5' fill='#d8b4fe'/>
        </g>
      </svg>`),
    size: '72px 72px',
  },
  {
    id: 'flowers',
    label: 'Flowers',
    emoji: '🌸',
    pattern: svgUrl(`
      <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'>
        <g transform='translate(20 24)' opacity='0.9'>
          <circle cx='9' cy='0' r='6' fill='#fbcfe8'/>
          <circle cx='-9' cy='0' r='6' fill='#fbcfe8'/>
          <circle cx='0' cy='9' r='6' fill='#fbcfe8'/>
          <circle cx='0' cy='-9' r='6' fill='#fbcfe8'/>
          <circle cx='6.4' cy='-6.4' r='6' fill='#fbcfe8'/>
          <circle cx='-6.4' cy='6.4' r='6' fill='#fbcfe8'/>
          <circle r='4' fill='#fde68a'/>
        </g>
        <g transform='translate(38 14)' opacity='0.8'>
          <circle cx='4' cy='0' r='3' fill='#fbcfe8'/>
          <circle cx='-4' cy='0' r='3' fill='#fbcfe8'/>
          <circle cx='0' cy='4' r='3' fill='#fbcfe8'/>
          <circle cx='0' cy='-4' r='3' fill='#fbcfe8'/>
          <circle r='2' fill='#fde68a'/>
        </g>
      </svg>`),
    size: '72px 72px',
  },
  {
    id: 'balloons',
    label: 'Balloons',
    emoji: '🎈',
    pattern: svgUrl(`
      <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'>
        <g opacity='0.9'>
          <ellipse cx='16' cy='16' rx='9' ry='11' fill='#ef4444'/>
          <path d='M16 27 L 14 30 L 18 30 Z' fill='#ef4444'/>
          <path d='M16 30 Q 18 36, 14 42' stroke='#9ca3af' stroke-width='1' fill='none'/>
          <ellipse cx='32' cy='22' rx='8' ry='10' fill='#3b82f6'/>
          <path d='M32 32 L 30 34 L 34 34 Z' fill='#3b82f6'/>
          <path d='M32 34 Q 30 40, 33 44' stroke='#9ca3af' stroke-width='1' fill='none'/>
        </g>
      </svg>`),
    size: '72px 72px',
  },
];

export function getMotif(id: string | null | undefined): NoteMotif {
  if (!id) return NOTE_MOTIFS[0]!;
  return NOTE_MOTIFS.find((m) => m.id === id) ?? NOTE_MOTIFS[0]!;
}

/**
 * Board-level background patterns. Tiled, subtle, decorative.
 * Each entry produces a CSS `background-image` value and a tile size; the
 * Layout overlays this on top of the gradient `theme.bg`.
 */
export interface BoardBackground {
  id: string;
  label: string;
  preview: string;   // tiny CSS background used in the picker swatch (e.g. a single tile)
  pattern: string;   // CSS background-image (data: URI)
  size: string;      // background-size
}

export const BOARD_BACKGROUNDS: readonly BoardBackground[] = [
  {
    id: 'none',
    label: 'None',
    preview: '#ffffff',
    pattern: 'none',
    size: '0 0',
  },
  {
    id: 'dots',
    label: 'Soft dots',
    preview: '#ffffff',
    pattern: svgUrl(`
      <svg xmlns='http://www.w3.org/2000/svg' width='30' height='30' viewBox='0 0 30 30'>
        <circle cx='15' cy='15' r='1.4' fill='#000' opacity='0.10'/>
      </svg>`),
    size: '30px 30px',
  },
  {
    id: 'paper',
    label: 'Paper grain',
    preview: '#fafaf7',
    pattern: svgUrl(`
      <svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'>
        <filter id='n'>
          <feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/>
          <feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.15 0'/>
        </filter>
        <rect width='100%' height='100%' filter='url(%23n)'/>
      </svg>`),
    size: '160px 160px',
  },
  {
    id: 'cross-hatch',
    label: 'Crosshatch',
    preview: '#ffffff',
    pattern: svgUrl(`
      <svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'>
        <g stroke='#000' stroke-width='0.5' opacity='0.08'>
          <line x1='0' y1='0' x2='28' y2='28'/>
          <line x1='28' y1='0' x2='0' y2='28'/>
        </g>
      </svg>`),
    size: '28px 28px',
  },
  {
    id: 'waves',
    label: 'Waves',
    preview: '#eef6ff',
    pattern: svgUrl(`
      <svg xmlns='http://www.w3.org/2000/svg' width='80' height='30' viewBox='0 0 80 30'>
        <path d='M0 18 Q 20 6, 40 18 T 80 18' stroke='#3b82f6' stroke-width='1.4' fill='none' opacity='0.16'/>
      </svg>`),
    size: '80px 30px',
  },
  {
    id: 'florals',
    label: 'Soft florals',
    preview: '#fff5fa',
    pattern: svgUrl(`
      <svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'>
        <g opacity='0.18'>
          <g transform='translate(30 30)'>
            <circle cx='6' cy='0' r='5' fill='#ec4899'/>
            <circle cx='-6' cy='0' r='5' fill='#ec4899'/>
            <circle cx='0' cy='6' r='5' fill='#ec4899'/>
            <circle cx='0' cy='-6' r='5' fill='#ec4899'/>
            <circle r='3' fill='#fde68a'/>
          </g>
          <g transform='translate(90 80)'>
            <circle cx='5' cy='0' r='4' fill='#a78bfa'/>
            <circle cx='-5' cy='0' r='4' fill='#a78bfa'/>
            <circle cx='0' cy='5' r='4' fill='#a78bfa'/>
            <circle cx='0' cy='-5' r='4' fill='#a78bfa'/>
            <circle r='2.5' fill='#fde68a'/>
          </g>
        </g>
      </svg>`),
    size: '120px 120px',
  },
  {
    id: 'sprinkles',
    label: 'Sprinkles',
    preview: '#fffaf2',
    pattern: svgUrl(`
      <svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'>
        <g opacity='0.22'>
          <rect x='10' y='15' width='6' height='2' rx='1' fill='#f59e0b' transform='rotate(20 13 16)'/>
          <rect x='70' y='35' width='6' height='2' rx='1' fill='#ec4899' transform='rotate(-30 73 36)'/>
          <rect x='30' y='60' width='6' height='2' rx='1' fill='#10b981' transform='rotate(45 33 61)'/>
          <rect x='85' y='75' width='6' height='2' rx='1' fill='#3b82f6' transform='rotate(10 88 76)'/>
          <rect x='50' y='90' width='6' height='2' rx='1' fill='#a855f7' transform='rotate(-15 53 91)'/>
        </g>
      </svg>`),
    size: '100px 100px',
  },
  {
    id: 'stars',
    label: 'Stars',
    preview: '#f7faff',
    pattern: svgUrl(`
      <svg xmlns='http://www.w3.org/2000/svg' width='90' height='90' viewBox='0 0 90 90'>
        <g fill='#1e293b' opacity='0.10'>
          <path d='M20 20 L 22 26 L 28 27 L 23 31 L 25 37 L 20 33 L 15 37 L 17 31 L 12 27 L 18 26 Z'/>
          <path d='M70 65 L 71 69 L 75 70 L 71 72 L 70 76 L 69 72 L 65 70 L 69 69 Z'/>
        </g>
      </svg>`),
    size: '90px 90px',
  },
  {
    id: 'hex',
    label: 'Honeycomb',
    preview: '#fffaf0',
    pattern: svgUrl(`
      <svg xmlns='http://www.w3.org/2000/svg' width='56' height='100' viewBox='0 0 56 100'>
        <g fill='none' stroke='#d97706' stroke-width='1' opacity='0.18'>
          <polygon points='28,2 52,16 52,44 28,58 4,44 4,16'/>
          <polygon points='28,52 52,66 52,94 28,108 4,94 4,66'/>
        </g>
      </svg>`),
    size: '56px 100px',
  },
];

export function getBoardBackground(id: string | null | undefined): BoardBackground {
  if (!id) return BOARD_BACKGROUNDS[0]!;
  return BOARD_BACKGROUNDS.find((b) => b.id === id) ?? BOARD_BACKGROUNDS[0]!;
}
