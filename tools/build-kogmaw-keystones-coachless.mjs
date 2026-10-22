// Builds the "Kog'Maw ADC: keystones (coachless, NA)" library page from
// data/kogmaw-adc-keystones-coachless.json.
// Re-run after refreshing the numbers: node tools/build-kogmaw-keystones-coachless.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sketch } from './sketch.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const data = JSON.parse(await readFile(`${ROOT}data/kogmaw-adc-keystones-coachless.json`, 'utf8'));
const s = sketch({ seed: 21 });
const { stats, brackets, keystones } = data;

const fmtWpa = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}`;
const fmtInt = (n) => n.toLocaleString('en-US');
// 95% margin for a win rate from n games, in percentage points (binomial only).
const margin = (n) => 1.96 * Math.sqrt(0.25 / n) * 100;
const se = (n) => margin(n) / 1.96;
const games = (b) => keystones.reduce((sum, k) => sum + (k.stats[b.key]?.picks ?? 0), 0);
const stat = (name, key) => keystones.find((k) => k.name === name).stats[key];

// ---- Title ----
s.note(0, 0, `${data.champion} ${data.role} · keystones (coachless, NA)`, { size: 38 });
s.wobblyLine([[4, 58], [760, 54]], { color: 'Red chalk', width: 2.5 });
s.note(0, 70,
  `Stats: ${stats.site}, patch ${stats.patch}, pulled ${data.pulledAt}.\n`
  + 'Rune numbers: LoL wiki (ranged values).\n'
  + 'Coachless has no Challenger-only bracket; Master+ is its top.',
  { size: 15, color: 'Sepia' });

// ---- Layout ----
const top = 250;
const rowH = 110;
const panelX0 = 700;
const panelW = 300;
const panelGap = 24;
const lo = -5; // WPA axis range, in percentage points
const hi = 2;
const perPoint = 36;
const zeroIn = (-lo) * perPoint + 20; // zero line offset inside a panel
const axisBottom = top + keystones.length * rowH - 30;

// Keystone names and wiki text on the left.
keystones.forEach((k, i) => {
  const y = top + i * rowH;
  s.image(0, y, 56, 56, data.icons.base + k.icon);
  s.note(70, y - 6, k.name, { size: 26 });
  s.note(70, y + 28, `${k.tree} · ${k.wiki}`, { size: 14, color: 'Sepia', maxChars: 62 });
});
s.note(0, top - 52, 'Keystone  ·  wiki numbers', { size: 15, color: 'Slate' });

// One small chart per rank bracket.
brackets.forEach((b, p) => {
  const x0 = panelX0 + p * (panelW + panelGap);
  const zx = x0 + zeroIn;
  const dim = Boolean(b.reference);
  s.note(x0, top - 104, b.label, { size: 18, color: dim ? 'Slate' : 'Parchment' });
  s.note(x0, top - 78, `${fmtInt(games(b))} games${dim ? ' · for reference' : ''}`, { size: 13, color: 'Slate' });

  s.wobblyLine([[zx, top - 30], [zx, axisBottom]], { color: dim ? 'Slate' : 'Parchment', width: 1.3 });
  for (let t = -4; t <= hi; t += 2) {
    const x = zx + t * perPoint;
    s.wobblyLine([[x, top - 34], [x, top - 26]], { color: 'Slate', width: 1.2 });
    s.note(x - 8, top - 58, t ? `${t > 0 ? '+' : '−'}${Math.abs(t)}` : '0', { size: 12, color: 'Slate' });
  }

  keystones.forEach((k, i) => {
    const y = top + i * rowH + 18;
    const st = k.stats[b.key];
    if (!st) {
      s.note(zx - 40, y - 8, 'not listed', { size: 13, color: 'Slate' });
      return;
    }
    const m = margin(st.picks);
    const a = Math.max(st.wpa - m, lo);
    const c = Math.min(st.wpa + m, hi);
    s.wobblyLine([[zx + a * perPoint, y], [zx + c * perPoint, y]], { color: 'Slate', width: 1.4, wobble: 0.3 });
    for (const [v, cut] of [[a, st.wpa - m < lo], [c, st.wpa + m > hi]]) {
      if (!cut) s.wobblyLine([[zx + v * perPoint, y - 6], [zx + v * perPoint, y + 6]], { color: 'Slate', width: 1.4, wobble: 0.2 });
    }
    const color = dim ? 'Slate' : st.wpa > 0 ? 'Moss' : 'Red chalk';
    s.wobblyLine([[zx, y], [zx + st.wpa * perPoint, y]], { color, width: 11 });
    s.note(x0 + 10, y + 12, `${fmtWpa(st.wpa)}  ·  ${fmtInt(st.picks)} games  ·  ±${m.toFixed(1)}`,
      { size: 13, color: dim ? 'Slate' : st.picks < 500 ? 'Slate' : 'Parchment' });
  });
});

// Circle the biggest NA sample: Lethal Tempo at Gold+.
s.loop(panelX0 + panelW / 2 - 4, top + 26, panelW / 2 - 2, 34, { color: 'Red chalk', width: 2.5 });

const restTop = axisBottom + 60;
s.note(0, restTop, [
  'Whisker = rough 95% noise from sample size alone (cut off at the axis ends).',
  `No WPA in any bracket: ${stats.notListed.join(', ')}.`,
].join('\n'), { size: 15, color: 'Slate', maxChars: 68 });

// ---- Reading notes (right column) ----
const colX = panelX0 + brackets.length * (panelW + panelGap) + 40;
const lt = (key) => stat('Lethal Tempo', key);
const storm = (key) => stat("Stormraider's Surge", key);
const ltShares = brackets.map((b) => Math.round((100 * lt(b.key).picks) / games(b)));
const shares = [Math.min(...ltShares), Math.max(...ltShares)];
const z = (a, b) => (Math.abs(a.wpa - b.wpa) / Math.hypot(se(a.picks), se(b.picks))).toFixed(1);

s.note(colX, top - 104, 'How to read it', { size: 24, color: 'Sepia' });
s.note(colX, top - 68,
  'WPA = win rate − how likely those players were to win anyway (after draft). '
  + 'Positive means the pick added win chance on average.',
  { size: 16, maxChars: 54 });

s.note(colX, top + 30, 'What it says', { size: 24, color: 'Sepia' });
s.note(colX, top + 66, [
  '• In NA every keystone is below zero, in every bracket. NA Kog players win a bit less than coachless\'s model expects. So compare keystones with each other, not with 0.',
  `• Gold+ is the only NA sample big enough to read (${fmtInt(games(brackets[0]))} games). Lethal Tempo (${fmtWpa(lt('naGold').wpa)}) sits with Comet and First Strike; Stormraider's (${fmtWpa(storm('naGold').wpa)}) trails it by about ${z(lt('naGold'), storm('naGold'))}× the noise. A lean, not proof.`,
  `• NA Diamond+ has ${fmtInt(games(brackets[1]))} games and NA Master+ only ${fmtInt(games(brackets[2]))}. Their whiskers are wider than the gaps, so they can't rank anything yet.`,
  `• Lethal Tempo is the most-picked keystone in every bracket (${shares[0]}% to ${shares[1]}% of games; in NA Master+ it only edges Stormraider's, 171 to 170), and no alternative beats it anywhere with a real sample.`,
].join('\n'), { size: 16, maxChars: 54 });

s.note(colX, top + 470, 'Caveats', { size: 24, color: 'Sepia' });
s.note(colX, top + 506, [
  '• A keystone comes with a secondary tree and a build. WPA credits the whole setup, not the rune alone.',
  `• ${stats.limits}`,
  '• Patch 16.19 only; the free site doesn\'t combine patches.',
].join('\n'), { size: 16, maxChars: 54 });

s.note(0, restTop + 150, [
  `Stats: ${stats.source}`,
  `${stats.filters}`,
  stats.pickCountsNote,
  `Rune text: ${data.wiki.source}<rune> · icons: ${data.icons.source} ${data.icons.version}`,
  'Made by tools/build-kogmaw-keystones-coachless.mjs',
  'from data/kogmaw-adc-keystones-coachless.json.',
].join('\n'), { size: 12, color: 'Slate', maxChars: 64 });

const page = s.page({
  title: `${data.champion} ${data.role}: keystones (coachless, NA)`,
  source: { stats: stats.source, wiki: data.wiki.source, icons: `${data.icons.source} ${data.icons.version}`, pulledAt: data.pulledAt },
});
await writeFile(`${ROOT}library/kogmaw-adc-keystones-coachless.json`, JSON.stringify(page, null, 1) + '\n');
console.log(`wrote ${page.page.items.length} items`);
