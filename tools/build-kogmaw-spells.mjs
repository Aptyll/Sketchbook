// Builds the "Kog'Maw ADC: summoner spells" library page from data/kogmaw-adc-spells.json.
// Re-run after refreshing the numbers: node tools/build-kogmaw-spells.mjs
//
// It is also a worked example of an agent-made page: plain notes, ink strokes
// and images in the documented page format (docs/AGENTS.md).

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sketch } from './sketch.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const data = JSON.parse(await readFile(`${ROOT}data/kogmaw-adc-spells.json`, 'utf8'));
const s = sketch({ seed: 16 });
const { stats } = data;

const fmtWpa = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}`;
const fmtInt = (n) => n.toLocaleString('en-US');
// 95% margin for a win rate from n games, in percentage points (binomial only).
const margin = (n) => 1.96 * Math.sqrt(0.25 / n) * 100;

// ---- Title ----
s.note(0, 0, `${data.champion} ${data.role} · summoner spells`, { size: 38 });
s.wobblyLine([[4, 58], [560, 54]], { color: 'Red chalk', width: 2.5 });
s.note(0, 70,
  `Stats: ${stats.site}, patch ${stats.patch}, ${stats.rank}, ${fmtInt(stats.games)} games.\nSpell numbers: LoL wiki. Pulled ${data.pulledAt}.`,
  { size: 15, color: 'Sepia' });

// ---- Table ----
const top = 180;
const rowH = 92;
const axisX = 700; // WPA zero line
const perPoint = 70; // px per WPA percentage point
const listed = data.spells.filter((sp) => sp.wpa !== undefined);
const unlisted = data.spells.filter((sp) => sp.wpa === undefined);

s.note(0, top - 42, 'Spell  ·  wiki numbers', { size: 15, color: 'Slate' });
s.note(axisX - 150, top - 42, 'WPA (pp)', { size: 15, color: 'Slate' });
s.note(axisX + 175, top - 42, 'Win rate · pre-game WP · picks', { size: 15, color: 'Slate' });

// Axis with ticks from -2 to +2.
const axisBottom = top + listed.length * rowH - 20;
s.wobblyLine([[axisX, top - 12], [axisX, axisBottom]], { color: 'Parchment', width: 1.5 });
for (let t = -2; t <= 2; t++) {
  const x = axisX + t * perPoint;
  s.wobblyLine([[x, top - 16], [x, top - 8]], { color: 'Parchment', width: 1.2 });
  s.note(x - 9, axisBottom + 4, t ? `${t > 0 ? '+' : '−'}${Math.abs(t)}` : '0', { size: 12, color: 'Slate' });
}

function spellHeader(sp, y, dim = false) {
  s.image(0, y, 56, 56, data.icons.base + sp.icon);
  s.note(70, y - 4, sp.name, { size: 26, color: dim ? 'Slate' : 'Parchment' });
  s.note(70, y + 30, `${sp.cooldown}s · ${sp.wiki}`, { size: 14, color: 'Sepia', maxChars: 58 });
}

listed.forEach((sp, i) => {
  const y = top + i * rowH;
  spellHeader(sp, y);
  // WPA bar: moss for positive, red chalk for negative, a dot for zero.
  const end = axisX + sp.wpa * perPoint;
  const color = sp.wpa > 0 ? 'Moss' : sp.wpa < 0 ? 'Red chalk' : 'Parchment';
  if (Math.abs(sp.wpa) < 0.05) s.wobblyLine([[axisX - 2, y + 22], [axisX + 2, y + 22]], { color, width: 10 });
  else s.wobblyLine([[axisX, y + 22], [end, y + 22]], { color, width: 12 });
  const labelX = sp.wpa >= 0 ? Math.max(end, axisX) + 10 : end - 62;
  s.note(labelX, y + 10, fmtWpa(sp.wpa), { size: 16, color });
  s.note(axisX + 175, y + 2,
    `${sp.winRate.toFixed(1)}% · ${sp.preGameWp.toFixed(1)}% · ${sp.pickRate}% (${fmtInt(sp.picks)})\nnoise ±${margin(sp.picks).toFixed(1)} pp`,
    { size: 15, color: 'Parchment' });
});

// Spells coachless doesn't list for this filter: wiki numbers only.
const unlistedTop = axisBottom + 90;
s.note(0, unlistedTop - 44, `Not on coachless's list for ${data.champion} ${data.role} (no WPA to compare):`, { size: 15, color: 'Slate' });
unlisted.forEach((sp, i) => spellHeader(sp, unlistedTop + i * rowH, true));

// Circle the leader.
const lead = listed.reduce((a, b) => (b.wpa > a.wpa ? b : a));
const leadY = top + listed.indexOf(lead) * rowH;
s.loop(axisX + 40, leadY + 22, 120, 34, { color: 'Red chalk', width: 2.5 });

// ---- Reading notes (right column) ----
const colX = 1260;
s.note(colX, top - 44, 'How to read it', { size: 24, color: 'Sepia' });
s.note(colX, top - 8,
  'WPA = win rate − how likely those players were to win anyway (after draft). '
  + 'Positive means the pick added win chance on average.\n'
  + '"Noise" is my rough 95% margin from sample size alone. It ignores error in coachless\'s own model.',
  { size: 16, maxChars: 52 });

const flash = listed.find((sp) => sp.name === 'Flash');
const ghost = listed.find((sp) => sp.name === 'Ghost');
const gap = lead.wpa - ghost.wpa;
const gapSe = Math.hypot(margin(lead.picks), margin(ghost.picks)) / 1.96;
s.note(colX, top + 150, 'What it says', { size: 24, color: 'Sepia' });
s.note(colX, top + 186, [
  `• Flash is in ${flash.pickRate}% of games, so its WPA of ${fmtWpa(flash.wpa)} can't be measured. It's a given, not a verdict.`,
  `• The real choice is the second spell. ${lead.name} leads at ${fmtWpa(lead.wpa)} over ${fmtInt(lead.picks)} games.`,
  `• ${lead.name} vs ${ghost.name}: a ${gap.toFixed(1)} pp gap, about ${(gap / gapSe).toFixed(1)}× its standard error. A lean, not proof.`,
  '• Teleport and Exhaust have ~1.1K to 1.3K games each, so ±3 pp of noise. Too few to rank them.',
].join('\n'), { size: 16, maxChars: 52 });

s.note(colX, top + 440, 'Why Barrier might suit Kog\'Maw', { size: 24, color: 'Sepia' });
s.note(colX, top + 476, [
  '• No dash: fights are decided in short burst windows.',
  '• At lv 18 Barrier blocks 460 and is back every 180s. Heal restores 318 to you and an ally, every 240s.',
  '• Barrier ignores Grievous Wounds and works at full HP.',
  'A hypothesis from the wiki numbers, not something these stats prove.',
].join('\n'), { size: 16, maxChars: 52 });

// Arrow from the takeaways to the circled row.
s.arrow([[colX - 16, top + 168], [colX - 110, top + 120], [axisX + 340, leadY + 34]], { color: 'Red chalk', width: 2 });

s.note(colX, top + 680, 'To test next: Barrier vs Heal in my own games; check again on the next patch.', { size: 15, color: 'Moss', maxChars: 52 });

s.note(0, unlistedTop + unlisted.length * rowH + 10, [
  `Sources: ${stats.source} (${stats.filters})`,
  `${data.wiki.source}<spell> · icons: ${data.icons.source} ${data.icons.version}`,
  'Made by tools/build-kogmaw-spells.mjs from data/kogmaw-adc-spells.json.',
].join('\n'), { size: 12, color: 'Slate' });

const page = s.page({
  title: `${data.champion} ${data.role}: summoner spells`,
  source: { stats: stats.source, wiki: data.wiki.source, icons: `${data.icons.source} ${data.icons.version}`, pulledAt: data.pulledAt },
});
await writeFile(`${ROOT}library/kogmaw-adc-summoner-spells.json`, JSON.stringify(page, null, 1) + '\n');
console.log(`wrote ${page.page.items.length} items`);
