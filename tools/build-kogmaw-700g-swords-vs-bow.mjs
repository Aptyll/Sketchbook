// Builds the "Kog'Maw: 2 Long Swords or Recurve Bow?" library page from
// data/kogmaw-700g-swords-vs-bow.json and the fight model in
// tools/kogmaw-700g-model.mjs. Re-run after a patch touches Kog'Maw, Lethal
// Tempo, Long Sword or Recurve Bow:
//   node tools/build-kogmaw-700g-swords-vs-bow.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sketch, wrap } from './sketch.mjs';
import * as M from './kogmaw-700g-model.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const data = JSON.parse(await readFile(`${ROOT}data/kogmaw-700g-swords-vs-bow.json`, 'utf8'));
const s = sketch({ seed: 700 });
const { icons, items, finished } = data;
const itemIcon = (name) => `${icons.item}${(items[name] ?? finished[name]).id}.png`;
const pct = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(0)}%`;
const LEVELS = [6, 9, 11];
const TARGETS = ['squishy', 'tank'];
const SWORD = 'Sepia';
const BOW = 'Moss';

// Recurve Bow's lead over two Long Swords, in % damage, for each level, target and scenario.
const lead = {};
for (const lvl of LEVELS) for (const tk of TARGETS) for (const sc of M.SCENARIOS) {
  const tg = M.target(data, tk, lvl);
  const sw = M.smooth(data, M.kog(data, lvl, M.BUYS.swords), tg, sc);
  const bw = M.smooth(data, M.kog(data, lvl, M.BUYS.bow), tg, sc);
  lead[`${lvl}-${tk}-${sc.id}`] = { sw, bw, pct: (bw / sw - 1) * 100 };
}
const allLeads = Object.values(lead).map((l) => l.pct);
const minLead = Math.min(...allLeads);
const maxLead = Math.max(...allLeads);

// ---- Shared by every tab ----
s.tab(null);
s.note(0, 0, "Kog'Maw ADC · 700 gold: 2 Long Swords or Recurve Bow?", { size: 38 });
s.wobblyLine([[4, 58], [1080, 54]], { color: 'Red chalk', width: 2.5 });
s.image(0, 82, 56, 56, icons.champion);
s.image(70, 82, 56, 56, `${icons.rune}${data.lethalTempo.icon}`);
s.note(146, 76, [
  `LoL wiki numbers, patch ${data.wiki.patch} (read ${data.pulledAt}).`,
  'Lethal Tempo, 10% AS shard, W max then Q.',
  'A fight model, not win rates: no games sampled.',
].join('\n'), { size: 15, color: 'Sepia' });

const views = [
  { id: 'verdict', label: '1 · Verdict' },
  { id: 'math', label: '2 · Why: one fight, hit by hit' },
  { id: 'catchup', label: '3 · When do swords win?' },
  { id: 'path', label: '4 · What they build into' },
  { id: 'notes', label: '5 · Assumptions' },
];

// =====================================================================
// Tab 1: verdict + Recurve's lead in every scenario
// =====================================================================
s.tab('verdict');
{
  const top = 180;
  s.image(0, top, 64, 64, itemIcon('Recurve Bow'));
  s.note(80, top - 2, 'Recurve Bow. Two Long Swords lose.', { size: 32, color: BOW });
  s.note(80, top + 42, `Recurve deals ${pct(minLead)} to ${pct(maxLead)} more damage in every fight below,`, { size: 17 });
  s.note(80, top + 66, 'squishy or tank, level 6, 9 or 11.', { size: 17 });

  // Grouped bars: Recurve's lead per level and target, one bar per scenario.
  const cy = top + 140;
  const H = 220;
  const scale = H / 14; // 14% = full height
  const base = cy + H + 20;
  s.note(0, cy - 6, "Recurve Bow's lead over 2 Long Swords (% more damage)", { size: 19 });
  s.wobblyLine([[0, base], [1060, base]], { color: 'Parchment', width: 1.5 });
  for (const g of [5, 10]) {
    s.wobblyLine([[0, base - g * scale], [1060, base - g * scale]], { color: 'Sepia', width: 0.6, wobble: 0.3 });
    s.note(-44, base - g * scale - 10, `+${g}%`, { size: 12, color: 'Sepia' });
  }
  const scCol = { trade: 'Slate', fight: 'Moss', nowall: 'Parchment' };
  let gx = 20;
  for (const lvl of LEVELS) for (const tk of TARGETS) {
    M.SCENARIOS.forEach((sc, i) => {
      const v = lead[`${lvl}-${tk}-${sc.id}`].pct;
      const x = gx + i * 34;
      const y = base - v * scale;
      s.wobblyLine([[x, base], [x, y], [x + 24, y], [x + 24, base]], { color: scCol[sc.id], width: 2.2, wobble: 0.4 });
      s.note(x - 2, y - 22, `${v.toFixed(0)}`, { size: 12, color: scCol[sc.id] });
    });
    s.note(gx, base + 8, `Lv ${lvl}`, { size: 14 });
    s.note(gx, base + 28, tk, { size: 13, color: 'Sepia' });
    gx += 176;
  }
  M.SCENARIOS.forEach((sc, i) => {
    s.wobblyLine([[0 + i * 330, base + 74], [24 + i * 330, base + 74]], { color: scCol[sc.id], width: 4 });
    s.note(32 + i * 330, base + 63, sc.label, { size: 14, color: scCol[sc.id] });
  });

  // Blunt reasons.
  const ry = base + 120;
  s.note(0, ry, 'Straight answer', { size: 24, color: 'Red chalk' });
  s.note(0, ry + 40, [
    'You lose on this one. Recurve\'s 15 on-hit is about',
    'the same per hit as 20 AD (only 5 less), and you',
    'also attack 15% faster. More attacks mean more W',
    'procs (your real damage), Tempo stacks sooner and',
    'its bolt hits harder. Long Swords only pull ahead',
    'at the 2.5 attack speed cap (tab 3), far past',
    'a 700 gold back.',
  ].join('\n'), { size: 16 });
  s.note(700, ry, 'Buy order', { size: 24, color: 'Red chalk' });
  s.note(700, ry + 40, [
    'Recurve first, always. It goes into all six',
    'on-hit and AP items Kog builds.',
    'Going Kraken or Terminus? Swords come',
    'next (they make Hearthbound Axe), but',
    'still after the Recurve. Tab 4.',
  ].join('\n'), { size: 16 });
}

// =====================================================================
// Tab 2: one 8 s fight at level 9 vs the squishy, hit by hit
// =====================================================================
s.tab('math');
{
  const lvl = 9;
  const top = 180;
  const tg = M.target(data, 'squishy', lvl);
  const ksw = M.kog(data, lvl, M.BUYS.swords);
  const kbw = M.kog(data, lvl, M.BUYS.bow);
  const fsw = M.fight(data, ksw, tg, { duration: 8, w: true });
  const fbw = M.fight(data, kbw, tg, { duration: 8, w: true });
  const ssw = M.steady(data, ksw, tg);
  const sbw = M.steady(data, kbw, tg);
  s.note(0, top, `Level ${lvl}, W + Q, 8 s on an enemy ADC (${Math.round(tg.hp)} HP, ${Math.round(tg.armor)} armor, ${Math.round(tg.mr)} MR)`, { size: 20 });

  // Stat table.
  const ty = top + 50;
  const cols = [0, 330, 560];
  s.image(cols[1], ty - 4, 36, 36, itemIcon('Long Sword'));
  s.image(cols[1] + 40, ty - 4, 36, 36, itemIcon('Long Sword'));
  s.note(cols[1] + 84, ty + 2, '2× Long Sword', { size: 16, color: SWORD });
  s.image(cols[2], ty - 4, 36, 36, itemIcon('Recurve Bow'));
  s.note(cols[2] + 44, ty + 2, 'Recurve Bow', { size: 16, color: BOW });
  const rows = [
    ['Attack damage', ksw.ad.toFixed(0), kbw.ad.toFixed(0)],
    ['Extra damage per hit', '+20 AD', '+15 on-hit'],
    ['Attack speed, Tempo stacked', ssw.as.toFixed(2), sbw.as.toFixed(2)],
    ['Attacks in the 8 s fight', String(fsw.attacks), String(fbw.attacks)],
    ['Damage per second, stacked', ssw.dps.toFixed(0), sbw.dps.toFixed(0)],
  ];
  rows.forEach((r, i) => {
    const y = ty + 48 + i * 30;
    s.note(cols[0], y, r[0], { size: 15, color: 'Sepia' });
    s.note(cols[1], y, r[1], { size: 16, color: SWORD });
    s.note(cols[2], y, r[2], { size: 16, color: BOW });
  });

  // Stacked horizontal bars of where the damage comes from.
  const by = ty + 48 + rows.length * 30 + 50;
  s.note(0, by, 'Where the damage comes from (after armor and MR)', { size: 19 });
  const parts = [
    ['auto', 'Autos (AD)', 'Parchment'],
    ['onHit', 'Recurve on-hit', 'Moss'],
    ['w', 'W %HP on-hit', 'Slate'],
    ['lt', 'Tempo bolt', 'Red chalk'],
    ['q', 'Q', 'Sepia'],
  ];
  const sc = 0.55;
  [[fsw, '2× Long Sword', SWORD], [fbw, 'Recurve Bow', BOW]].forEach(([f, label, c], i) => {
    const y = by + 50 + i * 70;
    s.note(0, y + 4, label, { size: 15, color: c });
    let x = 150;
    for (const [k, , pc] of parts) {
      const w = f[k] * sc;
      if (w < 1) continue;
      s.wobblyLine([[x, y], [x + w, y], [x + w, y + 30], [x, y + 30], [x, y]], { color: pc, width: 2, wobble: 0.3 });
      if (w > 34) s.note(x + 4, y + 6, f[k].toFixed(0), { size: 12, color: pc });
      x += w;
    }
    s.note(x + 12, y + 4, `${f.total.toFixed(0)} total`, { size: 16, color: c });
  });
  parts.forEach(([, label, pc], i) => {
    s.wobblyLine([[150 + i * 170, by + 200], [174 + i * 170, by + 200]], { color: pc, width: 4 });
    s.note(180 + i * 170, by + 189, label, { size: 13, color: pc });
  });

  s.note(820, top + 50, 'How to read it', { size: 22, color: 'Red chalk' });
  s.note(820, top + 90, [
    `Swords: +${(fsw.auto - fbw.auto).toFixed(0)} from harder autos.`,
    '',
    `Recurve: +${fbw.onHit.toFixed(0)} on-hit, +${(fbw.w - fsw.w).toFixed(0)} W`,
    `and +${(fbw.lt - fsw.lt).toFixed(0)} Tempo bolt, because`,
    `it fits ${fbw.attacks} attacks in, not ${fsw.attacks}.`,
    '',
    'W is worth far more per hit than',
    '20 AD, so attacks per second is',
    'what Kog wants, not AD per hit.',
  ].join('\n'), { size: 16 });
}

// =====================================================================
// Tab 3: when would Long Swords win?
// =====================================================================
s.tab('catchup');
{
  const top = 180;
  const lvl = 11;
  s.note(0, top, 'Add attack speed: when do 20 AD catch up?', { size: 20 });
  s.note(0, top + 30, 'Level 11, Tempo stacked, vs the enemy ADC', { size: 14, color: 'Sepia' });
  const ox = 60;
  const oy = top + 100;
  const W = 640;
  const H = 260;
  const asMin = 1.1;
  const asMax = 2.6;
  const yMin = -4;
  const yMax = 9;
  const xOf = (a) => ox + ((a - asMin) / (asMax - asMin)) * W;
  const yOf = (v) => oy + H - ((v - yMin) / (yMax - yMin)) * H;
  s.wobblyLine([[ox, yOf(0)], [ox + W, yOf(0)]], { color: 'Parchment', width: 1.5 });
  s.wobblyLine([[ox, oy], [ox, oy + H]], { color: 'Parchment', width: 1 });
  for (const v of [-3, 3, 6, 9]) s.note(ox - 40, yOf(v) - 9, `${v > 0 ? '+' : ''}${v}%`, { size: 12, color: 'Sepia' });
  for (const a of [1.25, 1.5, 1.75, 2, 2.25, 2.5]) {
    s.wobblyLine([[xOf(a), yOf(0) - 4], [xOf(a), yOf(0) + 4]], { color: 'Parchment', width: 1 });
    s.note(xOf(a) - 14, oy + H + 8, a.toFixed(2), { size: 12, color: 'Sepia' });
  }
  s.note(ox + W / 2 - 150, oy + H + 30, 'attacks per second with 2 Long Swords', { size: 14, color: 'Sepia' });
  s.note(ox + 6, oy - 30, "Recurve Bow's lead (% damage per second)", { size: 14, color: 'Sepia' });

  const lines = [
    { w: true, tk: 'squishy', label: 'W on', color: 'Moss' },
    { w: false, tk: 'squishy', label: 'W down', color: 'Slate' },
  ];
  for (const ln of lines) {
    const pts = [];
    let last = null;
    for (let x = 0; x <= 260; x += 2) {
      const tg = M.target(data, ln.tk, lvl);
      const a = M.steady(data, M.kog(data, lvl, M.BUYS.swords, { as: x }), tg, { w: ln.w });
      const b = M.steady(data, M.kog(data, lvl, M.BUYS.bow, { as: x }), tg, { w: ln.w });
      if (a.as > asMax) break;
      const v = (b.dps / a.dps - 1) * 100;
      pts.push([xOf(a.as), yOf(v)]);
      last = [a.as, v];
    }
    s.wobblyLine(pts, { color: ln.color, width: 2.5, wobble: 0.3 });
    s.note(pts[0][0] + 4, pts[0][1] + (ln.w ? -28 : 10), ln.label, { size: 14, color: ln.color });
  }
  // Markers.
  const now = M.steady(data, M.kog(data, lvl, M.BUYS.swords), M.target(data, 'squishy', lvl));
  s.loop(xOf(now.as), yOf(0), 8, 8, { color: 'Red chalk', width: 2 });
  s.note(xOf(now.as) - 30, yOf(0) + 14, 'you, 700 g', { size: 13, color: 'Red chalk' });
  s.wobblyLine([[xOf(2.5), oy], [xOf(2.5), oy + H]], { color: 'Red chalk', width: 1.5 });
  s.note(xOf(2.5) - 34, oy - 26, '2.5 cap', { size: 13, color: 'Red chalk' });

  s.note(780, top + 50, 'What it says', { size: 22, color: 'Red chalk' });
  s.note(780, top + 90, [
    'Recurve\'s lead shrinks as you',
    'get faster, but it never flips',
    'until the 2.5 attack speed cap,',
    'where extra AS is wasted. That\'s',
    'a 3 to 4 item build, not a',
    '700 gold first back.',
  ].join('\n'), { size: 16 });

  s.note(0, oy + H + 80, 'Where 2 Long Swords do win (small)', { size: 22, color: SWORD });
  s.note(0, oy + H + 120, [
    '• One or two auto pokes with W down: +5 damage per auto,',
    '   before the extra attack speed shows up.',
    '• Each R deals +15 (75% bonus AD), up to +30 on a low',
    '   target. About one auto\'s worth per fight.',
    '• Last-hitting under tower is a bit easier with 20 AD.',
    `None of these outweigh ${minLead.toFixed(0)} to ${maxLead.toFixed(0)}% more damage in real fights.`,
  ].join('\n'), { size: 16 });
}

// =====================================================================
// Tab 4: build path
// =====================================================================
s.tab('path');
{
  const top = 190;
  s.note(0, top - 10, 'What each 700 gold buy turns into', { size: 22 });
  // Recurve column.
  s.image(0, top + 40, 52, 52, itemIcon('Recurve Bow'));
  s.note(64, top + 50, 'Recurve Bow is in all 6:', { size: 18, color: BOW });
  Object.entries(finished).forEach(([name, f], i) => {
    const y = top + 110 + i * 56;
    s.arrow([[26, top + 96], [26, y + 20], [54, y + 20]], { color: BOW, width: 1.5 });
    s.image(60, y, 40, 40, itemIcon(name));
    s.note(110, y + 2, name, { size: 15 });
    s.note(110, y + 22, f.recipe, { size: 12, color: 'Sepia' });
  });
  // Long Sword column.
  const lx = 560;
  s.image(lx, top + 40, 52, 52, itemIcon('Long Sword'));
  s.image(lx + 58, top + 40, 52, 52, itemIcon('Long Sword'));
  s.note(lx + 122, top + 50, '2 Long Swords become:', { size: 18, color: SWORD });
  const ly = top + 120;
  s.arrow([[lx + 55, top + 96], [lx + 55, ly + 20], [lx + 84, ly + 20]], { color: SWORD, width: 1.5 });
  s.image(lx + 90, ly, 44, 44, itemIcon('Hearthbound Axe'));
  s.note(lx + 144, ly, 'Hearthbound Axe (+ Dagger + 250 g)', { size: 15 });
  s.note(lx + 144, ly + 22, '20 AD, 20% AS. Goes into Kraken Slayer and Terminus.', { size: 12, color: 'Sepia' });
  s.image(lx + 90, ly + 70, 36, 36, itemIcon('Kraken Slayer'));
  s.image(lx + 132, ly + 70, 36, 36, itemIcon('Terminus'));
  s.note(lx + 180, ly + 76, 'both also need a Recurve Bow', { size: 14, color: 'Red chalk' });
  s.note(lx, ly + 140, [
    'One Long Sword alone goes into Vampiric',
    'Scepter (Ruined King) or Rectrix (Kraken).',
    '',
    'Rageblade, Nashor\'s and Wit\'s End use',
    'no Long Sword at all.',
  ].join('\n'), { size: 15 });
  s.note(lx, ly + 270, 'So', { size: 22, color: 'Red chalk' });
  s.note(lx, ly + 306, [
    'Recurve is never wasted gold on Kog.',
    'Swords are fine only on a Kraken or',
    'Terminus path, and even then buy the',
    'Recurve first since it hits harder.',
  ].join('\n'), { size: 16 });
}

// =====================================================================
// Tab 5: assumptions and caveats
// =====================================================================
s.tab('notes');
{
  const top = 190;
  const lv = (lvl) => {
    const r = M.ranks(lvl);
    return `Lv ${lvl}: Q${r.q} W${r.w} E${r.e} R${r.r}`;
  };
  s.note(0, top, 'Assumptions', { size: 24, color: 'Red chalk' });
  const bullets = (y, lines) => lines.forEach((t) => {
    s.note(0, y, t, { size: 15, maxChars: 62 });
    y += wrap(t, 62).split('\n').length * 21 + 8;
  });
  bullets(top + 44, [
    `• Wiki patch ${data.wiki.patch}: Kog AD 61 (+3.1), AS 0.665 (ratio 0.665, +2.65%/lv), Q passive 5–25% AS, W 3–6% max HP magic on-hit. Recurve 15% AS + 15 physical on-hit; Long Sword 10 AD.`,
    '• Lethal Tempo (ranged): 4.8% AS per stack, 6 stacks; at 6, a bolt of 6–21.66 damage, +1% per 1% bonus AS. Starts each fight at 0 stacks. Bolt counted as physical. No AS cap break.',
    `• Runes: 10% AS shard only. Skill order W > Q > E. ${lv(6)}, ${lv(9)}, ${lv(11)}.`,
    '• Inventory is only the 700 g buy, so the gap is just the two choices. Doran\'s and boots add the same to both.',
    '• Enemy ADC: 640 HP (+100/lv), 26 armor, 30 MR. Tank: +450 HP and +35 armor on top of tank base stats.',
    '• Q at the start of each fight (armor and MR shred for 4 s). No E or R in the bars. W on for 8 s when used.',
    '• Damage averaged over fight lengths ±1 s, because whole attacks make one length jumpy.',
  ]);
  s.note(760, top, 'Caveats', { size: 24, color: 'Red chalk' });
  s.note(760, top + 44, [
    '• Model only: no movement, kiting, missed autos',
    '   or the enemy hitting back.',
    '• A 1 to 2 auto poke can go either way by a few',
    '   damage.',
    '• No win rates: stats sites don\'t track a "first',
    '   700 gold" buy, so this is math only.',
    '• Counting the bolt as magic instead of physical',
    '   moves the gap by under 1%.',
  ].join('\n'), { size: 15 });
}

const out = s.page({
  title: "Kog'Maw ADC: 2 Long Swords or Recurve Bow?",
  source: {
    numbers: data.wiki.source,
    pulledAt: data.pulledAt,
    note: `${data.wiki.note} Fight model in tools/kogmaw-700g-model.mjs; no win rates sampled.`,
  },
  tabs: views,
  activeTab: 'verdict',
});
await writeFile(`${ROOT}library/kogmaw-700g-swords-vs-bow.json`, JSON.stringify(out, null, 1) + '\n');
console.log(`wrote library/kogmaw-700g-swords-vs-bow.json (${out.page.items.length} items), Recurve lead ${minLead.toFixed(1)}% to ${maxLead.toFixed(1)}%`);
