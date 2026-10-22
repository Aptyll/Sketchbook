// Builds the "Kog'Maw ADC: keystones (u.gg)" library page from data/kogmaw-adc-keystones-ugg.json.
// Re-run after refreshing the numbers: node tools/build-kogmaw-keystones-ugg.mjs
//
// u.gg gives raw win rates, so every number is drawn with its sample-size
// noise (a 95% whisker) next to the champion's overall win rate.
// The page has one tab per patch plus a tab that pools all of them.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sketch } from './sketch.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const data = JSON.parse(await readFile(`${ROOT}data/kogmaw-adc-keystones-ugg.json`, 'utf8'));
const s = sketch({ seed: 26 });
const { stats } = data;

const fmtInt = (n) => n.toLocaleString('en-US');
const fmtK = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));
const fmtPp = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)}`;
const fmtPct = (n) => `${n.toFixed(1)}%`;
// 95% margin for a win rate from n games, in percentage points (binomial only).
const margin = (n) => 1.96 * Math.sqrt(0.25 / n) * 100;

// ---- Data: each sample becomes { label, matches, champWinRate, ks: { name: { wr, pick, n } } } ----
function fromRaw(sample) {
  const ks = {};
  for (const [name, [w, pick]] of Object.entries(sample.keystones)) {
    ks[name] = { wr: w, pick, n: Math.round((pick / 100) * sample.matches) };
  }
  return { label: sample.label, rankParam: sample.rankParam, matches: sample.matches, champWinRate: sample.champWinRate, ks };
}

// Adds up games and wins across patches for one rank bucket.
function pool(samples) {
  const matches = samples.reduce((a, sm) => a + sm.matches, 0);
  const champWinRate = samples.reduce((a, sm) => a + sm.champWinRate * sm.matches, 0) / matches;
  const ks = {};
  for (const sm of samples) {
    for (const [name, k] of Object.entries(sm.ks)) {
      const acc = (ks[name] ??= { n: 0, wins: 0 });
      acc.n += k.n;
      acc.wins += (k.wr / 100) * k.n;
    }
  }
  for (const k of Object.values(ks)) {
    k.wr = k.n ? (k.wins / k.n) * 100 : 0;
    k.pick = (k.n / matches) * 100;
  }
  return { label: samples[0].label, rankParam: samples[0].rankParam, matches, champWinRate, ks };
}

const patches = stats.patches.map((p) => ({ ...p, samples: p.samples.map(fromRaw) }));
const pooled = {
  patch: `${patches[0].patch} to ${patches[patches.length - 1].patch}`,
  samples: patches[0].samples.map((_, i) => pool(patches.map((p) => p.samples[i]))),
};
const views = [
  ...patches.map((p) => ({ id: `patch-${p.patch}`, label: `Patch ${p.patch}`, ...p })),
  { id: 'pooled', label: `${patches.length} patches pooled`, ...pooled, pooled: true },
];

const SS = "Stormraider's Surge";
const LT = 'Lethal Tempo';
// How far keystone `a` is from `b` in one sample, and how many standard errors that is.
function gap(sm, a, b) {
  const d = sm.ks[a].wr - sm.ks[b].wr;
  const se = Math.hypot(margin(sm.ks[a].n), margin(sm.ks[b].n)) / 1.96;
  return { d, z: d / se };
}

// ---- Layout ----
const top = 250;
const rowH = 104;
const colW = 285;
const colX0 = 640;
const lo = 30; // win rate at the left edge of each mini plot
const hi = 70;
const plotW = 245;
const xOf = (col, w) => colX0 + col * colW + ((Math.min(hi, Math.max(lo, w)) - lo) / (hi - lo)) * plotW;
const rows = data.keystones;
const bottom = top + rows.length * rowH - 24;
const nCols = patches[0].samples.length;
const colX = colX0 + nCols * colW + 40; // right-hand notes

// ---- Shared by every tab ----
s.tab(null);
s.note(0, 0, `${data.champion} ${data.role} · keystones on u.gg (${stats.region})`, { size: 38 });
s.wobblyLine([[4, 58], [640, 54]], { color: 'Red chalk', width: 2.5 });
s.note(0, 70, [
  `Stats: ${stats.site}, ${stats.queue}, ${stats.region} server. Raw win rates,`,
  'not adjusted for who picks what. Rune text: LoL wiki (ranged values).',
  `Patches ${pooled.patch} (u.gg's names; Riot's are 16.x). Pulled ${data.pulledAt}.`,
  'Rank buckets overlap: Diamond+ holds the Master+ games,',
  'and Master+ holds the Challenger games. Switch patch with the tabs up top.',
].join('\n'), { size: 15, color: 'Sepia' });

s.note(0, top - 50, 'Keystone  ·  what it does', { size: 15, color: 'Slate' });
rows.forEach((k, i) => {
  const y = top + i * rowH;
  s.image(0, y, 56, 56, data.icons.base + k.icon);
  s.note(70, y - 6, k.name, { size: 26 });
  s.note(70, y + 28, `${k.tree} · ${k.wiki}`, { size: 13, color: 'Sepia', maxChars: 62 });
});

for (let c = 0; c < nCols; c++) {
  const x = colX0 + c * colW;
  s.note(x, top - 86, `${stats.region} · ${patches[0].samples[c].label}`, { size: 17 });
  s.wobblyLine([[x, bottom + 6], [x + plotW, bottom + 6]], { color: 'Parchment', width: 1 });
  for (let t = lo; t <= hi; t += 10) {
    const tx = xOf(c, t);
    s.wobblyLine([[tx, bottom + 1], [tx, bottom + 11]], { color: 'Parchment', width: 1 });
    s.note(tx - 10, bottom + 14, `${t}`, { size: 12, color: 'Slate' });
  }
}
s.note(colX0, bottom + 36, [
  'Win rate %. Dot = u.gg number.',
  'Whisker = rough 95% noise from the game count alone.',
  'Tan line = Kog\'Maw\'s average in that sample.',
  'g = games (pick rate × matches, rounded).',
].join('\n'), { size: 13, color: 'Slate' });

s.note(colX, top - 86, 'How to read it', { size: 24, color: 'Sepia' });
s.note(colX, top - 50, [
  'These are raw win rates. Players who pick an off-meta rune may be one-tricks, or picking it into a matchup that was already hard, so a gap is a clue, not a cause.',
  'Green or red only when the dot sits further from the average than its whisker.',
].join('\n'), { size: 15, maxChars: 48 });

const notesTop = top + 130;
const testTop = top + 680;
s.note(colX, testTop, 'To test next', { size: 24, color: 'Sepia' });
s.note(colX, testTop + 36, [
  '• Compare with coachless WPA, which adjusts for pre-game win chance.',
  '• Split by matchup: does PTA or Stormraider win more into tanks or dive?',
  '• Look at who the NA Challenger Kog players are and what they run.',
  '• Add 26.21 once it has a full patch of games.',
].join('\n'), { size: 15, color: 'Moss', maxChars: 48 });

const rareTop = bottom + 84;
const rareMax = Math.max(...views.map((v) => Object.keys(v.samples[0].ks).length - rows.length));
const footTop = rareTop + 26 + rareMax * 20 + 30;
s.note(0, footTop, [
  `Sources: ${stats.source}`,
  `(+ &rank=${patches[0].samples.map((sm) => sm.rankParam).join(' | ')};`,
  ` patch=${patches.map((p) => p.riotPatch.replace('.', '_')).join(' | ')})`,
  `${data.wiki.source}<rune>`,
  `Icons: ${data.icons.source} ${data.icons.version}`,
  'Made by tools/build-kogmaw-keystones-ugg.mjs',
  'from data/kogmaw-adc-keystones-ugg.json.',
].join('\n'), { size: 12, color: 'Slate' });

// ---- One tab per view ----
for (const view of views) {
  s.tab(view.id);
  const samples = view.samples;
  const main = samples[0];
  const chal = samples[samples.length - 1];

  samples.forEach((sm, c) => {
    const x = colX0 + c * colW;
    s.note(x, top - 62, `${fmtInt(sm.matches)} games · Kog avg ${fmtPct(sm.champWinRate)}`, { size: 13, color: 'Slate' });
    const ax = xOf(c, sm.champWinRate);
    s.wobblyLine([[ax, top - 30], [ax, bottom]], { color: 'Sepia', width: 1.2 });
  });

  rows.forEach((k, i) => {
    const y = top + i * rowH;
    samples.forEach((sm, c) => {
      const d = sm.ks[k.name];
      if (!d || !d.n) return;
      const m = margin(d.n);
      const cy = y + 18;
      const diff = d.wr - sm.champWinRate;
      const color = Math.abs(diff) < m ? 'Parchment' : diff > 0 ? 'Moss' : 'Red chalk';
      s.wobblyLine([[xOf(c, d.wr - m), cy], [xOf(c, d.wr + m), cy]], { color, width: 1.6, wobble: 0.3 });
      for (const e of [d.wr - m, d.wr + m]) {
        if (e > lo && e < hi) s.stroke([[xOf(c, e), cy - 6], [xOf(c, e), cy + 6]], { color, width: 1.6 });
      }
      s.wobblyLine([[xOf(c, d.wr) - 3, cy], [xOf(c, d.wr) + 3, cy]], { color, width: 11, wobble: 0.2 });
      s.note(colX0 + c * colW, cy + 14, `${fmtPct(d.wr)} WR · ${fmtPct(d.pick)} pick · ${fmtK(d.n)} g`,
        { size: 13, color: d.n < 100 ? 'Slate' : 'Parchment' });
    });
  });

  // Rare keystones: listed with their game counts so nobody reads the 100%s as real.
  const rare = Object.keys(main.ks).filter((name) => !rows.some((k) => k.name === name))
    .sort((a, b) => main.ks[b].n - main.ks[a].n);
  s.note(0, rareTop, `Rarely picked (${stats.region} ${main.label}). Too few games to say anything:`, { size: 15, color: 'Slate' });
  s.note(0, rareTop + 26, rare.map((name) => `${name} ${fmtPct(main.ks[name].wr)} (${main.ks[name].n} g)`).join('\n'),
    { size: 14, color: 'Slate' });

  // Circle Stormraider's Surge in the highest bucket: the headline, and the shakiest number.
  const ssY = top + rows.findIndex((k) => k.name === SS) * rowH + 18;
  s.loop(xOf(samples.length - 1, chal.ks[SS].wr), ssY, 38, 22, { color: 'Red chalk', width: 2.5 });

  const gaps = samples.map((sm) => ({ sm, g: gap(sm, SS, LT) }));
  const thin = rows.filter((k) => k.name !== LT && k.name !== SS)
    .filter((k) => samples.slice(1).every((sm) => (sm.ks[k.name]?.n ?? 0) < 300))
    .map((k) => k.name);
  const lines = [
    `• Lethal Tempo's share falls as rank rises: ${samples.map((sm) => fmtPct(sm.ks[LT].pick)).join(' → ')} (All ranks to Challenger).`,
    `• Stormraider's Surge rises: ${samples.map((sm) => fmtPct(sm.ks[SS].pick)).join(' → ')}.`,
    `• Stormraider minus Tempo win rate: ${gaps.map(({ sm, g }) => `${sm.label} ${fmtPp(g.d)} pp (${g.z.toFixed(1)}×)`).join(', ')}. Beyond about 2× is outside the noise.`,
    `• Challenger is ${fmtInt(chal.matches)} games, likely from a handful of players, so one-tricks can swing it.`,
  ];
  if (thin.length) lines.push(`• ${thin.join(', ')}: under 300 games in every high bucket. Too few to rank.`);
  if (view.pooled) {
    lines.push(
      '• Pooling adds up games across patches, but the same players repeat, and the game changed between patches.',
      `• Patch to patch, Stormraider's share went ${patches.map((p) => fmtPct(p.samples[0].ks[SS].pick)).join(' → ')} at All ranks and ${patches.map((p) => fmtPct(p.samples[p.samples.length - 1].ks[SS].pick)).join(' → ')} at Challenger.`,
    );
  }
  s.note(colX, notesTop, `What it says · ${view.label}`, { size: 24, color: 'Sepia' });
  s.note(colX, notesTop + 36, lines.join('\n'), { size: 15, maxChars: 48 });
}

const page = s.page({
  title: `${data.champion} ${data.role}: keystones (u.gg)`,
  source: { stats: stats.source, wiki: data.wiki.source, icons: `${data.icons.source} ${data.icons.version}`, pulledAt: data.pulledAt },
  tabs: views.map((v) => ({ id: v.id, label: v.label })),
  activeTab: views[patches.length - 1].id,
});
await writeFile(`${ROOT}library/kogmaw-adc-keystones-ugg.json`, JSON.stringify(page, null, 1) + '\n');
console.log(`wrote ${page.page.items.length} items, tabs: ${page.page.tabs.map((t) => t.label).join(', ')}`);
