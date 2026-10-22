// The page format, in one place: what a page and each kind of item look like,
// and how untrusted input (backup files, library pages, agent calls) is checked
// and cleaned before it reaches the canvas. See docs/AGENTS.md for the prose version.

export const COLORS = [
  { name: 'Parchment', value: '#e9dfc9' },
  { name: 'Sepia', value: '#b8925a' },
  { name: 'Red chalk', value: '#c4593f' },
  { name: 'Slate', value: '#7f98ad' },
  { name: 'Moss', value: '#8f9a6e' },
];

const DEFAULT_COLOR = COLORS[0].value;
const MAX_COORD = 1e6;
const MAX_TEXT = 20000;
const MAX_POINTS = 20000;

export const uid = () =>
  globalThis.crypto?.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);

const round = (n) => Math.round(n * 10) / 10;
const isNum = (n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= MAX_COORD;

// Accepts a palette name ("Red chalk", "red-chalk") or any #rgb / #rrggbb hex.
export function resolveColor(c) {
  if (typeof c !== 'string') return DEFAULT_COLOR;
  const key = c.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  const named = COLORS.find((x) => x.name.toLowerCase() === key);
  if (named) return named.value;
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c.trim()) ? c.trim() : DEFAULT_COLOR;
}

// Only web and data URLs are allowed as image sources.
export function isImageSrc(src) {
  return typeof src === 'string' && /^(https?:\/\/|data:image\/)/i.test(src) && src.length < 5_000_000;
}

// Returns a clean copy of one item, or throws an Error saying what is wrong.
export function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('item is not an object');
  const id = typeof raw.id === 'string' && raw.id ? raw.id : uid();

  switch (raw.type) {
    case 'stroke': {
      const pts = Array.isArray(raw.points) ? raw.points : [];
      if (!pts.length || pts.length > MAX_POINTS) throw new Error('stroke needs 1 to 20000 points');
      const points = pts.map((p) => {
        if (!Array.isArray(p) || !isNum(p[0]) || !isNum(p[1])) throw new Error('stroke point must be [x, y]');
        return [round(p[0]), round(p[1])];
      });
      const width = isNum(raw.width) && raw.width > 0 ? round(Math.min(raw.width, 200)) : 3;
      return { id, type: 'stroke', color: resolveColor(raw.color), width, points };
    }
    case 'note': {
      if (typeof raw.text !== 'string' || !raw.text.trim()) throw new Error('note needs text');
      if (!isNum(raw.x) || !isNum(raw.y)) throw new Error('note needs numeric x and y');
      const size = isNum(raw.size) && raw.size > 0 ? round(Math.min(raw.size, 400)) : 22;
      return {
        id, type: 'note', x: round(raw.x), y: round(raw.y),
        text: raw.text.slice(0, MAX_TEXT), color: resolveColor(raw.color), size,
      };
    }
    case 'image': {
      if (!isNum(raw.x) || !isNum(raw.y)) throw new Error('image needs numeric x and y');
      if (!isNum(raw.w) || !isNum(raw.h) || raw.w <= 0 || raw.h <= 0) throw new Error('image needs positive w and h');
      const item = { id, type: 'image', x: round(raw.x), y: round(raw.y), w: round(raw.w), h: round(raw.h) };
      if (typeof raw.blobId === 'string' && raw.blobId) item.blobId = raw.blobId;
      if (isImageSrc(raw.src)) item.src = raw.src;
      if (!item.blobId && !item.src) throw new Error('image needs a blobId or an http(s)/data: src');
      return item;
    }
    default:
      throw new Error(`unknown item type "${raw.type}"`);
  }
}

// Cleans a whole page. Bad items are dropped and reported in `problems`
// rather than failing the page, so one typo doesn't lose a whole sketch.
export function normalizePage(raw, { freshId = false } = {}) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.items)) throw new Error('page needs an items array');
  const now = Date.now();
  const problems = [];
  const items = [];
  const seen = new Set();
  raw.items.forEach((it, i) => {
    try {
      const item = normalizeItem(it);
      if (seen.has(item.id)) item.id = uid();
      seen.add(item.id);
      items.push(item);
    } catch (err) {
      problems.push(`item ${i}: ${err.message}`);
    }
  });
  const v = raw.view ?? {};
  const page = {
    id: !freshId && typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    title: typeof raw.title === 'string' ? raw.title.slice(0, 200) : '',
    createdAt: isNum(raw.createdAt) && !freshId ? raw.createdAt : now,
    updatedAt: isNum(raw.updatedAt) && !freshId ? raw.updatedAt : now,
    view: {
      x: isNum(v.x) ? v.x : 0,
      y: isNum(v.y) ? v.y : 0,
      zoom: isNum(v.zoom) && v.zoom > 0 ? v.zoom : 1,
    },
    items,
  };
  if (raw.source && typeof raw.source === 'object') page.source = structuredClone(raw.source);
  if (raw.fit === true) page.fit = true;
  return { page, problems };
}
