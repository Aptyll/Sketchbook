// Builds the "Kog'Maw ADC: keystones (u.gg)" library page from data/kogmaw-adc-keystones-ugg.json.
// Re-run after refreshing the numbers: node tools/build-kogmaw-keystones-ugg.mjs
//
// u.gg gives raw win rates, so every number is drawn with its sample-size
// noise (a 95% whisker) next to the champion's overall win rate.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sketch } from './sketch.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const data = JSON.parse(await readFile(`${ROOT}data/kogmaw-adc-keystones-ugg.json`, 'utf8'));
const s = sketch({ seed: 26 });
const { stats } = data;
const samples = stats.samples;

const fmtInt = (n) => n.toLocaleString('en-US');
const fmtK = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));
const fmtPp = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)}`;
// 95% margin for a win rate from n games, in percentage points (binomial only).
const margin = (n) => 1.96 * Math.sqrt(0.25 / n) * 100;
const games = (sample, name) => Math.round((sample.keystones[name][1] / 100) * sample.matches);
const wr = (sample, name) => sample.keystones[name][0];
// How many standard errors separate keystone `b` from keystone `a` in one sample.
function gap(sample, a, b) {
  const d = wr(sample, a) - wr(sample, b);
  const se = Math.hypot(margin(games(sample, a)), margin(games(sample, b))) / 1.96;
  return { d, z: d / se };
}

// ---- Title ----
s.note(0, 0, `${data.champion} ${data.role} · keystones on u.gg`, { size: 38 });
s.wobblyLine([[4, 58], [640, 54]], { color: 'Red chalk', width: 2.5 });
s.note(0, 70, [
  `Stats: ${stats.site}, ${stats.queue}, ${stats.region}. Raw win rates,`,
  'not adjusted for who picks what. Rune text: LoL wiki (ranged values).',
  `Pulled ${data.pulledAt}. u.gg's patch 26.20 is Riot's 16.20.`,
].join('\n'), { size: 15, color: 'Sepia' });

// ---- Chart: one row per keystone, one mini plot per sample ----
const top = 220;
const rowH = 104;
const colW = 300;
const colX0 = 640;
const lo = 44; // win rate at the left edge of each mini plot
const hi = 62;
const plotW = 250;
const xOf = (col, w) => colX0 + col * colW + ((Math.min(hi, Math.max(lo, w)) - lo) / (hi - lo)) * plotW;
const rows = data.keystones;
const bottom = top + rows.length * rowH - 24;

s.note(0, top - 50, 'Keystone  ·  what it does', { size: 15, color: 'Slate' });
samples.forEach((sm, c) => {
  const x = colX0 + c * colW;
  s.note(x, top - 86, sm.label, { size: 17, color: c === 0 ? 'Parchment' : 'Slate' });
  s.note(x, top - 62, `${fmtInt(sm.matches)} games · Kog avg ${sm.champWinRate}%`, { size: 13, color: 'Slate' });
  // The champion's average win rate, as a reference line.
  const ax = xOf(c, sm.champWinRate);
  s.wobblyLine([[ax, top - 30], [ax, bottom]], { color: 'Sepia', width: 1.2 });
  // Axis ticks every 4 points.
  s.wobblyLine([[x, bottom + 6], [x + plotW, bottom + 6]], { color: 'Parchment', width: 1 });
  for (let t = 46; t <= 62; t += 4) {
    const tx = xOf(c, t);
    s.wobblyLine([[tx, bottom + 1], [tx, bottom + 11]], { color: 'Parchment', width: 1 });
    s.note(tx - 10, bottom + 14, `${t}`, { size: 12, color: 'Slate' });
  }
});
s.note(colX0, bottom + 36, [
  'Win rate %. Dot = u.gg number.',
  'Whisker = rough 95% noise from the game count alone.',
  'Tan line = Kog\'Maw\'s average in that sample.',
  'g = games (pick rate × matches, rounded).',
].join('\n'), { size: 13, color: 'Slate' });

rows.forEach((k, i) => {
  const y = top + i * rowH;
  s.image(0, y, 56, 56, data.icons.base + k.icon);
  s.note(70, y - 6, k.name, { size: 26 });
  s.note(70, y + 28, `${k.tree} · ${k.wiki}`, { size: 13, color: 'Sepia', maxChars: 62 });

  samples.forEach((sm, c) => {
    if (!sm.keystones[k.name]) return;
    const w = wr(sm, k.name);
    const n = games(sm, k.name);
    const m = margin(n);
    const cy = y + 18;
    const diff = w - sm.champWinRate;
    const color = Math.abs(diff) < m ? 'Parchment' : diff > 0 ? 'Moss' : 'Red chalk';
    s.wobblyLine([[xOf(c, w - m), cy], [xOf(c, w + m), cy]], { color, width: 1.6, wobble: 0.3 });
    for (const e of [w - m, w + m]) {
      if (e > lo && e < hi) s.stroke([[xOf(c, e), cy - 6], [xOf(c, e), cy + 6]], { color, width: 1.6 });
    }
    s.wobblyLine([[xOf(c, w) - 3, cy], [xOf(c, w) + 3, cy]], { color, width: 11, wobble: 0.2 });
    s.note(colX0 + c * colW, cy + 14, `${w.toFixed(1)}% WR · ${sm.keystones[k.name][1].toFixed(1)}% pick · ${fmtK(n)} g`,
      { size: 13, color: n < 1000 ? 'Slate' : 'Parchment' });
  });
});

// Rare keystones: listed with their game counts so nobody reads the 100%s as real.
const main = samples[0];
const rare = Object.keys(main.keystones).filter((name) => !rows.some((k) => k.name === name));
const rareTop = bottom + 84;
s.note(0, rareTop, `Under 0.5% pick rate (${main.label}). Too few games to say anything:`, { size: 15, color: 'Slate' });
const rareText = rare.map((name) => `${name} ${wr(main, name)}% (${games(main, name)} g)`).join('\n');
s.note(0, rareTop + 26, rareText, { size: 14, color: 'Slate' });
const footTop = rareTop + 26 + rare.length * 20 + 30;

// Circle the default pick in the biggest sample.
const ltY = top + rows.findIndex((k) => k.name === 'Lethal Tempo') * rowH + 18;
s.loop(xOf(0, wr(main, 'Lethal Tempo')), ltY, 34, 22, { color: 'Red chalk', width: 2.5 });

// ---- Reading notes (right column) ----
const colX = colX0 + samples.length * colW + 40;
const dia = samples.find((sm) => sm.rank === 'Diamond+');
const early = samples.find((sm) => sm.patch !== main.patch);
const lpE = gap(main, 'Lethal Tempo', 'Press the Attack');
const lpD = gap(dia, 'Lethal Tempo', 'Press the Attack');
const lsE = gap(main, 'Lethal Tempo', "Stormraider's Surge");
const lsD = gap(dia, 'Lethal Tempo', "Stormraider's Surge");
const fsN = games(dia, 'First Strike');

s.note(colX, top - 86, 'How to read it', { size: 24, color: 'Sepia' });
s.note(colX, top - 50, [
  'These are raw win rates. Players who pick an off-meta rune may be one-tricks, or picking it into a matchup that was already hard, so a gap is a clue, not a cause.',
  'Green or red only when the dot sits further from the average than its whisker.',
].join('\n'), { size: 15, maxChars: 48 });

s.note(colX, top + 130, 'What it says', { size: 24, color: 'Sepia' });
s.note(colX, top + 166, [
  `• Lethal Tempo is the default: ${main.keystones['Lethal Tempo'][1]}% of ${main.label} games. It sits at or just above the average because it is most of the average.`,
  `• PTA: ${fmtPp(-lpE.d)} pp vs Tempo in Emerald+ (${lpE.z.toFixed(1)}× its noise), but only ${fmtPp(-lpD.d)} pp in Diamond+ (${lpD.z.toFixed(1)}×). A lean against PTA, not a verdict.`,
  `• Stormraider's Surge: ${fmtPp(-lsE.d)} pp in Emerald+ (${lsE.z.toFixed(1)}×), about even in Diamond+ (${fmtPp(-lsD.d)} pp). Higher ranks pick it more (${dia.keystones["Stormraider's Surge"][1]}% vs ${main.keystones["Stormraider's Surge"][1]}%), likely as an anti-dive pick.`,
  `• First Strike: ≈${fsN} Diamond+ games. Its whiskers span ±${margin(fsN).toFixed(0)} pp, so it can't be ranked yet.`,
  `• ${early.label}: only ${fmtInt(early.matches)} games. Comet and First Strike look great there, but the whiskers say wait.`,
].join('\n'), { size: 15, maxChars: 48 });

s.note(colX, top + 590, 'To test next', { size: 24, color: 'Sepia' });
s.note(colX, top + 626, [
  '• Compare with coachless WPA, which adjusts for pre-game win chance.',
  '• Split by matchup: does PTA or Stormraider win more into tanks or dive?',
  '• Re-pull 26.21 once it has a full patch of games.',
].join('\n'), { size: 15, color: 'Moss', maxChars: 48 });

s.note(0, footTop, [
  `Sources: ${stats.source}`,
  '(+ &rank=diamond_plus; patch picker set to 26.20 and 26.21)',
  `${data.wiki.source}<rune>`,
  `Icons: ${data.icons.source} ${data.icons.version}`,
  'Made by tools/build-kogmaw-keystones-ugg.mjs',
  'from data/kogmaw-adc-keystones-ugg.json.',
].join('\n'), { size: 12, color: 'Slate' });

const page = s.page({
  title: `${data.champion} ${data.role}: keystones (u.gg)`,
  source: { stats: stats.source, wiki: data.wiki.source, icons: `${data.icons.source} ${data.icons.version}`, pulledAt: data.pulledAt },
});
await writeFile(`${ROOT}library/kogmaw-adc-keystones-ugg.json`, JSON.stringify(page, null, 1) + '\n');
console.log(`wrote ${page.page.items.length} items`);
