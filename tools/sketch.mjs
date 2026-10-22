// Tiny helper for writing sketchbook pages from code (Node or an agent's script).
// Produces the page format documented in docs/AGENTS.md. Strokes get a slight,
// repeatable wobble so generated diagrams look drawn rather than plotted.

const COLORS = {
  parchment: '#e9dfc9',
  sepia: '#b8925a',
  'red chalk': '#c4593f',
  slate: '#7f98ad',
  moss: '#8f9a6e',
};
const color = (c = 'Parchment') => COLORS[c.toLowerCase()] ?? c;
const r1 = (n) => Math.round(n * 10) / 10;

// Greedy word wrap, keeping explicit line breaks.
export function wrap(text, maxChars) {
  if (!maxChars) return text;
  return text.split('\n').map((line) => {
    const out = [];
    let cur = '';
    for (const word of line.split(' ')) {
      if (cur && (cur + ' ' + word).length > maxChars) {
        out.push(cur);
        cur = word;
      } else {
        cur = cur ? `${cur} ${word}` : word;
      }
    }
    out.push(cur);
    return out.join('\n');
  }).join('\n');
}

export function sketch({ seed = 1 } = {}) {
  // mulberry32: small seeded PRNG so the output is identical on every run.
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const jitter = (amount) => (rand() - 0.5) * 2 * amount;
  const items = [];
  let n = 0;
  let currentTab = null; // items added while set belong to that page tab
  const push = (item) => items.push(currentTab ? { ...item, tab: currentTab } : item);
  const id = (kind) => `${kind}-${++n}`;

  // Resamples a polyline every ~12 units with a small sideways wobble.
  function wobble(points, amount = 0.8) {
    const out = [];
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, ay] = points[i];
      const [bx, by] = points[i + 1];
      const steps = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 12));
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        out.push([r1(ax + (bx - ax) * t + jitter(amount)), r1(ay + (by - ay) * t + jitter(amount))]);
      }
    }
    const [lx, ly] = points[points.length - 1];
    out.push([r1(lx), r1(ly)]);
    return out;
  }

  const api = {
    // Everything added until the next tab() call goes on this page tab; tab(null) for shared items.
    tab(tabId) {
      currentTab = tabId;
    },
    note(x, y, text, { size = 18, color: c, maxChars } = {}) {
      push({ id: id('note'), type: 'note', x: r1(x), y: r1(y), text: wrap(text, maxChars), color: color(c), size });
    },
    image(x, y, w, h, src) {
      push({ id: id('img'), type: 'image', x: r1(x), y: r1(y), w, h, src });
    },
    stroke(points, { color: c, width = 3 } = {}) {
      push({ id: id('ink'), type: 'stroke', color: color(c), width, points: points.map(([x, y]) => [r1(x), r1(y)]) });
    },
    wobblyLine(points, opts = {}) {
      api.stroke(wobble(points, opts.wobble ?? 0.8), opts);
    },
    // A hand-drawn loop around (cx, cy) that overshoots its start a little.
    loop(cx, cy, rx, ry, opts = {}) {
      const pts = [];
      const start = -2.6 + jitter(0.2);
      const turns = 2 * Math.PI + 0.5;
      for (let t = 0; t <= turns; t += 0.12) {
        const k = 1 + jitter(0.025) + (t / turns) * 0.06;
        pts.push([cx + Math.cos(start + t) * rx * k, cy + Math.sin(start + t) * ry * k]);
      }
      api.stroke(pts, opts);
    },
    // A polyline with an arrowhead at its last point.
    arrow(points, opts = {}) {
      api.wobblyLine(points, opts);
      const [ax, ay] = points[points.length - 2];
      const [bx, by] = points[points.length - 1];
      const ang = Math.atan2(by - ay, bx - ax);
      const len = 14;
      for (const side of [-1, 1]) {
        const a2 = ang + Math.PI + side * 0.45;
        api.stroke([[bx + Math.cos(a2) * len, by + Math.sin(a2) * len], [bx, by]], opts);
      }
    },
    // The finished page, wrapped in the single-page file format.
    page({ title = '', source, tabs, activeTab } = {}) {
      const page = { title, fit: true, items };
      if (source) page.source = source;
      if (tabs?.length) {
        page.tabs = tabs;
        page.activeTab = activeTab ?? tabs[0].id;
      }
      return { format: 'sketchbook-page', version: 1, page };
    },
  };
  return api;
}
