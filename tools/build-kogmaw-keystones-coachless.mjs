// Builds the "Kog'Maw ADC: keystones (coachless)" library page from
// data/kogmaw-adc-keystones-coachless.json.
// Re-run after refreshing the numbers: node tools/build-kogmaw-keystones-coachless.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sketch } from './sketch.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const data = JSON.parse(await readFile(`${ROOT}data/kogmaw-adc-keystones-coachless.json`, 'utf8'));
const s = sketch({ seed: 21 });
const { stats } = data;

const fmtWpa = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}`;
const fmtInt = (n) => n.toLocaleString('en-US');
// 95% margin for a win rate from n games, in percentage points (binomial only).
const margin = (n) => 1.96 * Math.sqrt(0.25 / n) * 100;
const se = (n) => margin(n) / 1.96;

const rows = [...data.keystones].sort((a, b) => b.wpa - a.wpa);
const total = rows.reduce((sum, k) => sum + k.picks, 0);
const share = (k) => (100 * k.picks) / total;

// ---- Title ----
s.note(0, 0, `${data.champion} ${data.role} · keystones (coachless)`, { size: 38 });
s.wobblyLine([[4, 58], [640, 54]], { color: 'Red chalk', width: 2.5 });
s.note(0, 70,
  `Stats: ${stats.site}, patch ${stats.patch}, ${stats.rank},\n${fmtInt(total)} games with a listed keystone.\n`
  + `Rune numbers: LoL wiki (ranged values). Pulled ${data.pulledAt}.`,
  { size: 15, color: 'Sepia' });

// ---- Table ----
const top = 190;
const rowH = 104;
const axisX = 820; // WPA zero line
const perPoint = 60; // px per WPA percentage point
const clip = 3.4; // whiskers are cut off here so First Strike's huge range fits

s.note(0, top - 46, 'Keystone  ·  wiki numbers', { size: 15, color: 'Slate' });
s.note(axisX - 150, top - 46, 'WPA (pp), whisker = noise', { size: 15, color: 'Slate' });
s.note(axisX + clip * perPoint + 40, top - 46, 'Picks · share', { size: 15, color: 'Slate' });

const axisBottom = top + rows.length * rowH - 24;
s.wobblyLine([[axisX, top - 14], [axisX, axisBottom]], { color: 'Parchment', width: 1.5 });
for (let t = -3; t <= 3; t++) {
  const x = axisX + t * perPoint;
  s.wobblyLine([[x, top - 18], [x, top - 10]], { color: 'Parchment', width: 1.2 });
  s.note(x - 9, axisBottom + 4, t ? `${t > 0 ? '+' : '−'}${Math.abs(t)}` : '0', { size: 12, color: 'Slate' });
}

rows.forEach((k, i) => {
  const y = top + i * rowH;
  const thin = k.picks < 1000;
  s.image(0, y, 56, 56, data.icons.base + k.icon);
  s.note(70, y - 6, k.name, { size: 26, color: thin ? 'Slate' : 'Parchment' });
  s.note(70, y + 28, `${k.tree} · ${k.wiki}`, { size: 14, color: 'Sepia', maxChars: 62 });

  // Noise whisker first, so the bar sits on top of it.
  const m = margin(k.picks);
  const lo = Math.max(k.wpa - m, -clip);
  const hi = Math.min(k.wpa + m, clip);
  const wy = y + 24;
  s.wobblyLine([[axisX + lo * perPoint, wy], [axisX + hi * perPoint, wy]], { color: 'Slate', width: 1.5, wobble: 0.3 });
  for (const [v, cut] of [[lo, k.wpa - m < -clip], [hi, k.wpa + m > clip]]) {
    const x = axisX + v * perPoint;
    if (cut) s.note(x + (v < 0 ? -18 : 4), wy - 12, '…', { size: 14, color: 'Slate' });
    else s.wobblyLine([[x, wy - 7], [x, wy + 7]], { color: 'Slate', width: 1.5, wobble: 0.2 });
  }

  const end = axisX + k.wpa * perPoint;
  const color = k.wpa > 0 ? 'Moss' : 'Red chalk';
  s.wobblyLine([[axisX, wy], [end, wy]], { color, width: 12 });
  const labelX = k.wpa >= 0 ? axisX - 66 : axisX + 10;
  s.note(labelX, wy - 34, fmtWpa(k.wpa), { size: 16, color });

  s.note(axisX + clip * perPoint + 40, y + 2,
    `${fmtInt(k.picks)} · ${share(k).toFixed(1)}%\nnoise ±${m.toFixed(1)} pp`,
    { size: 15, color: thin ? 'Slate' : 'Parchment' });
});

// Circle the default pick.
const lt = rows.find((k) => k.name === 'Lethal Tempo');
const ltY = top + rows.indexOf(lt) * rowH;
s.loop(axisX + 10, ltY + 14, 135, 44, { color: 'Red chalk', width: 2.5 });

const restTop = axisBottom + 50;
s.note(0, restTop, [
  'No WPA shown (too few games for coachless to list):',
  stats.notListed.join(', ') + '.',
  `Primary tree share: Precision ${stats.primaryTreeShare.Precision}%, Sorcery ${stats.primaryTreeShare.Sorcery}%, Inspiration ${stats.primaryTreeShare.Inspiration}%.`,
].join('\n'), { size: 15, color: 'Slate', maxChars: 68 });

// ---- Reading notes (right column) ----
const colX = 1500;
s.note(colX, top - 46, 'How to read it', { size: 24, color: 'Sepia' });
s.note(colX, top - 10,
  'WPA = win rate − how likely those players were to win anyway (after draft). '
  + 'Positive means the pick added win chance on average.\n'
  + 'The whisker is my rough 95% range from sample size alone. If it crosses 0, the sign is not known.',
  { size: 16, maxChars: 54 });

const pta = rows.find((k) => k.name === 'Press the Attack');
const storm = rows.find((k) => k.name === "Stormraider's Surge");
const fs = rows.find((k) => k.name === 'First Strike');
const z = (a, b) => ((a.wpa - b.wpa) / Math.hypot(se(a.picks), se(b.picks))).toFixed(1);
s.note(colX, top + 150, 'What it says', { size: 24, color: 'Sepia' });
s.note(colX, top + 186, [
  `• Lethal Tempo is the default: ${share(lt).toFixed(0)}% of games, ${fmtWpa(lt.wpa)} WPA. That is inside its ±${margin(lt.picks).toFixed(1)} noise, so read it as "fine", not "adds win rate".`,
  `• LT vs Press the Attack: ${(lt.wpa - pta.wpa).toFixed(1)} pp gap, about ${z(lt, pta)}× its standard error. A lean to LT, not proof.`,
  `• LT vs Stormraider's: ${(lt.wpa - storm.wpa).toFixed(1)} pp, about ${z(lt, storm)}×. The clearest gap here, still short of solid.`,
  `• First Strike's ${fmtWpa(fs.wpa)} is from ${fs.picks} games (±${margin(fs.picks).toFixed(1)}). It tells us nothing yet.`,
].join('\n'), { size: 16, maxChars: 54 });

s.arrow([[colX - 20, top + 215], [colX - 110, ltY - 6], [axisX + 150, ltY - 18]], { color: 'Red chalk', width: 2 });

s.note(colX, top + 440, 'Why it might fit Kog\'Maw', { size: 24, color: 'Sepia' });
s.note(colX, top + 476, [
  '• W turns attacks into his main damage, so a keystone that pays per attack over a long fight (LT) fits.',
  '• PTA pays once per target for 3 hits; strong in short trades, weaker in long front-to-back fights.',
  '• Comet and Stormraider\'s are probably AP or poke setups. Coachless doesn\'t split by build, so this is a guess.',
  'Hypotheses from the wiki text, not something these stats prove.',
].join('\n'), { size: 16, maxChars: 54 });

s.note(colX, top + 720, 'Caveat: a keystone comes with a secondary tree and build. WPA credits the whole setup, not the rune alone.', { size: 15, color: 'Moss', maxChars: 54 });

s.note(0, restTop + 120, [
  `Stats: ${stats.source}`,
  `(${stats.filters}). ${stats.pickCountsNote}`,
  `Rune text: ${data.wiki.source}<rune> · icons: ${data.icons.source} ${data.icons.version}`,
  'Made by tools/build-kogmaw-keystones-coachless.mjs',
  'from data/kogmaw-adc-keystones-coachless.json.',
].join('\n'), { size: 12, color: 'Slate', maxChars: 64 });

const page = s.page({
  title: `${data.champion} ${data.role}: keystones (coachless)`,
  source: { stats: stats.source, wiki: data.wiki.source, icons: `${data.icons.source} ${data.icons.version}`, pulledAt: data.pulledAt },
});
await writeFile(`${ROOT}library/kogmaw-adc-keystones-coachless.json`, JSON.stringify(page, null, 1) + '\n');
console.log(`wrote ${page.page.items.length} items`);
