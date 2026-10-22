// Builds the "Kog'Maw ADC: keystones (coachless, NA)" library page from
// data/kogmaw-adc-keystones-coachless.json.
// Re-run after adding a patch's numbers: node tools/build-kogmaw-keystones-coachless.mjs
//
// The data file keeps every patch separately (coachless's free tier shows one
// patch at a time). This page pools them: games add up, and WPA is the
// game-weighted average, which is exact because WPA is an average over games.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sketch } from './sketch.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const data = JSON.parse(await readFile(`${ROOT}data/kogmaw-adc-keystones-coachless.json`, 'utf8'));
const s = sketch({ seed: 21 });
const { stats, brackets, keystones } = data;

const LOW_PANEL = 5000; // a bracket with fewer games is greyed out as "low sample"
const LOW_ROW = 1000; // so is a single keystone with fewer games (noise above ±3 pp)

const fmtWpa = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}`;
const fmtInt = (n) => n.toLocaleString('en-US');
// 95% margin for a win rate from n games, in percentage points (binomial only).
const margin = (n) => 1.96 * Math.sqrt(0.25 / n) * 100;
const se = (n) => margin(n) / 1.96;

// Pooled numbers for one keystone in one bracket, or undefined if never listed.
function pooled(k, key) {
  const perPatch = k.stats[key];
  if (!perPatch) return undefined;
  const rows = Object.entries(perPatch).map(([patch, v]) => ({ patch, ...v }));
  const picks = rows.reduce((sum, r) => sum + r.picks, 0);
  const wpa = rows.reduce((sum, r) => sum + r.wpa * r.picks, 0) / picks;
  return { wpa, picks, patches: rows };
}
const games = (b) => keystones.reduce((sum, k) => sum + (pooled(k, b.key)?.picks ?? 0), 0);
const stat = (name, key) => pooled(keystones.find((k) => k.name === name), key);
const z = (a, b) => (Math.abs(a.wpa - b.wpa) / Math.hypot(se(a.picks), se(b.picks))).toFixed(1);
const patchRange = `${stats.patches[0]} to ${stats.patches[stats.patches.length - 1]}`;

// ---- Title ----
s.note(0, 0, `${data.champion} ${data.role} · keystones (coachless, NA)`, { size: 38 });
s.wobblyLine([[4, 58], [760, 54]], { color: 'Red chalk', width: 2.5 });
s.note(0, 70,
  `Stats: ${stats.site}, patches ${patchRange} added together, pulled ${data.pulledAt}.\n`
  + `Same patches as ${patchRange.replace(/16\./g, '26.')} on u.gg (Riot's 2026 names).\n`
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
const hi = 4;
const perPoint = 30;
const zeroIn = (-lo) * perPoint + 15; // zero line offset inside a panel
const axisBottom = top + keystones.length * rowH - 30;

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
  const total = games(b);
  const lowPanel = total < LOW_PANEL;
  const dim = Boolean(b.reference) || lowPanel;
  const tag = b.reference ? ' · for reference' : lowPanel ? ' · low sample' : '';
  s.note(x0, top - 104, b.label, { size: 18, color: dim ? 'Slate' : 'Parchment' });
  s.note(x0, top - 78, `${fmtInt(total)} games${tag}`, { size: 13, color: lowPanel ? 'Red chalk' : 'Slate' });

  s.wobblyLine([[zx, top - 30], [zx, axisBottom]], { color: dim ? 'Slate' : 'Parchment', width: 1.3 });
  for (let t = -4; t <= hi; t += 2) {
    const x = zx + t * perPoint;
    s.wobblyLine([[x, top - 34], [x, top - 26]], { color: 'Slate', width: 1.2 });
    s.note(x - 8, top - 58, t ? `${t > 0 ? '+' : '−'}${Math.abs(t)}` : '0', { size: 12, color: 'Slate' });
  }

  keystones.forEach((k, i) => {
    const y = top + i * rowH + 18;
    const st = pooled(k, b.key);
    if (!st) {
      s.note(zx - 30, y - 8, 'not listed', { size: 13, color: 'Slate' });
      return;
    }
    const m = margin(st.picks);
    const a = Math.max(st.wpa - m, lo);
    const c = Math.min(st.wpa + m, hi);
    s.wobblyLine([[zx + a * perPoint, y], [zx + c * perPoint, y]], { color: 'Slate', width: 1.4, wobble: 0.3 });
    for (const [v, cut] of [[a, st.wpa - m < lo], [c, st.wpa + m > hi]]) {
      if (!cut) s.wobblyLine([[zx + v * perPoint, y - 6], [zx + v * perPoint, y + 6]], { color: 'Slate', width: 1.4, wobble: 0.2 });
    }
    const low = dim || st.picks < LOW_ROW;
    const color = low ? 'Slate' : st.wpa > 0 ? 'Moss' : 'Red chalk';
    s.wobblyLine([[zx, y], [zx + st.wpa * perPoint, y]], { color, width: 11 });
    // Single patches as small sepia ticks above the bar.
    for (const r of st.patches) {
      const x = zx + Math.max(lo, Math.min(hi, r.wpa)) * perPoint;
      s.stroke([[x, y - 17], [x, y - 9]], { color: 'Sepia', width: 2 });
    }
    s.note(x0 + 10, y + 12, `${fmtWpa(st.wpa)}  ·  ${fmtInt(st.picks)} games  ·  ±${m.toFixed(1)}`,
      { size: 13, color: low ? 'Slate' : 'Parchment' });
  });
});

const restTop = axisBottom + 60;
s.note(0, restTop, [
  'Bar = all patches added together. Whisker = rough 95% noise from',
  'sample size alone (cut off at the axis ends). Small sepia ticks =',
  'single patches. Grey = under 1,000 games, too few to read.',
  `No WPA in any bracket: ${stats.notListed.join(', ')}.`,
].join('\n'), { size: 15, color: 'Slate', maxChars: 68 });

// ---- Reading notes (right column) ----
const colX = panelX0 + brackets.length * (panelW + panelGap) + 40;
const [naGold, naDia, naMaster] = brackets;
const lt = (b) => stat('Lethal Tempo', b.key);
const pta = (b) => stat('Press the Attack', b.key);
const storm = (b) => stat("Stormraider's Surge", b.key);
const world = brackets.find((b) => b.reference);
const stormWorld = keystones.find((k) => k.name === "Stormraider's Surge").stats[world.key];

s.note(colX, top - 104, 'How to read it', { size: 24, color: 'Sepia' });
s.note(colX, top - 68,
  'WPA = win rate − how likely those players were to win anyway (after draft). '
  + 'Positive means the pick added win chance on average.',
  { size: 16, maxChars: 54 });

s.note(colX, top + 30, 'What it says', { size: 24, color: 'Sepia' });
s.note(colX, top + 66, [
  `• NA Gold+ (${fmtInt(games(naGold))} games): Lethal Tempo ${fmtWpa(lt(naGold).wpa)} is the safe default. Press the Attack trails it by ${(lt(naGold).wpa - pta(naGold).wpa).toFixed(1)} pp, about ${z(lt(naGold), pta(naGold))}× the noise.`,
  `• The one lead worth testing: in NA Diamond+ Stormraider's (${fmtWpa(storm(naDia).wpa)}) beats Lethal Tempo (${fmtWpa(lt(naDia).wpa)}) by ${z(lt(naDia), storm(naDia))}× the noise, and Master+ points the same way (${z(lt(naMaster), storm(naMaster))}×). Stormraider's has only ${fmtInt(storm(naDia).picks)} NA Diamond+ games, so its bar stays grey.`,
  `• Why only a lead: I compared many pairs, so one of them can look strong by chance. And worldwide, Stormraider's fell from ${fmtWpa(stormWorld['16.17'].wpa)} on 16.17 to ${fmtWpa(stormWorld['16.20'].wpa)} on 16.20, so adding patches up may hide a change.`,
  '• Next: try Stormraider\'s in your own NA games and re-check here each patch.',
].join('\n'), { size: 16, maxChars: 54 });

// Circle the lead: Stormraider's in NA Diamond+.
const stormRow = keystones.findIndex((k) => k.name === "Stormraider's Surge");
s.loop(panelX0 + (panelW + panelGap) + panelW / 2 - 4, top + stormRow * rowH + 26, panelW / 2 - 2, 34, { color: 'Red chalk', width: 2.5 });

s.note(colX, top + 520, 'Caveats', { size: 24, color: 'Sepia' });
s.note(colX, top + 556, [
  '• A keystone comes with a secondary tree and a build. WPA credits the whole setup, not the rune alone.',
  `• ${stats.limits}`,
  `• ${stats.pooling}`,
].join('\n'), { size: 16, maxChars: 54 });

s.note(0, restTop + 170, [
  `Stats: ${stats.source}`,
  `${stats.filters}`,
  stats.pickCountsNote,
  `Rune text: ${data.wiki.source}<rune> · icons: ${data.icons.source} ${data.icons.version}`,
  'Made by tools/build-kogmaw-keystones-coachless.mjs',
  'from data/kogmaw-adc-keystones-coachless.json.',
].join('\n'), { size: 12, color: 'Slate', maxChars: 64 });

const page = s.page({
  title: `${data.champion} ${data.role}: keystones (coachless, NA)`,
  source: { stats: stats.source, patches: stats.patches, wiki: data.wiki.source, icons: `${data.icons.source} ${data.icons.version}`, pulledAt: data.pulledAt },
});
await writeFile(`${ROOT}library/kogmaw-adc-keystones-coachless.json`, JSON.stringify(page, null, 1) + '\n');
console.log(`wrote ${page.page.items.length} items`);
