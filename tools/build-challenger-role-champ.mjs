// Builds the "Challenger: role and champion" coaching page from
// data/challenger-role-champ.json. Run: node tools/build-challenger-role-champ.mjs
//
// First principles only: no win rates. Every score in the data file is a judgment
// with its reason, so the page can be argued with and edited.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sketch } from './sketch.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const data = JSON.parse(await readFile(`${ROOT}data/challenger-role-champ.json`, 'utf8'));
const s = sketch({ seed: 2611211 });
const dots = (n) => '●'.repeat(n) + '○'.repeat(5 - n);
const dotColor = (n) => (n >= 4 ? 'Moss' : n >= 3 ? 'Parchment' : 'Slate');

const TITLE = 'Challenger: role and champion';
const tabs = [
  { id: 'truth', label: '1 · Straight talk' },
  { id: 'roles', label: '2 · Where agency lives' },
  { id: 'options', label: '3 · Three options' },
  { id: 'plan', label: '4 · How to choose' },
];

// ---- Header (all tabs) ----
s.tab(null);
s.note(0, 0, TITLE, { size: 40 });
s.wobblyLine([[4, 60], [640, 55]], { color: 'Red chalk', width: 2.5 });
s.note(0, 72, [
  'Coaching from first principles: no win rates, no tier lists, no sample sizes.',
  'Every score is my judgment, with the reason beside it.',
  ...data.player.header,
].join('\n'), { size: 15, color: 'Sepia' });

const top = 250;

// =====================================================================
// Tab 1: straight talk
// =====================================================================
s.tab('truth');
data.truths.forEach((t, i) => {
  const col = i % 2;
  const row = Math.floor(i / 2);
  const x = col * 780;
  const y = top + row * 200;
  s.note(x, y - 6, String(i + 1), { size: 40, color: 'Red chalk' });
  s.note(x + 48, y, t.head, { size: 21, maxChars: 52 });
  s.note(x + 48, y + 40, t.body, { size: 15, color: 'Parchment', maxChars: 66 });
});

// =====================================================================
// Tab 2: where agency lives
// =====================================================================
s.tab('roles');
{
  const colX = (i) => 180 + i * 170;
  data.roleAxes.forEach((a, i) => {
    s.note(colX(i), top, a.label, { size: 17 });
    s.note(colX(i), top + 26, a.why, { size: 12, color: 'Slate', maxChars: 22 });
  });
  const rowY = (i) => top + 110 + i * 92;
  data.roles.forEach((r, i) => {
    const y = rowY(i);
    s.note(0, y, r.name, { size: 28, color: r.name === 'Jungle' ? 'Red chalk' : 'Parchment' });
    data.roleAxes.forEach((a, j) => {
      const v = r.scores[a.id];
      s.note(colX(j), y + 6, dots(v), { size: 20, color: dotColor(v) });
    });
    s.note(colX(data.roleAxes.length) + 10, y + 4, r.note, { size: 14, color: 'Parchment', maxChars: 50 });
    if (i < data.roles.length - 1) s.wobblyLine([[0, y + 76], [1450, y + 76]], { color: 'Slate', width: 1 });
  });
  s.loop(60, rowY(0) + 18, 80, 30, { color: 'Red chalk', width: 2.5 });

  const y2 = rowY(data.roles.length) + 20;
  s.note(0, y2, 'Read it like this', { size: 24, color: 'Sepia' });
  s.note(0, y2 + 40, [
    '• Jungle has the most agency in solo queue: it is the only role that chooses where every fight happens.',
    '• ADC has the most power late but borrows its agency early. That is the root of "Kog can\'t play for objectives".',
    '• Top is the most independent and the farthest from dragon.',
    '• Your two cheap roles are the two you already climbed in.',
  ].join('\n'), { size: 16, maxChars: 62 });

  const cx = 1000;
  s.note(cx, y2, 'Your three problems, as traits', { size: 24, color: 'Sepia' });
  const map = [
    ['Low mobility', 'mobility, dashes'],
    ['Dies to assassins', 'self-peel, a tankier body, or range'],
    ['Hard to play objectives', 'map reach, smite, or side-lane pressure'],
  ];
  map.forEach(([a, b], i) => {
    const y = y2 + 44 + i * 40;
    s.note(cx, y, a, { size: 16 });
    s.arrow([[cx + 210, y + 11], [cx + 260, y + 11]], { color: 'Red chalk', width: 2 });
    s.note(cx + 275, y, b, { size: 16, color: 'Moss' });
  });
}

// =====================================================================
// Tab 3: three options
// =====================================================================
s.tab('options');
{
  const colW = 600;
  data.options.forEach((o, i) => {
    const x = i * colW;
    s.note(x, top, o.name, { size: 38, color: o.pick ? 'Red chalk' : 'Parchment' });
    s.note(x, top + 60, o.role, { size: 15, color: 'Slate' });
    s.note(x, top + 86, o.pitch, { size: 18, color: 'Sepia', maxChars: 46 });
    if (o.pick) s.loop(x + 78, top + 22, 105, 25, { color: 'Red chalk', width: 2.5 });

    data.traitAxes.forEach((a, j) => {
      const y = top + 130 + j * 30;
      const v = o.scores[a.id];
      s.note(x, y, a.label, { size: 15 });
      s.note(x + 210, y - 2, dots(v), { size: 18, color: dotColor(v) });
    });

    const fy = top + 130 + data.traitAxes.length * 30 + 20;
    s.note(x, fy, 'Fixes', { size: 18, color: 'Moss' });
    s.note(x, fy + 28, o.fixes.map((f) => `+ ${f}`).join('\n'), { size: 15, maxChars: 56 });
    const cy = fy + 28 + 22 * 6 + 16;
    s.note(x, cy, 'Costs', { size: 18, color: 'Red chalk' });
    s.note(x, cy + 28, o.costs.map((c) => `− ${c}`).join('\n'), { size: 15, maxChars: 56 });
    const vy = cy + 28 + 22 * 7 + 30;
    if (i === 0) s.wobblyLine([[0, vy - 14], [1760, vy - 18]], { color: 'Red chalk', width: 2 });
    s.note(x, vy, i === 0 ? 'Verdict' : 'Or', { size: 22, color: 'Sepia' });
    s.note(x, vy + 32, data.verdict[i], { size: 16, maxChars: 54 });
    if (i > 0) s.wobblyLine([[x - 30, top], [x - 30, vy + 130]], { color: 'Slate', width: 1 });
  });
}

// =====================================================================
// Tab 4: how to choose
// =====================================================================
s.tab('plan');
data.plan.forEach((p, i) => {
  const x = i * 450;
  s.note(x, top, p.head, { size: 21, color: i === 2 ? 'Moss' : 'Parchment', maxChars: 30 });
  s.note(x, top + 40, p.body, { size: 15, maxChars: 46 });
  if (i < data.plan.length - 1) s.arrow([[x + 380, top + 14], [x + 425, top + 14]], { color: 'Red chalk', width: 2 });
});

const out = s.page({
  title: TITLE,
  source: {
    method: 'First-principles reasoning only. No win rates, pick rates or samples were used.',
    pulledAt: data.pulledAt,
  },
  tabs,
});
await writeFile(`${ROOT}library/challenger-role-champ.json`, JSON.stringify(out, null, 2) + '\n');
console.log(`wrote library/challenger-role-champ.json (${out.page.items.length} items)`);
