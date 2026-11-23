// Builds the "Kog'Maw ADC: where Riot is taking him" library page from
// data/kogmaw-patch-direction.json. Re-run after a new patch:
//   node tools/build-kogmaw-patch-direction.mjs
//
// One question (what does Riot keep buffing and nerfing, and should the build
// follow?), five tabs: six numbers over ten years, every change since 2023,
// what the AP buffs are worth, what NA players build now, and the verdict.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sketch } from './sketch.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const data = JSON.parse(await readFile(`${ROOT}data/kogmaw-patch-direction.json`, 'utf8'));
const s = sketch({ seed: 2622 });
const { dials, recent, eras, apMath, ugg, coachless, ids, icons } = data;

const fmtK = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(Math.round(n)));
const sign = (n, d = 2) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(d)}`;
const itemIcon = (name) => `${icons.item}${ids.items[name]}.png`;
const runeIcon = (name) => `${icons.rune}${ids.runes[name]}`;
const abilityIcon = (k) => `${icons.spell}${ids.abilities[k]}`;
// Patch "12.11" -> calendar year as a decimal. Seasons 4 to 14 are 2014 to 2024; 25 and 26 are 2025 and 2026.
const year = (p) => {
  const [maj, min] = p.replace(/h$/, '').split('.').map(Number);
  return (maj >= 25 ? 2000 + maj : 2010 + maj) + (min - 1) / 24;
};
const DIR = {
  buff: { glyph: '▲', color: 'Moss' },
  nerf: { glyph: '▼', color: 'Red chalk' },
  mixed: { glyph: '◆', color: 'Slate' },
};

// ---- Shared by every tab ----
s.tab(null);
s.note(0, 0, `${data.champion} ${data.role} · where Riot is taking him`, { size: 40 });
s.wobblyLine([[4, 60], [1000, 56]], { color: 'Red chalk', width: 2.5 });
s.image(0, 84, 56, 56, `${icons.champion}${ids.abilities.champion}`);
s.note(80, 76, [
  'Every change in the LoL wiki patch history, V1.0 to V26.22.',
  `Stats: u.gg NA ${data.patch.ugg.split(' ')[0]}, coachless NA Diamond+ ${data.patch.coachless}.`,
  `Pulled ${data.pulledAt}. Patch notes say what changed,`,
  'not why: the "direction" is my read.',
].join('\n'), { size: 15, color: 'Sepia' });

const views = [
  { id: 'dials', label: '1 · Six numbers, 2015 to 2026' },
  { id: 'recent', label: '2 · Every change since 2023' },
  { id: 'apmath', label: '3 · What the AP buffs are worth' },
  { id: 'players', label: '4 · What NA builds now' },
  { id: 'verdict', label: '5 · Build accordingly?' },
];

// =====================================================================
// Tab 1: six step charts of the numbers Riot keeps turning
// =====================================================================
s.tab('dials');
{
  const top = 200;
  const W = 400;
  const H = 150;
  const gapX = 90;
  const gapY = 150;
  const x0Year = 2015.5;
  const x1Year = 2027;
  dials.series.forEach((d, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const ox = col * (W + gapX);
    const oy = top + row * (H + gapY + 40);
    const vals = d.points.map((p) => p[1]);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = (hi - lo) * 0.25 || 1;
    const xOf = (y) => ox + ((y - x0Year) / (x1Year - x0Year)) * W;
    const yOf = (v) => oy + 40 + H - ((v - (lo - pad)) / (hi + 2 * pad - lo)) * H;

    s.image(ox, oy - 4, 32, 32, abilityIcon(d.ability));
    s.note(ox + 40, oy, d.label, { size: 17 });
    // Axis with year ticks.
    const axisY = oy + 40 + H + 8;
    s.wobblyLine([[ox, axisY], [ox + W, axisY]], { color: 'Parchment', width: 1 });
    for (const y of [2016, 2019, 2022, 2025]) {
      s.wobblyLine([[xOf(y), axisY - 4], [xOf(y), axisY + 4]], { color: 'Parchment', width: 1 });
      s.note(xOf(y) - 18, axisY + 8, String(y), { size: 12, color: 'Sepia' });
    }
    // Step line, then a mark at each change.
    const pts = [];
    d.points.forEach(([p, v], k) => {
      const x = Math.max(ox, xOf(year(p)));
      if (k > 0) pts.push([x, yOf(d.points[k - 1][1])]);
      pts.push([x, yOf(v)]);
    });
    pts.push([xOf(2026.9), yOf(vals[vals.length - 1])]);
    s.wobblyLine(pts, { color: 'Parchment', width: 2, wobble: 0.4 });
    let lastLabelX = -1e9;
    d.points.forEach(([p, v], k) => {
      const x = Math.max(ox, xOf(year(p)));
      const prev = k > 0 ? d.points[k - 1][1] : null;
      const c = prev === null ? 'Sepia' : v > prev ? 'Moss' : 'Red chalk';
      s.loop(x, yOf(v), 4, 4, { color: c, width: 2 });
      const label = `${v}${d.unit.startsWith('%') ? d.unit.split(' ')[0] : ''}`;
      if (x - lastLabelX > 34 || k === d.points.length - 1) {
        s.note(x - 10, yOf(v) - 26, label, { size: 12, color: c });
        lastLabelX = x;
      }
      if (prev !== null && k === d.points.length - 1) s.note(x - 14, axisY - 22, p.replace(/h$/, ''), { size: 11, color: 'Sepia' });
    });
    s.note(ox, axisY + 30, d.read, { size: 14, maxChars: 52 });
  });

  const nx = 3 * (W + gapX) + 10;
  s.note(nx, top, 'The pattern', { size: 26, color: 'Red chalk' });
  s.note(nx, top + 44, [
    'Green rings are raises, red rings are cuts.',
    '',
    'The on-hit numbers get pulled back: W %HP returns to 6% every time it rises, and Q attack speed only goes down.',
    '',
    'The AP numbers (Q, W and R ratios) only go up, and three of those raises landed in 2025.',
    '',
    'Q base damage fell in the same patch its AP ratio rose: Riot moved flat power into scaling.',
  ].join('\n'), { size: 16, maxChars: 40 });

  // Earlier eras, one line each.
  const ey = top + 2 * (H + gapY + 40) + 10;
  s.note(0, ey, 'The longer story', { size: 22, color: 'Sepia' });
  eras.forEach((e, i) => {
    s.note(0, ey + 40 + i * 52, e.years, { size: 15, color: i === eras.length - 1 ? 'Red chalk' : 'Sepia' });
    s.note(90, ey + 40 + i * 52, e.text, { size: 15, maxChars: 62 });
  });
}

// =====================================================================
// Tab 2: every change since 2023, with a verdict per category
// =====================================================================
s.tab('recent');
{
  const top = 200;
  s.note(0, top, 'Every gameplay change, V12.22 to V26.22', { size: 24 });
  s.note(0, top + 34, '▲ buff   ▼ nerf   ◆ mixed, for Kog\'s power. Bug fixes left out.', { size: 14, color: 'Sepia' });
  const catLabel = Object.fromEntries(recent.categories.map((c) => [c.key, c.label]));
  recent.changes.forEach((c, i) => {
    const y = top + 76 + i * 40;
    const d = DIR[c.dir];
    s.note(0, y, d.glyph, { size: 18, color: d.color });
    s.note(30, y + 2, c.patch, { size: 16, color: 'Sepia' });
    s.note(100, y + 2, c.text, { size: 16 });
    s.note(780, y + 4, catLabel[c.cat], { size: 13, color: 'Slate' });
  });

  const cx = 1060;
  s.note(cx, top, 'Net, by category', { size: 24 });
  recent.categories.forEach((c, i) => {
    const y = top + 60 + i * 96;
    const col = { up: 'Moss', down: 'Red chalk', flat: 'Slate' }[c.trend];
    const arrowUp = c.trend === 'up';
    const flat = c.trend === 'flat';
    if (flat) s.wobblyLine([[cx, y + 26], [cx + 40, y + 26]], { color: col, width: 3 });
    else s.arrow(arrowUp ? [[cx + 20, y + 46], [cx + 20, y + 4]] : [[cx + 20, y + 4], [cx + 20, y + 46]], { color: col, width: 3 });
    s.note(cx + 64, y, c.label, { size: 19, color: col });
    s.note(cx + 64, y + 30, c.verdict, { size: 15, maxChars: 52 });
  });
  const vy = top + 60 + recent.categories.length * 96 + 20;
  s.loop(cx + 290, vy + 60, 320, 78, { color: 'Red chalk', width: 2 });
  s.note(cx + 10, vy + 14, [
    'My read: Riot wants Kog to be a scaling carry',
    'who earns his damage from AP and items, not from',
    'free attack speed and flat lane damage in his kit.',
    'AP Kog got the raises. On-hit was held in place.',
  ].join('\n'), { size: 17 });
}

// =====================================================================
// Tab 3: what the 2025 AP changes are worth at 200 and 400 AP
// =====================================================================
s.tab('apmath');
{
  const top = 200;
  s.note(0, top, 'Same AP, before 2025 vs now', { size: 24 });
  s.note(0, top + 34, apMath.note, { size: 14, color: 'Sepia', maxChars: 66 });
  const val = (a, side, ap) => (a[side].pctBase !== undefined
    ? a[side].pctBase + (a[side].pctPer100 * ap) / 100
    : a[side].base + a[side].ap * ap);
  const maxBy = { q: 700, w: 14, r: 420 };
  const barW = 520;
  let y = top + 100;
  for (const a of apMath.abilities) {
    s.image(0, y, 40, 40, abilityIcon(a.key));
    s.note(52, y + 6, a.label, { size: 19 });
    y += 54;
    for (const ap of apMath.apLevels) {
      const b = val(a, 'before', ap);
      const n = val(a, 'now', ap);
      const unit = a.unit === 'magic' ? '' : '%';
      const gain = ((n / b - 1) * 100).toFixed(0);
      s.note(0, y + 4, `${ap} AP`, { size: 14, color: 'Sepia' });
      const x0 = 80;
      const wB = (b / maxBy[a.key]) * barW;
      const wN = (n / maxBy[a.key]) * barW;
      s.wobblyLine([[x0, y + 8], [x0 + wB, y + 8]], { color: 'Slate', width: 9, wobble: 0.3 });
      s.note(x0 + wB + 10, y - 2, `${+b.toFixed(1)}${unit} before`, { size: 13, color: 'Slate' });
      s.wobblyLine([[x0, y + 24], [x0 + wN, y + 24]], { color: 'Moss', width: 9, wobble: 0.3 });
      s.note(x0 + wN + 10, y + 16, `${+n.toFixed(1)}${unit} now  (+${gain}%)`, { size: 13, color: 'Moss' });
      y += 52;
    }
    y += 22;
  }

  // Q crossover: the 25.04 trade only pays once AP passes this.
  const qa = apMath.abilities.find((a) => a.key === 'q');
  const cross = Math.round((qa.before.base - qa.now.base) / (qa.now.ap - qa.before.ap));
  const nx = 820;
  s.note(nx, top + 100, 'What it means', { size: 24, color: 'Red chalk' });
  s.note(nx, top + 144, [
    `Q now hits weaker than in 2024 until you have about ${cross} AP (roughly one AP item), and harder after.`,
    '',
    'W is the big one: +1% of their max HP on every attack at 200 AP, +2% at 400. That is the part of AP Kog that kills tanks.',
    '',
    'So the AP build lost a little lane damage and gained a lot of item-scaling damage. On-hit got none of this.',
  ].join('\n'), { size: 16, maxChars: 44 });
}

// =====================================================================
// Tab 4: what NA players build now (u.gg + coachless)
// =====================================================================
s.tab('players');
{
  const top = 200;
  s.note(0, top, 'u.gg, NA, patch 26.22: who goes AP?', { size: 24 });
  s.note(0, top + 34, 'Buckets overlap (Diamond+ includes Master+). Raw win rates.', { size: 14, color: 'Sepia', maxChars: 66 });
  const barX = 330;
  const barW = 360;
  s.note(barX, top + 74, 'Keystone pick rate', { size: 14, color: 'Sepia' });
  s.note(barX + barW + 40, top + 74, 'Top starter', { size: 14, color: 'Sepia' });
  const ksColor = { 'Lethal Tempo': 'Sepia', "Stormraider's Surge": 'Slate', 'Arcane Comet': '#9b7fb0', 'Press the Attack': 'Red chalk' };
  ugg.samples.forEach((smp, i) => {
    const y = top + 110 + i * 86;
    s.note(0, y, smp.label, { size: 20 });
    s.note(0, y + 30, `${smp.matches.toLocaleString('en-US')} games · ${smp.wr.toFixed(1)}% WR`, { size: 14, color: 'Sepia' });
    let x = barX;
    for (const [name, [, pick]] of Object.entries(smp.keystones).sort((a, b) => b[1][1] - a[1][1])) {
      const w = (pick / 100) * barW;
      s.wobblyLine([[x, y + 16], [x + w - 2, y + 16]], { color: ksColor[name], width: 16, wobble: 0.2 });
      if (pick >= 15) s.note(x + 4, y + 30, `${name.split(' ')[0]} ${pick.toFixed(0)}%`, { size: 13, color: ksColor[name] });
      x += w;
    }
    const st = smp.starter;
    s.image(barX + barW + 40, y, 36, 36, itemIcon(st.name));
    s.note(barX + barW + 84, y + 6, `${((st.games / smp.matches) * 100).toFixed(0)}% of games`, { size: 15, color: st.name === "Doran's Ring" ? 'Moss' : 'Parchment' });
    s.note(barX + barW + 84, y + 30, smp.core, { size: 12, color: 'Sepia' });
  });
  const ly = top + 110 + ugg.samples.length * 86;
  s.note(0, ly, [
    'The higher the rank, the more AP.',
    'Stormraider\'s: 7% → 21% → 34% → 59% of games.',
    'Challenger is the only bucket that starts Doran\'s Ring most.',
    `Same shape on 26.21 (Stormraider's ${Object.values(ugg.previous.storm).map((v) => v.toFixed(0)).join(' / ')}%).`,
  ].join('\n'), { size: 15 });

  // Coachless WPA bars, centred on zero.
  const cx = 1160;
  const zero = cx + 300;
  const k = 60; // units per WPA point
  s.note(cx, top, 'coachless WPA, NA Diamond+ 16.22', { size: 24 });
  s.note(cx, top + 34, [
    'WPA = win rate minus average pre-game win probability.',
    'At 1,000 buys the 95% noise on a win rate is about',
    '±3 points, so every gap here is a lean. Number = buys.',
  ].join('\n'), { size: 14, color: 'Sepia' });
  s.wobblyLine([[zero, top + 120], [zero, top + 130 + coachless.items.length * 40 + 10]], { color: 'Parchment', width: 1 });
  coachless.items.forEach((it, i) => {
    const y = top + 140 + i * 40;
    const c = it.build === 'ap' ? 'Moss' : 'Sepia';
    s.image(cx, y - 4, 30, 30, itemIcon(it.name));
    s.note(cx + 38, y, it.name.replace('Blade of The Ruined King', 'BotRK').replace("Guinsoo's ", '').replace(' Flickerblade', ''), { size: 14 });
    s.wobblyLine([[zero, y + 12], [zero + it.wpa * k, y + 12]], { color: c, width: 12, wobble: 0.2 });
    const lx = it.wpa >= 0 ? zero + it.wpa * k + 8 : zero + 8;
    s.note(lx, y + 2, `${sign(it.wpa)} · ${fmtK(it.buys)}`, { size: 12, color: c });
  });
  const ky = top + 140 + coachless.items.length * 40 + 30;
  s.note(cx, ky, 'Keystones (same filter)', { size: 18 });
  coachless.keystones.forEach((r, i) => {
    const y = ky + 40 + i * 38;
    s.image(cx, y - 4, 30, 30, runeIcon(r.name));
    s.note(cx + 38, y, r.name, { size: 14 });
    const w = Math.max(-150, r.wpa * k); // Press the Attack runs off the scale
    s.wobblyLine([[zero, y + 12], [zero + w, y + 12]], { color: r.name === 'Lethal Tempo' ? 'Sepia' : 'Slate', width: 12, wobble: 0.2 });
    s.note(r.wpa >= 0 ? zero + w + 8 : zero + 8, y + 2, `${sign(r.wpa)} · ${fmtK(r.picks)}${r.wpa * k < -150 ? ' (bar cut)' : ''}`, { size: 12, color: 'Sepia' });
  });
  s.note(cx, ky + 40 + coachless.keystones.length * 38 + 10, [
    'Green = AP item, sepia = on-hit.',
    'No item or keystone is clear of the noise.',
    'Press the Attack (134 picks) and Stormsurge (145)',
    'are the smallest samples.',
  ].join('\n'), { size: 14 });
}

// =====================================================================
// Tab 5: does the build follow the patches?
// =====================================================================
s.tab('verdict');
{
  const top = 200;
  const cards = [
    {
      n: '1', color: 'Moss', title: 'Your rule holds for his abilities',
      body: 'Base damage cut (Q 25.04, E 14.23), AP ratios raised (Q, W, R). His base stats were not nerfed: only durability clean-ups.',
    },
    {
      n: '2', color: 'Moss', title: 'AP gets the tailwind',
      body: 'Doran\'s Ring, Dusk and Dawn, then Shadowflame or Rabadon\'s, Sorcerer\'s. Stormraider\'s Surge. Weaker than 2024 before ~150 AP, stronger after. Best into squishy teams and short fights.',
      icons: [itemIcon("Doran's Ring"), itemIcon('Dusk and Dawn'), itemIcon('Shadowflame'), itemIcon("Rabadon's Deathcap"), runeIcon("Stormraider's Surge")],
    },
    {
      n: '3', color: 'Sepia', title: 'On-hit is held, not killed',
      body: 'W stays at 6% and Q attack speed was cut twice, so the attack speed has to come from items. Doran\'s Bow, Rageblade, then Terminus or BotRK. Best into tanks and long fights. NA on-hit often runs Lethal Tempo; its gap to Stormraider\'s is inside the noise, so keep one page.',
      icons: [itemIcon("Doran's Bow"), itemIcon("Guinsoo's Rageblade"), itemIcon('Terminus'), itemIcon('Blade of The Ruined King'), runeIcon("Stormraider's Surge")],
    },
    {
      n: '4', color: 'Slate', title: 'Play the curve, not just the items',
      body: 'Less flat damage in the kit means a weaker lane before the first item. As AP, trade with E and Q but take the big fights after your first back. Level 1 to 3 pressure is still the Bow and Lethal Tempo version.',
    },
    {
      n: '5', color: 'Red chalk', title: 'Honest verdict: a small change, not a rebuild',
      body: 'The data does not split the builds: every gap is inside the noise. Higher ranks lean AP, which fits Riot\'s direction. So: AP by default in Master+ lobbies with squishy enemies, on-hit into tanks. The climb is still positioning and VODs, not this.',
    },
  ];
  cards.forEach((c, i) => {
    const col = i < 3 ? 0 : 1;
    const row = i < 3 ? i : i - 3;
    const x = col * 760;
    const y = top + row * 190;
    s.note(x, y - 8, c.n, { size: 36, color: c.color });
    s.loop(x + 12, y + 14, 24, 26, { color: c.color, width: 2 });
    s.note(x + 52, y, c.title, { size: 22, color: c.color });
    s.note(x + 52, y + 36, c.body, { size: 15, maxChars: 70 });
    (c.icons ?? []).forEach((src, k2) => s.image(x + 52 + k2 * 44, y + 120, 36, 36, src));
  });
  s.note(760, top + 2 * 190 + 10, [
    'Re-check this page when Riot next touches W\'s %HP,',
    'Q\'s attack speed or any AP ratio: those are the dials.',
  ].join('\n'), { size: 15, color: 'Sepia' });
}

const out = s.page({
  title: "Kog'Maw ADC: where Riot is taking him",
  source: {
    stats: `${data.sources.ugg} · ${data.sources.uggRunes} · ${data.sources.coachless}`,
    numbers: data.sources.wiki,
    pulledAt: data.pulledAt,
    note: `u.gg NA patch ${data.patch.ugg} coachless NA Diamond+ ${data.patch.coachless}. ${data.caveat}`,
  },
  tabs: views,
  activeTab: 'dials',
});
await writeFile(`${ROOT}library/kogmaw-patch-direction.json`, JSON.stringify(out, null, 1) + '\n');
console.log(`wrote library/kogmaw-patch-direction.json (${out.page.items.length} items)`);
