// Builds the "Kog'Maw ADC: runes for aggression" library page from
// data/kogmaw-adc-runes-aggro.json and the fight model in tools/kogmaw-rune-model.mjs.
// Re-run after a patch: update the JSON, then node tools/build-kogmaw-runes-aggro.mjs
//
// The question is not "what wins most" but "what lets Kog'Maw pressure from level 1,
// win mid-game skirmishes, and reward good play the most". Win rates sit in the last
// tab as context only.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sketch } from './sketch.mjs';
import { runAll, kogAt, kite, KEYSTONES, lerp } from './kogmaw-rune-model.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const data = JSON.parse(await readFile(`${ROOT}data/kogmaw-adc-runes-aggro.json`, 'utf8'));
const s = sketch({ seed: 2611 });
const R = data.runes;
const icon = (name) => `${data.icons.base}${R[name].icon}`;
const shardIcon = (p) => `${data.icons.base}${p}`;
const pct = (n, d = 0) => `${n > 0.05 ? '+' : ''}${n.toFixed(d)}%`;
const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
const margin = (n) => 1.96 * Math.sqrt(0.25 / n) * 100;
const short = (k) => ({ "Stormraider's Surge": 'Stormraider\'s', 'Press the Attack': 'Press the Attack', 'Deathfire Touch': 'Deathfire' }[k] ?? k);

// ---- Run the model ----
const runs = Object.fromEntries(runAll(data).map((r) => [r.id, r]));
const ranks11 = { q: 3, w: 5, e: 1, r: 2 };
const bruiser = { hp: 2400, armor: 100, mr: 60 };
const openers = [{ t: 0, spell: 'q' }, { t: 0.3, spell: 'e' }];
const kiteCases = [
  { id: 'onFree', build: 'onhit', slow: 0, label: 'On-hit, open chase' },
  { id: 'onSlow', build: 'onhit', slow: 0.3, label: 'On-hit, slowed 30%' },
  { id: 'apFree', build: 'ap', slow: 0, label: 'AP, open chase' },
  { id: 'apSlow', build: 'ap', slow: 0.3, label: 'AP, slowed 30%' },
];
const kites = Object.fromEntries(kiteCases.map((c) => {
  const kog = kogAt(data, 11, { ranks: ranks11, build: data.builds[c.build] });
  const opts = { diverMs: 390, slow: c.slow, casts: openers };
  const base = kite(data, kog, bruiser, null, opts);
  const rows = Object.fromEntries(KEYSTONES.map((k) => {
    const r = kite(data, kog, bruiser, k, opts);
    return [k, { ...r, gain: (r.damage / base.damage - 1) * 100 }];
  }));
  return [c.id, { ...c, kog, base, rows }];
}));

// ---- Scores ----
const ceiling = {
  "Stormraider's Surge": [5, 'You choose the 3 s burst that fires it, then spend 4 s of speed: chase, dodge or re-space.'],
  'First Strike': [5, 'Only pays if you land the first hit. Rewards using W\'s range edge. Gold snowballs.'],
  'Press the Attack': [4, 'Short 6 s cooldown: many small 2v2 trades, each one a timing test.'],
  Electrocute: [3, 'Three hits in 3 s, then 20 s down. One good trade per wave.'],
  'Arcane Comet': [3, 'Up to double damage when Q or R lands from max range.'],
  'Lethal Tempo': [2, 'Pays in long, even fights. Mostly automatic once you are attacking.'],
  'Dark Harvest': [2, 'One hit on a low target every 35 s.'],
  'Deathfire Touch': [2, 'A burn on Q, E and R. Kog\'s damage is in his autos, not his spells.'],
  Conqueror: [1, 'Ranged gets 1 stack per attack: 12 attacks to fill.'],
  'Fleet Footwork': [1, 'A small heal. No damage since its rework.'],
  'Hail of Blades': [1, 'Two fast attacks, then 10 s down. Kog has no attack reset to extend it.'],
};
const laneScore = (k) => (runs.l1.rows[k].pct + runs.l3.rows[k].pct) / 2;
const midScore = (k) => (kites.onSlow.rows[k].gain + kites.apSlow.rows[k].gain) / 2;
const freeScore = (k) => (kites.onFree.rows[k].gain + kites.apFree.rows[k].gain) / 2;

// ---- Header (all tabs) ----
s.tab(null);
s.note(0, 0, "Kog'Maw ADC · runes for aggression", { size: 40 });
s.wobblyLine([[4, 60], [700, 55]], { color: 'Red chalk', width: 2.5 });
s.note(0, 72, [
  'Goal: pressure from level 1, win the mid-game, highest skill ceiling.',
  `Judged from LoL wiki numbers (patch ${data.wiki.patch.split(' ')[0]}) run through a small`,
  'fight model, not from win rates. Win rates: tab 5 only (u.gg NA, 26.21).',
  `Pulled ${data.pulledAt}.`,
].join('\n'), { size: 15, color: 'Sepia' });

const tabs = [
  { id: 'score', label: '1 · Scorecard' },
  { id: 'lane', label: '2 · Levels 1 to 6' },
  { id: 'mid', label: '3 · Mid-game kiting' },
  { id: 'pages', label: '4 · Rune pages' },
  { id: 'context', label: '5 · What NA plays (context)' },
];

// =====================================================================
// Tab 1: scorecard
// =====================================================================
s.tab('score');
{
  const top = 290;
  const rowH = 64;
  const cols = [
    { x: 330, label: 'Levels 1 to 3\ndamage added', get: laneScore, fmt: (v) => pct(v), max: 25 },
    { x: 560, label: 'Level 6 all-in\ndamage added', get: (k) => runs.l6.rows[k].pct, fmt: (v) => pct(v), max: 25 },
    { x: 790, label: 'Mid-game, slowed\ndamage before caught', get: midScore, fmt: (v) => pct(v), max: 90 },
    { x: 1020, label: 'Mid-game, standing\ndamage in 8 s', get: (k) => (runs.mOn.rows[k].pct + runs.mAp.rows[k].pct) / 2, fmt: (v) => pct(v), max: 25 },
    { x: 1250, label: 'Skill ceiling\n(judgment, 1 to 5)', get: (k) => ceiling[k][0], fmt: (v) => '●'.repeat(v) + '○'.repeat(5 - v), max: 5 },
  ];
  // Goal weighting: lane, all-in and skill ceiling count once, the contested mid-game twice.
  const sc = (k) => laneScore(k) / 25 + runs.l6.rows[k].pct / 25 + (2 * midScore(k)) / 90 + ceiling[k][0] / 5;
  const order = [...KEYSTONES].sort((a, b) => sc(b) - sc(a));
  cols.forEach((c) => s.note(c.x, top - 64, c.label, { size: 14, color: 'Slate' }));
  order.forEach((k, i) => {
    const y = top + i * rowH;
    s.image(0, y, 44, 44, icon(k));
    s.note(56, y + 4, short(k), { size: 22 });
    s.note(56, y + 32, R[k].tree ?? '', { size: 11, color: 'Slate' });
    cols.forEach((c) => {
      const v = c.get(k);
      const f = Math.max(0, Math.min(1, v / c.max));
      const color = f >= 0.6 ? 'Moss' : f >= 0.3 ? 'Parchment' : 'Slate';
      if (c.max !== 5) {
        if (f > 0.01) s.wobblyLine([[c.x, y + 34], [c.x + f * 170, y + 34]], { color, width: 7, wobble: 0.3 });
        s.note(c.x, y + 2, v < 0.05 ? '0' : c.fmt(v), { size: 20, color });
      } else {
        s.note(c.x, y + 4, c.fmt(v), { size: 20, color });
        s.note(c.x + 120, y + 2, ceiling[k][1], { size: 12, color: 'Slate', maxChars: 44 });
      }
    });
  });
  // circle the winner and the lane king
  const si = order.indexOf("Stormraider's Surge");
  s.loop(150, top + si * rowH + 22, 160, 30, { color: 'Red chalk', width: 2.5 });
  const nx = 1760;
  const st = "Stormraider's Surge";
  s.note(nx, top - 64, 'Verdict', { size: 26, color: 'Sepia' });
  s.note(nx, top - 24, [
    `• Stormraider's Surge is the pick for your goal. It adds no damage, but when a diver slows you it lets you land ${pct(midScore(st))} more damage before you are caught (tab 3). Nothing else is close: the best damage rune adds ${pct(Math.max(...KEYSTONES.filter((k) => k !== st).map(midScore)))}.`,
    `• It fires from level 1: three W autos are already 25% of a level 1 ADC's HP. In lane it is a free chase or a free escape after every trade.`,
    `• Press the Attack is the lane-bully swap: ${pct(laneScore('Press the Attack'))} damage in level 1 to 3 trades, every 6 s.`,
    `• Electrocute hits hardest early (${pct(laneScore('Electrocute'))}) but falls off by mid-game and leaves Precision. Lane-only.`,
    `• Lethal Tempo is the most damage when nobody touches you (${pct((runs.mOn.rows['Lethal Tempo'].pct + runs.mAp.rows['Lethal Tempo'].pct) / 2)} over 8 s), and the least reward for early aggression: it never fills in a short trade.`,
    '• Skip Hail of Blades, Fleet and Conqueror on Kog.',
  ].join('\n'), { size: 15, maxChars: 54 });
  s.note(0, top + order.length * rowH + 10, [
    'Damage added = the same trade with the keystone vs with no keystone, against a typical enemy ADC (levels 1 to 6)',
    'or a 2,400 HP diver (mid-game, tab 3). "Standing" = 8 s of free hitting on an enemy ADC. Sorted by goal: each column once, the slowed mid-game twice.',
    'Skill ceiling is a judgment call (reason next to each). Everything else is computed.',
  ].join('\n'), { size: 12, color: 'Slate' });
}

// =====================================================================
// Tab 2: lane, levels 1 to 6
// =====================================================================
s.tab('lane');
{
  const top = 290;
  const rowH = 46;
  const sc = [runs.l1, runs.l3, runs.l6];
  const colX = [300, 600, 900];
  const barMax = 32;
  const barW = 230;
  const order = [...KEYSTONES].sort((a, b) => laneScore(b) - laneScore(a));
  sc.forEach((r, c) => {
    s.note(colX[c], top - 82, r.label, { size: 22 });
    s.note(colX[c], top - 52, `${r.sub}\nno keystone: ${fmtInt(r.base.total)} damage`, { size: 13, color: 'Slate' });
  });
  order.forEach((k, i) => {
    const y = top + i * rowH;
    s.image(0, y, 34, 34, icon(k));
    s.note(44, y + 4, short(k), { size: 18 });
    sc.forEach((r, c) => {
      const row = r.rows[k];
      const f = Math.min(1, Math.max(0, row.pct / barMax));
      const color = row.pct >= 15 ? 'Moss' : row.pct >= 5 ? 'Parchment' : 'Slate';
      if (f > 0.005) s.wobblyLine([[colX[c], y + 18], [colX[c] + f * barW, y + 18]], { color, width: 12, wobble: 0.3 });
      const label = k === "Stormraider's Surge" && r.base.stormAt !== null
        ? `speed at ${r.base.stormAt.toFixed(1)} s`
        : row.added < 0.5 ? '0' : `+${fmtInt(row.added)} (${pct(row.pct)})`;
      s.note(colX[c] + Math.max(f * barW, 0) + 10, y + 6, label, { size: 13, color: k === "Stormraider's Surge" ? 'Red chalk' : color });
    });
  });

  // Breakpoints
  const k1 = runs.l1.kog;
  const as1 = 0.665 * (1 + k1.bonusAs / 100);
  const as1n = 0.665;
  const nx = 1260;
  const storm = R["Stormraider's Surge"];
  const msGain = (ms) => ms * (storm.ms / 100) * storm.dur;
  s.note(nx, top - 82, 'Breakpoints that matter', { size: 24, color: 'Sepia' });
  s.note(nx, top - 44, [
    `• W at level 1 puts Kog at ${k1.range} range for 8 of every 17 s. That window is when you trade.`,
    `• Electrocute needs 3 hits inside 3 s. Level 1 Kog attacks every ${(1 / as1n).toFixed(2)} s, so the third auto lands at ${(2 / as1n).toFixed(2)} s: too late. The attack speed shard (${(1 / as1).toFixed(2)} s) fixes it. The same shard is what makes every 3-hit rune work at level 1.`,
    `• Press the Attack procs on the 3rd auto, then has a 6 s cooldown: one proc per trade, every trade.`,
    `• Lethal Tempo needs 6 attacks: about ${(6 / as1).toFixed(1)} s at level 1. A short trade never reaches the bonus.`,
    `• Stormraider's fires in every one of these trades. At level 1 it is +${fmtInt(msGain(330))} units of free movement over 4 s: more than Kog's whole ${k1.range - 500} unit W range bonus, three times over.`,
    `• First Strike's gold is small in lane (~${fmtInt(runs.l3.rows['First Strike'].fsGold)} per level 3 trade). Its value is the 7% and the economy runes beside it.`,
  ].join('\n'), { size: 15, maxChars: 56 });
  s.note(0, top + order.length * rowH + 14, [
    'Model: Kog with the attack speed shard, W first, Q second, E third, W maxed; no items; target = an enemy ADC at the same level',
    `(level 1: ${fmtInt(runs.l1.enemy.hp)} HP, ${runs.l1.enemy.armor.toFixed(0)} armor). Q shreds resists when it lands. Comet assumes long-range casts (×1.5).`,
    'Not modelled: mana, misses, the enemy hitting back, minions. Values marked "a to b" on the wiki are taken as linear in level.',
  ].join('\n'), { size: 12, color: 'Slate' });
}

// =====================================================================
// Tab 3: mid-game kiting
// =====================================================================
s.tab('mid');
{
  const top = 300;
  const cx = 0;
  const cw = 640;
  const ch = 320;
  const k = kites.onSlow;
  const maxGap = k.kog.range + 20;
  const xOf = (t) => cx + 50 + (t / 8) * (cw - 60);
  const yOf = (g) => top + ch - (g / maxGap) * ch;
  s.note(cx, top - 82, 'A diver chases you: who reaches who?', { size: 24 });
  s.note(cx, top - 50, `On-hit Kog, level 11, slowed 30%, vs a 390 move speed diver (${fmtInt(bruiser.hp)} HP).\nLine = distance to the diver. Tick = an auto you land.`, { size: 13, color: 'Slate' });
  // axes
  s.wobblyLine([[cx + 50, yOf(0)], [cx + cw, yOf(0)]], { color: 'Parchment', width: 1 });
  s.wobblyLine([[cx + 50, yOf(0)], [cx + 50, yOf(maxGap)]], { color: 'Parchment', width: 1 });
  for (let t = 0; t <= 8; t += 2) s.note(xOf(t) - 6, yOf(0) + 6, `${t} s`, { size: 12, color: 'Slate' });
  for (const g of [175, 500, k.kog.range]) {
    s.wobblyLine([[cx + 50, yOf(g)], [cx + cw, yOf(g)]], { color: '#3a352c', width: 1, wobble: 0.4 });
    s.note(cx - 4, yOf(g) - 9, String(g), { size: 12, color: 'Slate' });
  }
  s.note(cx + 56, yOf(175) + 4, 'diver reaches you', { size: 12, color: 'Red chalk' });
  s.note(cx + 56, yOf(k.kog.range) - 22, 'your range with W', { size: 12, color: 'Slate' });
  const lines = [
    { key: null, label: 'no keystone', color: 'Slate', data: k.base },
    { key: 'Lethal Tempo', label: 'Lethal Tempo', color: 'Sepia', data: k.rows['Lethal Tempo'] },
    { key: "Stormraider's Surge", label: "Stormraider's", color: 'Moss', data: k.rows["Stormraider's Surge"] },
  ];
  lines.forEach((ln, li) => {
    const pts = ln.data.path.map(([t, g]) => [xOf(Math.min(8, t)), yOf(Math.max(0, g))]);
    s.wobblyLine(pts, { color: ln.color, width: 2.5, wobble: 0.3 });
    ln.data.path.filter((_, i) => i % 2 === 1).forEach(([t, g]) => {
      s.stroke([[xOf(t), yOf(g) - 6], [xOf(t), yOf(g) + 6]], { color: ln.color, width: 2 });
    });
    const last = ln.data.path[ln.data.path.length - 1];
    s.wobblyLine([[cx + 420, top + 10 + li * 24], [cx + 450, top + 10 + li * 24]], { color: ln.color, width: 3 });
    s.note(cx + 458, top + li * 24, `${ln.label}: ${ln.data.autos} autos`, { size: 14, color: ln.color });
  });
  const stormAt = k.rows["Stormraider's Surge"].stormAt;
  s.arrow([[xOf(stormAt) + 30, yOf(60)], [xOf(stormAt), yOf(160)]], { color: 'Moss', width: 2 });
  s.note(xOf(stormAt) + 34, yOf(60) - 8, `speed fires at ${stormAt.toFixed(1)} s (Q, E, 1 auto)`, { size: 12, color: 'Moss' });

  // Table: damage landed before caught, 4 cases
  const tx = 760;
  const colW = 150;
  s.note(tx, top - 82, 'Damage landed before the diver reaches you', { size: 24 });
  s.note(tx, top - 50, 'Within one 8 s W window, vs no keystone. Autos landed in brackets.', { size: 13, color: 'Slate' });
  kiteCases.forEach((c, i) => s.note(tx + 210 + i * colW, top - 14, c.label.replace(', ', ',\n'), { size: 13 }));
  const order = [...KEYSTONES].sort((a, b) => midScore(b) - midScore(a));
  order.forEach((key, r) => {
    const y = top + 30 + r * 40;
    s.image(tx, y - 4, 30, 30, icon(key));
    s.note(tx + 40, y, short(key), { size: 16 });
    kiteCases.forEach((c, i) => {
      const row = kites[c.id].rows[key];
      const color = row.gain >= 40 ? 'Moss' : row.gain >= 8 ? 'Parchment' : 'Slate';
      s.note(tx + 210 + i * colW, y, `${row.gain < 0.5 ? '0' : pct(row.gain)} (${row.autos})`, { size: 16, color });
    });
  });
  kiteCases.forEach((c, i) => s.note(tx + 210 + i * colW, top + 30 + order.length * 40, `none: ${kites[c.id].base.autos} autos`, { size: 12, color: 'Slate' }));

  const nx = 1600;
  const st = kites.onSlow.rows["Stormraider's Surge"];
  s.note(nx, top - 82, 'What it says', { size: 24, color: 'Sepia' });
  s.note(nx, top - 44, [
    `• Kog's mid-game is decided by how many W autos he lands before someone reaches him. Damage runes multiply each auto by a few %. Stormraider's adds autos.`,
    `• Slowed 30%: no keystone lands ${kites.onSlow.base.autos} autos and is caught at ${kites.onSlow.base.caughtAt.toFixed(1)} s. Stormraider's lands ${st.autos}${st.caughtAt ? ` and is caught at ${st.caughtAt.toFixed(1)} s` : ' and is never caught'}. Its 50% slow resist is half of that.`,
    `• Open chase: Stormraider's still lands ${kites.onFree.rows["Stormraider's Surge"].autos - kites.onFree.base.autos} more autos (on-hit). Lethal Tempo's extra speed only adds about one.`,
    `• It is back every ~${lerp(R["Stormraider's Surge"].cd, 11).toFixed(0)} s at level 11: every fight, often twice.`,
    '• Limits: the diver here has no dash or knock-up. A dash skips the chase and shrinks every keystone\'s value, Stormraider\'s most. Against hard engage, your flash and positioning matter more than any rune.',
  ].join('\n'), { size: 15, maxChars: 50 });
  s.note(0, top + ch + 60, [
    `Model: level 11, W rank 5, Q rank 3. On-hit = ${data.builds.onhit.items}. AP = ${data.builds.ap.items}.`,
    'Item passives left out (every keystone gets them). Kog stands still only for his attack windup, then walks back.',
    'Stormraider\'s fires once Kog has dealt 25% of the diver\'s max HP inside 3 s, from the real damage timeline.',
  ].join('\n'), { size: 12, color: 'Slate' });
}

// =====================================================================
// Tab 4: rune pages
// =====================================================================
s.tab('pages');
{
  const top = 290;
  const pages = [
    {
      title: 'A · Storm Kog (default)',
      when: 'Both builds. Any lane where you can trade inside W range.',
      primary: ["Stormraider's Surge", 'Manaflow Band', 'Transcendence', 'Scorch'],
      secondary: ['Legend: Alacrity', 'Coup de Grace'],
      shards: [data.shards.offense[0], data.shards.flex[1], data.shards.defense[2]],
      why: [
        'Stormraider\'s: every trade ends with a free chase or escape.',
        'Manaflow: Q, E and R stacks cost mana. Pressure every second needs mana every second.',
        `Transcendence: 10 haste by level 8 takes W from 17 to ${(17 / 1.1).toFixed(1)} s, so W is up ${((8 / (17 / 1.1)) * 100).toFixed(0)}% of the time instead of ${((8 / 17) * 100).toFixed(0)}%. Takedowns refund 20% after 11.`,
        'Scorch: extra lane damage on every Q and R poke. Gathering Storm if you expect a long game.',
        'Alacrity + Coup de Grace: more autos per W, and the 8% that finishes the chase.',
        'Shards: attack speed (level 1 breakpoint), move speed (stacks with the surge), scaling HP.',
      ],
    },
    {
      title: 'B · Lane bully (on-hit)',
      when: 'On-hit build, a 2v2 lane decided at levels 2 to 3, an engage support.',
      primary: ['Press the Attack', 'Presence of Mind', 'Legend: Alacrity', 'Coup de Grace'],
      secondary: ['Transcendence', 'Scorch'],
      shards: [data.shards.offense[0], data.shards.flex[0], data.shards.defense[0]],
      why: [
        `Press the Attack: ${pct(laneScore('Press the Attack'))} damage in every level 1 to 3 trade, every 6 s, and 8% on all follow-up damage.`,
        'Presence of Mind: mana back on every trade.',
        'Alacrity + Coup de Grace: the Precision damage core.',
        'Transcendence + Scorch: W uptime and poke from the second tree.',
        'Shards: attack speed, adaptive, 65 HP (beats scaling HP until about level 6).',
        'Cost: no speed. You win trades, but a dive catches you.',
      ],
    },
    {
      title: 'C · First Strike (AP, economy)',
      when: 'AP build, when you can reliably hit first from W range.',
      primary: ['First Strike', 'Magical Footwear', 'Triple Tonic', 'Approach Velocity'],
      secondary: ['Manaflow Band', 'Transcendence'],
      shards: [data.shards.offense[0], data.shards.flex[0], data.shards.defense[2]],
      why: [
        'First Strike: 7% true damage and gold, only when you hit first. The most skill-tested keystone.',
        'Magical Footwear + Triple Tonic: free boots and elixirs. Your gold goes straight into AP.',
        'Approach Velocity: 7.5% speed toward targets slowed by your E. A small chase tool.',
        'Manaflow + Transcendence: mana and W uptime.',
        'Cost: no fight power after the first 3 s. Ranked third for your goal.',
      ],
    },
  ];
  const colW = 640;
  pages.forEach((p, i) => {
    const x = i * colW;
    s.note(x, top - 60, p.title, { size: 26, color: i === 0 ? 'Moss' : 'Parchment' });
    s.note(x, top - 26, p.when, { size: 13, color: 'Slate', maxChars: 70 });
    // primary column
    p.primary.forEach((name, j) => {
      const y = top + 20 + j * 66;
      const sz = j === 0 ? 60 : 44;
      s.image(x + (j === 0 ? 0 : 8), y, sz, sz, icon(name));
      s.note(x + 74, y + (j === 0 ? 14 : 8), name, { size: j === 0 ? 20 : 16 });
    });
    // secondary
    p.secondary.forEach((name, j) => {
      const y = top + 34 + j * 66;
      s.image(x + 300, y, 40, 40, icon(name));
      s.note(x + 350, y + 8, name, { size: 15 });
    });
    p.shards.forEach(([path, label], j) => {
      const y = top + 180 + j * 34;
      s.image(x + 300, y, 26, 26, shardIcon(path));
      s.note(x + 336, y + 2, label, { size: 13, color: 'Sepia' });
    });
    s.wobblyLine([[x, top + 300], [x + colW - 60, top + 298]], { color: 'Sepia', width: 1 });
    s.note(x, top + 314, p.why.map((w) => `• ${w}`).join('\n'), { size: 14, maxChars: 66 });
  });
  s.note(0, top + 640, [
    'Swaps: Tenacity and slow resist shard instead of scaling HP into heavy CC. Cut Down instead of Coup de Grace into tanks.',
    'Gathering Storm instead of Scorch if the game will go long. Triumph instead of Alacrity if you keep dying right after kills.',
  ].join('\n'), { size: 13, color: 'Slate' });
}

// =====================================================================
// Tab 5: context, what NA plays
// =====================================================================
s.tab('context');
{
  const top = 290;
  const show = ["Stormraider's Surge", 'Lethal Tempo', 'Press the Attack', 'Arcane Comet', 'First Strike'];
  const samples = data.ugg.samples;
  const colW = 300;
  const barW = 200;
  s.note(0, top - 82, 'Keystone pick rate by rank · u.gg, NA, Ranked Solo, patch 26.21', { size: 22 });
  s.note(0, top - 52, 'Context only. Win rate in brackets, with its rough 95% noise. Buckets overlap (Diamond+ holds Master+ holds Challenger).', { size: 13, color: 'Slate' });
  samples.forEach((sm, c) => {
    const x = 260 + c * colW;
    s.note(x, top - 16, `${sm.label} · ${fmtInt(sm.matches)} games`, { size: 15 });
  });
  show.forEach((k, i) => {
    const y = top + 24 + i * 70;
    s.image(0, y, 40, 40, icon(k));
    s.note(52, y + 8, short(k), { size: 18 });
    samples.forEach((sm, c) => {
      const x = 260 + c * colW;
      const v = sm.keystones[k];
      if (!v) {
        s.note(x, y + 8, 'not listed', { size: 13, color: 'Slate' });
        return;
      }
      const [wr, pick] = v;
      const games = Math.round((pick / 100) * sm.matches);
      const color = k === "Stormraider's Surge" ? 'Moss' : k === 'Lethal Tempo' ? 'Sepia' : 'Parchment';
      s.wobblyLine([[x, y + 14], [x + (pick / 80) * barW, y + 14]], { color, width: 12, wobble: 0.3 });
      s.note(x + (pick / 80) * barW + 8, y + 2, `${pick.toFixed(0)}%`, { size: 16, color });
      s.note(x, y + 28, games >= 20 ? `${fmtInt(games)} g · ${wr.toFixed(1)}% WR ±${margin(games).toFixed(0)}` : `${games} g · too few`, { size: 12, color: games >= 100 ? 'Parchment' : 'Slate' });
    });
  });
  const c = samples.find((x) => x.id === 'c');
  const a = samples.find((x) => x.id === 'all');
  const nx = 1500;
  s.note(nx, top - 82, 'What it says', { size: 24, color: 'Sepia' });
  s.note(nx, top - 44, [
    `• Stormraider's climbs with rank: ${a.keystones["Stormraider's Surge"][1].toFixed(0)}% of games at All ranks, ${c.keystones["Stormraider's Surge"][1].toFixed(0)}% in NA Challenger. Lethal Tempo falls from ${a.keystones['Lethal Tempo'][1].toFixed(0)}% to ${c.keystones['Lethal Tempo'][1].toFixed(0)}%.`,
    '• That matches the model: the best players picked the rune that buys autos, not the one that adds damage.',
    '• No win-rate gap here is bigger than its noise. Challenger is only 515 games, and a few one-tricks play most of them.',
    '• First Strike\'s high win rates sit on 20 to 40 games. Ignore them.',
    '• Earlier patches with more detail: the "keystones (u.gg)" and "keystones (coachless, NA)" library pages.',
  ].join('\n'), { size: 15, maxChars: 50 });
}

const out = s.page({
  title: "Kog'Maw ADC: runes for aggression",
  source: { stats: data.ugg.source, numbers: data.wiki.source, model: 'tools/kogmaw-rune-model.mjs', pulledAt: data.pulledAt },
  tabs,
  activeTab: 'score',
});
await writeFile(`${ROOT}library/kogmaw-adc-runes-aggro.json`, JSON.stringify(out, null, 1) + '\n');
console.log(`wrote library/kogmaw-adc-runes-aggro.json (${out.page.items.length} items)`);
