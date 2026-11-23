// Builds the "Vayne ADC: simple build" library page from data/vayne-adc-build.json.
// Re-run after refreshing the numbers: node tools/build-vayne-adc.mjs
//
// One page, six tabs: a cheat sheet first, then one tab per choice
// (runes, start and first item, items, spells) with the coachless WPA and
// u.gg numbers behind it, and a tab on what to change against enemy comps.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sketch } from './sketch.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const data = JSON.parse(await readFile(`${ROOT}data/vayne-adc-build.json`, 'utf8'));
const s = sketch({ seed: 67 });
const { ugg, coachless: cl, icons } = data;

const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
const fmtK = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(Math.round(n)));
const sign = (n, d = 2) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(d)}`;
// 95% margin for a rate from n games, in percentage points (binomial only).
const margin = (n) => 1.96 * Math.sqrt(0.25 / n) * 100;
const LOW = 500; // fewer picks than this: grey bar, "low sample"

const itemIcon = (name) => `${icons.item}${data.items[name].id}.png`;
const spellIcon = (name) => `${icons.spell}${data.spells[name].icon}`;
const runeIcon = (name) => `${icons.rune}${data.runes[name].icon}`;
const short = (name) => name.replace('Blade of The Ruined King', 'Ruined King').replace("Lord Dominik's Regards", "Lord Dominik's")
  .replace('Jak\'Sho, The Protean', 'Jak\'Sho').replace('Experimental Hexplate', 'Hexplate');

const SAMPLE_LABEL = Object.fromEntries(Object.entries(data.samples).filter(([, v]) => v.label).map(([k, v]) => [k, v.label]));

// ---- Shared title ----
s.tab(null);
s.image(0, 0, 64, 64, `${icons.champion}Vayne.png`);
s.note(80, -4, 'Vayne ADC · the simple build', { size: 38 });
s.wobblyLine([[84, 56], [640, 52]], { color: 'Red chalk', width: 2.5 });
s.note(80, 66, [
  `Patch ${data.patch.riot} (u.gg calls it ${data.patch.ugg}). Pulled ${data.pulledAt}.`,
  `coachless WPA: NA Diamond+ ${fmtInt(data.samples.naD.games)} games, all regions Diamond+ ${fmtInt(data.samples.wD.games)}.`,
  `u.gg NA: All ${fmtK(ugg.ranks.all.games)}, Diamond+ ${fmtInt(ugg.ranks.dplus.games)}, Master+ ${ugg.ranks.mplus.games}, Challenger ${ugg.ranks.chall.games} games.`,
].join('\n'), { size: 14, color: 'Sepia' });

const TOP = 190; // where tab content starts

// Sources, drawn at the bottom of each tab (tabs end at different heights).
function footer(y) {
  s.note(0, y, [
    'Sources: coachless.gg runes/tree, items and spells for Vayne ADC,',
    'patch 16.22, Filters as labelled · u.gg NA build page, runes table',
    'and stats2.u.gg JSON (16_22, ranked solo) · LoL wiki Vayne ·',
    'Data Dragon 16.22.1 icons and item stats.',
    'Made by tools/build-vayne-adc.mjs from data/vayne-adc-build.json.',
  ].join('\n'), { size: 12, color: 'Slate' });
}

// ---- Helpers ----
function heading(x, y, text, sub) {
  s.note(x, y, text, { size: 26, color: 'Sepia' });
  if (sub) s.note(x, y + 36, sub, { size: 14, color: 'Slate' });
}

function bullets(x, y, lines, { size = 15, color, maxChars = 50, columns = 1 } = {}) {
  const per = Math.ceil(lines.length / columns);
  for (let c = 0; c < columns; c++) {
    const part = lines.slice(c * per, (c + 1) * per);
    s.note(x + c * 520, y, part.map((l) => `• ${l}`).join('\n'), { size, color, maxChars });
  }
}

// One row with a WPA bar per sample. vals: { sampleId: [wpa, picks] }.
const PER_POINT = 20;
const CLAMP = 5.5;
function wpaColumns(x, y, samples) {
  samples.forEach((sm, i) => {
    const zx = x + i * 300 + 140;
    s.note(zx - 120, y, SAMPLE_LABEL[sm], { size: 15, color: 'Parchment' });
    for (const t of [-4, -2, 0, 2, 4]) {
      s.note(zx + t * PER_POINT - 8, y + 24, t ? `${t > 0 ? '+' : '−'}${Math.abs(t)}` : '0', { size: 11, color: 'Slate' });
    }
  });
}
function wpaAxis(x, yTop, yBottom, samples) {
  samples.forEach((sm, i) => {
    const zx = x + i * 300 + 140;
    s.wobblyLine([[zx, yTop], [zx, yBottom]], { color: 'Slate', width: 1.2 });
  });
}
function wpaRow(x, y, vals, samples) {
  samples.forEach((sm, i) => {
    const zx = x + i * 300 + 140;
    const v = vals[sm];
    if (!v) {
      s.note(zx + 8, y - 9, 'not listed', { size: 12, color: 'Slate' });
      return;
    }
    const [wpa, n] = v;
    const low = n < LOW;
    const color = low ? 'Slate' : Math.abs(wpa) < 0.1 ? 'Parchment' : wpa > 0 ? 'Moss' : 'Red chalk';
    const end = zx + Math.max(-CLAMP, Math.min(CLAMP, wpa)) * PER_POINT;
    if (Math.abs(wpa) < 0.1) s.wobblyLine([[zx - 2, y], [zx + 2, y]], { color, width: 10, wobble: 0.2 });
    else s.wobblyLine([[zx, y], [end, y]], { color, width: 10, wobble: 0.3 });
    const lx = wpa >= 0 ? Math.max(end, zx) + 8 : zx + 8;
    s.note(lx, y - 10, `${sign(wpa)} · ${fmtK(n)}${low ? ' low' : ''}`, { size: 12, color: low ? 'Slate' : 'Parchment' });
  });
}
function optionLabel(x, y, name, icon, sub) {
  s.image(x, y - 22, 44, 44, icon);
  s.note(x + 54, y - 22, short(name), { size: 18 });
  if (sub) s.note(x + 54, y + 2, sub, { size: 12, color: 'Sepia' });
}
// A full WPA table: rows [{ name, icon, sub, vals }].
function wpaTable(x, y, rows, samples, { rowH = 62, labelW = 300 } = {}) {
  wpaColumns(x + labelW, y, samples);
  const first = y + 70;
  wpaAxis(x + labelW, first - 26, first + (rows.length - 1) * rowH + 26, samples);
  rows.forEach((r, i) => {
    const ry = first + i * rowH;
    optionLabel(x, ry, r.name, r.icon, r.sub);
    wpaRow(x + labelW, ry, r.vals, samples);
  });
  return first + rows.length * rowH;
}

// =====================================================================
// Tab 1: cheat sheet
// =====================================================================
s.tab('sheet');
heading(0, TOP, 'My pick for NA Diamond+ and up');

const chain = (x, y, entries) => {
  // entries: [label, icon][]; draws icons in a row with small labels.
  entries.forEach(([label, icon], i) => {
    const ex = x + i * 92;
    s.image(ex, y, 52, 52, icon);
    s.note(ex - 4, y + 58, label, { size: 12, color: 'Parchment', maxChars: 12 });
    if (i < entries.length - 1) s.arrow([[ex + 58, y + 26], [ex + 86, y + 26]], { color: 'Slate', width: 1.5 });
  });
};

let y = TOP + 60;
s.note(0, y, 'Runes', { size: 20, color: 'Sepia' });
chain(130, y - 6, [
  ['Lethal Tempo', runeIcon('Lethal Tempo')],
  ['Triumph', runeIcon('Triumph')],
  ['Bloodline', runeIcon('Legend: Bloodline')],
  ['Cut Down', runeIcon('Cut Down')],
  ['Resolve or Inspiration', runeIcon('Inspiration')],
]);
y += 108;
s.note(0, y, 'Spells', { size: 20, color: 'Sepia' });
chain(130, y - 6, [['Flash', spellIcon('Flash')], ['Barrier', spellIcon('Barrier')]]);
y += 108;
s.note(0, y, 'Start', { size: 20, color: 'Sepia' });
chain(130, y - 6, [["Doran's Blade", itemIcon("Doran's Blade")]]);
y += 108;
s.note(0, y, 'On-hit', { size: 20, color: 'Sepia' });
chain(130, y - 6, [
  ['Kraken Slayer', itemIcon('Kraken Slayer')],
  ["Berserker's", itemIcon("Berserker's Greaves")],
  ['Rageblade', itemIcon("Guinsoo's Rageblade")],
  ['Terminus', itemIcon('Terminus')],
  ["Lord Dominik's", itemIcon("Lord Dominik's Regards")],
]);
y += 108;
s.note(0, y, 'or crit', { size: 20, color: 'Sepia' });
chain(130, y - 6, [
  ['Essence Reaver', itemIcon('Essence Reaver')],
  ["Berserker's", itemIcon("Berserker's Greaves")],
  ['Stormrazor', itemIcon('Stormrazor')],
  ['Infinity Edge', itemIcon('Infinity Edge')],
  ["Lord Dominik's", itemIcon("Lord Dominik's Regards")],
]);
y += 108;
s.note(0, y, 'Never Ruined King first.', { size: 22, color: 'Red chalk' });
s.note(0, y + 46, 'It is the most bought first item and the worst one\nin all three coachless samples (tab 3).', { size: 14, color: 'Parchment' });
s.loop(110, y + 14, 140, 20, { color: 'Red chalk', width: 2 });

// Right column: swaps by enemy comp.
const RX = 700;
heading(RX, TOP, 'Swap by enemy comp', 'Details and numbers on tab 6.');
const swaps = [
  ['Assassins / dive', [spellIcon('Exhaust'), itemIcon('Plated Steelcaps'), itemIcon('Guardian Angel')],
    'Exhaust over Barrier, Steelcaps vs AD,\nGuardian Angel 3rd. Hold Condemn for the diver.'],
  ['Tanks', [runeIcon('Cut Down'), itemIcon("Lord Dominik's Regards"), itemIcon('Terminus')],
    'Your W already burns max HP. Keep Cut Down,\nrush Terminus or Lord Dominik\'s 3rd.'],
  ['Poke lane', [itemIcon("Doran's Blade"), runeIcon('Resolve'), itemIcon('Bloodthirster')],
    'Blade start, Resolve second, farm to 2 items.\nBloodthirster late for sustain.'],
  ['AP + lots of CC', [itemIcon("Mercury's Treads"), itemIcon("Wit's End"), itemIcon('Mercurial Scimitar')],
    "Mercury's Treads, then Wit's End or\nMercurial if one CC spell kills you."],
];
swaps.forEach(([label, icns, text], i) => {
  const sy = TOP + 90 + i * 120;
  s.note(RX, sy, label, { size: 20 });
  icns.forEach((src, k) => s.image(RX + k * 52, sy + 32, 44, 44, src));
  s.note(RX + 170, sy + 34, text, { size: 14, color: 'Parchment' });
});

s.note(RX, TOP + 590, 'How sure am I?', { size: 20, color: 'Sepia' });
bullets(RX, TOP + 622, [
  'Lethal Tempo, Flash + Barrier: what 3 of 4 players run, and nothing beats them clearly. Safe.',
  'Doran\'s Blade, Cut Down, Bloodline, no Ruined King first: the same lean in every big sample. Leans, not proof.',
  'Comp swaps: reasoning from Vayne\'s kit plus item WPA in all games. coachless\'s "vs champion" filter is paid.',
], { size: 14, maxChars: 62 });

footer(TOP + 760);

// =====================================================================
// Tab 2: runes
// =====================================================================
s.tab('runes');
heading(0, TOP, 'Keystone', 'coachless WPA in percentage points · picks. Grey = under 500 picks.');
const ksRows = ['Lethal Tempo', 'Press the Attack', 'Fleet Footwork'].map((k) => ({
  name: k, icon: runeIcon(k), sub: data.runes[k].text.replace(/(.{38}\S*) /, '$1\n'), vals: cl.keystones[k],
}));
let end = wpaTable(0, TOP + 70, ksRows, ['naD', 'wD'], { rowH: 74 });

// u.gg pick and win rate per rank.
const UX = 960;
s.note(UX, TOP + 70, 'u.gg NA · pick rate · win rate', { size: 15 });
const rankKeys = ['all', 'dplus', 'mplus', 'chall'];
rankKeys.forEach((rk, i) => s.note(UX + 10 + i * 120, TOP + 96, ugg.ranks[rk].label, { size: 12, color: 'Slate' }));
['Lethal Tempo', 'Press the Attack', 'Fleet Footwork'].forEach((k, r) => {
  const ry = TOP + 140 + r * 74;
  rankKeys.forEach((rk, i) => {
    const [wr, pick] = ugg.keystones[k][rk];
    const games = (pick / 100) * ugg.ranks[rk].games;
    const low = games < LOW;
    s.note(UX + 10 + i * 120, ry - 18, `${pick.toFixed(0)}%\n${wr.toFixed(1)}%`, { size: 14, color: low ? 'Slate' : 'Parchment' });
  });
});
s.note(UX, TOP + 330, `Win-rate noise at Diamond+ for Lethal Tempo (${fmtInt(0.782 * ugg.ranks.dplus.games)} games):\n±${margin(0.782 * ugg.ranks.dplus.games).toFixed(1)} pp. Press the Attack: ±${margin(0.168 * ugg.ranks.dplus.games).toFixed(1)} pp.`, { size: 13, color: 'Slate' });

y = end + 30;
heading(0, y, 'Precision rows', 'The two choices that actually move: row 3 and row 4.');
const rowRows = ['Legend: Bloodline', 'Legend: Alacrity', 'Cut Down', 'Coup de Grace'].map((k) => ({
  name: k.replace('Legend: ', ''), icon: runeIcon(k), vals: cl.precisionRows[k],
}));
end = wpaTable(0, y + 70, rowRows, ['naD', 'wD'], { rowH: 62 });

heading(UX, y, 'Second tree', 'Share of games (u.gg NA) · win rate');
['Resolve', 'Inspiration', 'Domination', 'Sorcery'].forEach((t, r) => {
  const ry = y + 110 + r * 62;
  s.image(UX, ry - 18, 36, 36, runeIcon(t));
  s.note(UX + 46, ry - 14, t, { size: 16 });
  ['dplus', 'mplus', 'chall'].forEach((rk, i) => {
    const [share, wr] = ugg.secondary[t][rk];
    s.note(UX + 170 + i * 110, ry - 18, `${share.toFixed(0)}%\n${wr.toFixed(1)}%`, { size: 13, color: share * ugg.ranks[rk].games / 100 < LOW / 2 ? 'Slate' : 'Parchment' });
  });
});
['Diamond+', 'Master+', 'Challenger'].forEach((l, i) => s.note(UX + 170 + i * 110, y + 66, l, { size: 12, color: 'Slate' }));

y = end + 30;
heading(0, y, 'What it says');
const sr = cl.secondaryRunes;
bullets(0, y + 40, [
  `Lethal Tempo is the keystone: ${ugg.keystones['Lethal Tempo'].dplus[1].toFixed(0)}% of NA Diamond+ games and level with or above the rest in every big sample.`,
  `Press the Attack's ${sign(cl.keystones['Press the Attack'].naD[0])} in NA Diamond+ is ${cl.keystones['Press the Attack'].naD[1]} games. All regions it is ${sign(cl.keystones['Press the Attack'].wD[0])} over ${fmtK(cl.keystones['Press the Attack'].wD[1])}. Not a switch.`,
  `Cut Down beats Coup de Grace and Bloodline beats Alacrity in all four coachless samples I pulled (NA and all regions, Emerald+ and Diamond+).`,
  `Inspiration second: u.gg Diamond+ ${ugg.secondary.Inspiration.dplus[1]}% win rate on ~${Math.round(ugg.secondary.Inspiration.dplus[0] * ugg.ranks.dplus.games / 100)} games, and Triple Tonic ${sign(sr['Triple Tonic'][0])} (${fmtK(sr['Triple Tonic'][1])}), Cash Back ${sign(sr['Cash Back'][0])} on coachless. A lean to try in safe lanes. Resolve (Overgrowth ${sign(sr.Overgrowth[0])}) stays the default into poke and dive.`,
], { size: 15, maxChars: 50, columns: 2 });

footer(y + 330);

// =====================================================================
// Tab 3: start and first item
// =====================================================================
s.tab('start');
heading(0, TOP, 'Starter', 'coachless WPA · buys. NA Diamond+ lists only Bow, so NA Emerald+ here.');
end = wpaTable(0, TOP + 70, ["Doran's Blade", "Doran's Bow"].map((k) => ({
  name: k, icon: itemIcon(k), sub: `${data.items[k].cost}g · ${data.items[k].text}`, vals: cl.starters[k],
})), ['naE', 'wD'], { rowH: 74 });
s.note(960, TOP + 70, 'u.gg NA starter pick', { size: 15 });
rankKeys.forEach((rk, i) => {
  const [label, g, w] = ugg.bestStarter[rk];
  s.note(960, TOP + 100 + i * 42, `${ugg.ranks[rk].label}: ${label.replace(" + potion", '').replace(' + 2 potions', '')}\n${fmtInt(g)} games, ${(100 * w / g).toFixed(1)}% win`, { size: 13, color: 'Parchment' });
});

y = end + 30;
heading(0, y, 'First legendary', 'coachless, slot "1st" only. Share = % of first items.');
const firsts = ['Kraken Slayer', 'Essence Reaver', 'Stormrazor', 'Yun Tal Wildarrows', 'Blade of The Ruined King'];
end = wpaTable(0, y + 70, firsts.map((k) => ({
  name: k, icon: itemIcon(k),
  sub: `${cl.firstItem.wD[k] ? cl.firstItem.wD[k][2].toFixed(0) + '% of first items (all regions D+)' : 'rare first'}`,
  vals: { naD: cl.firstItem.naD[k], wD: cl.firstItem.wD[k] },
})), ['naD', 'wD'], { rowH: 64 });

heading(960, y, 'What it says');
const fb = cl.firstItem;
bullets(960, y + 40, [
  `Doran's Blade over Bow: ${sign(cl.starters["Doran's Blade"].wD[0])} vs ${sign(cl.starters["Doran's Bow"].wD[0])} all regions Diamond+, and u.gg's pick from Diamond+ up. The 80 HP matters with only 550 range.`,
  `Ruined King first is a third of first items and below zero everywhere: ${sign(fb.naD['Blade of The Ruined King'][0])} NA, ${sign(fb.wD['Blade of The Ruined King'][0])} all regions.`,
  `Kraken Slayer is the safe first item (above zero in all three samples).`,
  `Essence Reaver leads all regions (${sign(fb.wD['Essence Reaver'][0])}) but is flat in NA. Take it if you go crit.`,
  `Yun Tal's ${sign(fb.naD['Yun Tal Wildarrows'][0])} is ${fb.naD['Yun Tal Wildarrows'][1]} games. Ignore it for now.`,
], { size: 15, maxChars: 48 });

footer(end + 40);

// =====================================================================
// Tab 4: items and boots
// =====================================================================
s.tab('items');
heading(0, TOP, 'Legendaries, any slot', 'coachless WPA · buys. Items under ~1% of buys are hidden.');
const legs = ["Lord Dominik's Regards", 'Essence Reaver', 'Stormrazor', 'Fiendhunter Bolts', 'Terminus', 'Kraken Slayer',
  "Guinsoo's Rageblade", 'Infinity Edge', "Wit's End", 'Blade of The Ruined King'];
end = wpaTable(0, TOP + 70, legs.map((k) => ({ name: k, icon: itemIcon(k), vals: { naD: cl.legendaries.naD[k], wD: cl.legendaries.wD[k] } })),
  ['naD', 'wD'], { rowH: 58 });

heading(960, TOP, 'Boots', 'coachless WPA · buys');
const boots = ["Berserker's Greaves", 'Gluttonous Greaves', 'Plated Steelcaps', "Mercury's Treads"];
s.note(960, TOP + 70, 'All regions D+ · Emerald+', { size: 15 });
boots.forEach((b, i) => {
  const by = TOP + 130 + i * 64;
  s.image(960, by - 22, 44, 44, itemIcon(b));
  s.note(1014, by - 22, short(b), { size: 17 });
  const w1 = cl.boots.wD[b];
  const w2 = cl.boots.wE[b];
  s.note(1014, by + 2, `${w1 ? `${sign(w1[0])} (${fmtK(w1[1])})` : 'not listed'} · ${w2 ? `${sign(w2[0])} (${fmtK(w2[1])})` : 'not listed'}`, { size: 13, color: 'Parchment' });
});

heading(960, TOP + 420, 'u.gg build split, NA Diamond+');
const vs = ugg.variants;
['onhit', 'crit', 'ad'].forEach((k, i) => {
  const [g] = vs[k].dplus;
  s.note(960, TOP + 470 + i * 56, `${vs[k].label}: ${fmtInt(g)} finished games\n${vs[k].core}`, { size: 13, color: 'Parchment', maxChars: 62 });
});
s.note(960, TOP + 650, 'Finished-build win rates favour late builds, so I only use the split.', { size: 12, color: 'Slate', maxChars: 60 });

y = end + 30;
heading(0, y, 'What it says');
const L = cl.legendaries.wD;
bullets(0, y + 40, [
  `No item stands out by much. The spread from best to worst big item is about 2.5 pp, so buy for the game in front of you.`,
  `Lord Dominik's (${sign(L["Lord Dominik's Regards"][0])}) and Terminus (${sign(L.Terminus[0])}) lead all regions as late picks (armor pen for the damage that is not W). NA Diamond+ disagrees on Terminus (${sign(cl.legendaries.naD.Terminus[0])} on ${cl.legendaries.naD.Terminus[1]}).`,
  `Ruined King is below zero in any slot too (${sign(L['Blade of The Ruined King'][0])}). Skip it unless you have a reason.`,
  `Boots: Berserker's is ~85% of buys and flat. The defensive boots that people buy for a reason sit higher (+1.2 to +2.0), which is the point of tab 6.`,
], { size: 15, maxChars: 50, columns: 2 });

footer(y + 330);

// =====================================================================
// Tab 5: summoner spells
// =====================================================================
s.tab('spells');
heading(0, TOP, 'Second spell', 'coachless WPA · picks. Flash is in ~100% of games, so its WPA means nothing.');
end = wpaTable(0, TOP + 70, ['Barrier', 'Exhaust', 'Ghost', 'Cleanse', 'Flash'].map((k) => ({
  name: k, icon: spellIcon(k), sub: data.spells[k].text, vals: { naD: cl.spells[k].naD, wD: cl.spells[k].wD },
})), ['naD', 'wD'], { rowH: 70 });

heading(960, TOP, 'What it says');
const sp = cl.spells;
bullets(960, TOP + 40, [
  `Flash + Barrier is the default: ${(100 * sp.Barrier.wD[1] / data.samples.wD.games).toFixed(0)}% of Diamond+ games, and the only second spell NA Diamond+ lists (${sign(sp.Barrier.naD[0])}).`,
  `Exhaust is the one that leans up all regions (${sign(sp.Exhaust.wD[0])} on ${fmtK(sp.Exhaust.wD[1])}). People take it into assassins and divers, so read it as "Exhaust works there", not "always Exhaust".`,
  `Cleanse is below zero (${sign(sp.Cleanse.wD[0])}). Into heavy CC, Mercury's or Mercurial do the job without giving up Barrier.`,
  `u.gg Challenger's top pair is Cleanse + Flash on 12 games. That is noise.`,
], { size: 15, maxChars: 48 });

footer(end + 40);

// =====================================================================
// Tab 6: vs enemy comps
// =====================================================================
s.tab('comps');
heading(0, TOP, 'What Vayne brings', 'LoL wiki, abilities as of V26.20');
const V = data.vayne;
s.note(0, TOP + 70, [`Range ${V.range}: short for an ADC.`, `Q  ${V.q}`, `W  ${V.w}`, `E  ${V.e}`, `R  ${V.r}`].join('\n'), { size: 14, color: 'Parchment', maxChars: 60 });

const comps = [
  {
    title: 'Assassins / dive', color: 'Red chalk',
    why: 'They reach you before your 550 range matters. You live by Tumble + R stealth and a Condemn on the diver.',
    picks: [
      ['Exhaust', spellIcon('Exhaust'), `${sign(sp.Exhaust.wD[0])} (${fmtK(sp.Exhaust.wD[1])}) all regions D+`],
      ['Plated Steelcaps', itemIcon('Plated Steelcaps'), `${sign(cl.boots.wE['Plated Steelcaps'][0])} (${fmtK(cl.boots.wE['Plated Steelcaps'][1])}) all regions E+`],
      ['Guardian Angel 3rd', itemIcon('Guardian Angel'), `${sign(cl.legendaries.wE['Guardian Angel'][0])} (${fmtK(cl.legendaries.wE['Guardian Angel'][1])}): flat, but it buys a second fight`],
    ],
  },
  {
    title: 'Tanks / frontline', color: 'Moss',
    why: 'Your best matchup. W true damage scales with their max HP, so more hits = more melted tanks.',
    picks: [
      ['Cut Down', runeIcon('Cut Down'), `${sign(cl.precisionRows['Cut Down'].wD[0])} (${fmtK(cl.precisionRows['Cut Down'].wD[1])}) all regions D+`],
      ["Lord Dominik's", itemIcon("Lord Dominik's Regards"), `${sign(L["Lord Dominik's Regards"][0])} (${fmtK(L["Lord Dominik's Regards"][1])}) all regions D+`],
      ['Terminus', itemIcon('Terminus'), `${sign(L.Terminus[0])} (${fmtK(L.Terminus[1])}): pen in long fights`],
    ],
  },
  {
    title: 'Poke / ranged lanes', color: 'Slate',
    why: 'Caitlyn, Miss Fortune and bot-lane mages are your worst lanes on u.gg (40% to 41% on 56 to 74 games; mages are tinier samples). Survive to 2 items.',
    picks: [
      ["Doran's Blade", itemIcon("Doran's Blade"), `${sign(cl.starters["Doran's Blade"].wD[0])} (${fmtK(cl.starters["Doran's Blade"].wD[1])}): the HP start`],
      ['Resolve second', runeIcon('Resolve'), `Second Wind ${sign(sr['Second Wind'][0])} on only ${sr['Second Wind'][1]} games`],
      ['Bloodthirster', itemIcon('Bloodthirster'), `${sign(cl.legendaries.wE.Bloodthirster[0])} (${fmtK(cl.legendaries.wE.Bloodthirster[1])}) all regions E+`],
    ],
  },
  {
    title: 'AP / heavy CC', color: 'Sepia',
    why: 'One root or stun and you cannot Tumble. Tenacity and a cleanse item beat the Cleanse spell here.',
    picks: [
      ["Mercury's Treads", itemIcon("Mercury's Treads"), `${sign(cl.boots.wE["Mercury's Treads"][0])} (${fmtK(cl.boots.wE["Mercury's Treads"][1])}) all regions E+`],
      ["Wit's End", itemIcon("Wit's End"), `${sign(L["Wit's End"][0])} (${fmtK(L["Wit's End"][1])}) all regions D+`],
      ['Mercurial Scimitar', itemIcon('Mercurial Scimitar'), `${sign(cl.legendaries.wE['Mercurial Scimitar'][0])} (${fmtK(cl.legendaries.wE['Mercurial Scimitar'][1])}) all regions E+`],
    ],
  },
];
comps.forEach((c, i) => {
  const cx = (i % 2) * 720;
  const cy = TOP + 260 + Math.floor(i / 2) * 330;
  s.note(cx, cy, c.title, { size: 26, color: c.color });
  s.wobblyLine([[cx, cy + 38], [cx + 300, cy + 36]], { color: c.color, width: 2 });
  s.note(cx, cy + 50, c.why, { size: 14, color: 'Parchment', maxChars: 58 });
  c.picks.forEach(([name, icon, num], k) => {
    const py = cy + 120 + k * 62;
    s.image(cx, py, 44, 44, icon);
    s.note(cx + 56, py - 2, name, { size: 18 });
    s.note(cx + 56, py + 24, num, { size: 13, color: 'Sepia' });
  });
});
s.note(0, TOP + 940, 'The numbers are each pick in all games (coachless\'s "vs champion" filter is paid),\nso they show the pick is fine, not that it wins that matchup.\nThe comp logic comes from the kit.', { size: 13, color: 'Slate' });

footer(TOP + 1040);

const tabs = [
  { id: 'sheet', label: '1 · Cheat sheet' },
  { id: 'runes', label: '2 · Runes' },
  { id: 'start', label: '3 · Start + first item' },
  { id: 'items', label: '4 · Items + boots' },
  { id: 'spells', label: '5 · Spells' },
  { id: 'comps', label: '6 · vs enemy comps' },
];
const page = s.page({
  title: 'Vayne ADC: the simple build',
  source: {
    stats: 'https://coachless.gg/items/vayne/legendaries?role=adc ; https://u.gg/lol/champions/vayne/build/adc',
    wiki: data.vayne.source,
    icons: `Riot Data Dragon ${icons.version}`,
    pulledAt: data.pulledAt,
  },
  tabs,
});
await writeFile(`${ROOT}library/vayne-adc-build.json`, JSON.stringify(page, null, 1) + '\n');
console.log(`wrote ${page.page.items.length} items`);
