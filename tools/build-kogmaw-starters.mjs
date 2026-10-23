// Builds the "Kog'Maw ADC: Doran's starter" library page from data/kogmaw-adc-starters.json.
// Re-run after refreshing the numbers: node tools/build-kogmaw-starters.mjs
//
// The page looks at one question (Bow, Blade, Helm or Ring?) from four angles,
// one tab each: what the items give in lane, coachless WPA by rank,
// what u.gg says the starter is tied to (the build path), and a verdict.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sketch } from './sketch.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const data = JSON.parse(await readFile(`${ROOT}data/kogmaw-adc-starters.json`, 'utf8'));
const s = sketch({ seed: 1086 });
const { items, kog, coachless, ugg } = data;

const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
const fmtK = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(Math.round(n)));
const sign = (n, d = 1) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(d)}`;
const pct = (n, d = 1) => `${n.toFixed(d)}%`;
// 95% margin for a rate from n games, in percentage points (binomial only).
const margin = (n) => 1.96 * Math.sqrt(0.25 / n) * 100;
const byName = Object.fromEntries(items.map((it) => [it.name, it]));
const icon = (it) => `${data.icons.base}${it.id}.png`;
const patches = Object.keys(coachless.patches);
const patchSpan = `${patches[0]} to ${patches[patches.length - 1]}`;

// ---- Lane math (level 1, from the wiki numbers) ----
const L1 = kog.level1;
const baseDps = L1.ad * L1.attackSpeed;
const baseMana = (L1.manaRegenPer5 / 5) * 60; // mana per minute without items
const lane = items.map((it) => {
  const dps = (L1.ad + it.ad) * L1.attackSpeed * (1 + it.as);
  const hp = L1.hp + it.hp;
  const physEhp = hp * (1 + (L1.armor + it.armor) / 100);
  const magEhp = hp * (1 + (L1.mr + it.mr) / 100);
  return {
    ...it,
    dps,
    dpsGain: dps / baseDps - 1,
    physGain: physEhp / (L1.hp * (1 + L1.armor / 100)) - 1,
    magGain: magEhp / (L1.hp * (1 + L1.mr / 100)) - 1,
    manaMin: it.manaPerSec * 60,
    manaMinHigh: (it.manaPerSecTrading ?? it.manaPerSec) * 60,
    vamp10s: dps * 10 * it.omnivamp, // healing from 10 s of autos
  };
});

// ---- coachless: pool patches per sample (sum buys, buy-weighted WPA and win rate) ----
function poolCoachless(sampleId) {
  const acc = {};
  for (const p of patches) {
    for (const [name, [wpa, buys, , , wr]] of Object.entries(coachless.patches[p][sampleId] ?? {})) {
      const a = (acc[name] ??= { buys: 0, wpaW: 0, wrW: 0, per: {} });
      a.buys += buys;
      a.wpaW += wpa * buys;
      a.wrW += wr * buys;
      a.per[p] = wpa;
    }
  }
  const total = Object.values(acc).reduce((t, a) => t + a.buys, 0);
  for (const a of Object.values(acc)) {
    a.wpa = a.wpaW / a.buys;
    a.wr = a.wrW / a.buys;
    a.share = (a.buys / total) * 100;
  }
  return { acc, total };
}
const cPooled = Object.fromEntries(coachless.samples.map((sm) => [sm.id, poolCoachless(sm.id)]));

// ---- u.gg: pool games and wins across patches per variant and rank ----
function poolUgg(variant, rank) {
  const out = { games: 0, wins: 0, starters: {} };
  for (const p of patches) {
    const [g, w, starter, sg, sw] = ugg.patches[p][variant][rank];
    out.games += g;
    out.wins += w;
    const st = (out.starters[starter] ??= { games: 0, wins: 0, patches: [] });
    st.games += sg;
    st.wins += sw;
    st.patches.push(p);
  }
  out.wr = (out.wins / out.games) * 100;
  return out;
}
const ranks = ugg.samples;
const uOverall = Object.fromEntries(ranks.map((r) => [r.id, poolUgg('overall', r.id)]));
const uAp = Object.fromEntries(ranks.map((r) => [r.id, poolUgg('ap', r.id)]));
const uOnhit = Object.fromEntries(ranks.map((r) => [r.id, poolUgg('onhit', r.id)]));
const uAd = Object.fromEntries(ranks.map((r) => [r.id, poolUgg('ad', r.id)]));

// Challenger: u.gg named Ring as the starter on every patch, so "Ring vs everything else" is exact.
const chal = uOverall.c;
const chalRing = chal.starters["Doran's Ring"];
const chalRest = { games: chal.games - chalRing.games, wins: chal.wins - chalRing.wins };
const ringWr = (chalRing.wins / chalRing.games) * 100;
const restWr = (chalRest.wins / chalRest.games) * 100;
const chalZ = (ringWr - restWr) / (Math.hypot(margin(chalRing.games), margin(chalRest.games)) / 1.96);

// ---- Shared by every tab ----
s.tab(null);
s.note(0, 0, `${data.champion} ${data.role} · which Doran's?`, { size: 40 });
s.wobblyLine([[4, 60], [600, 56]], { color: 'Red chalk', width: 2.5 });
s.note(0, 72, [
  'dbow, dblade, dhelm or dring, for a Kog\'Maw in NA Challenger?',
  `Stats: coachless.gg and u.gg, NA, patches ${patchSpan}`,
  '(u.gg calls them 26.x). Item numbers: LoL wiki and',
  `Data Dragon ${data.icons.version}. Pulled ${data.pulledAt}.`,
  'Four tabs, four angles. Start at the Verdict or read in order.',
].join('\n'), { size: 15, color: 'Sepia' });

const views = [
  { id: 'lane', label: '1 · Lane math' },
  { id: 'wpa', label: '2 · Who wins (coachless)' },
  { id: 'build', label: '3 · Starter follows build (u.gg)' },
  { id: 'verdict', label: '4 · Verdict' },
];

// =====================================================================
// Tab 1: what each item actually gives at level 1
// =====================================================================
s.tab('lane');
{
  const top = 230;
  const rowH = 150;
  const cols = { stats: 70, eff: 560, dps: 780, ehp: 990, mana: 1200 };
  s.note(0, top - 50, 'Item · cost · stats', { size: 15, color: 'Slate' });
  s.note(cols.eff, top - 50, 'Gold value of stats', { size: 15, color: 'Slate' });
  s.note(cols.dps, top - 50, 'Level 1 auto DPS', { size: 15, color: 'Slate' });
  s.note(cols.ehp, top - 50, 'Level 1 bulk', { size: 15, color: 'Slate' });
  s.note(cols.mana, top - 50, 'Mana per minute', { size: 15, color: 'Slate' });

  const effMax = 200;
  const effW = 180;
  lane.forEach((it, i) => {
    const y = top + i * rowH;
    s.image(0, y, 56, 56, icon(it));
    s.note(cols.stats, y - 8, `${it.name}  ·  ${it.cost}g`, { size: 26 });
    s.note(cols.stats, y + 28, `${it.stats}\n${it.passive}`, { size: 14, color: 'Sepia', maxChars: 58 });
    s.note(cols.stats, y + 86, it.history, { size: 12, color: 'Slate', maxChars: 64 });

    // Gold efficiency bar (Ring: a range, since Drain's mana is worth more when trading).
    const eff = it.efficiency ?? Math.round((it.goldValue / it.cost) * 100);
    const effHigh = it.goldValueHigh ? Math.round((it.goldValueHigh / it.cost) * 100) : null;
    const bx = cols.eff;
    const by = y + 14;
    s.wobblyLine([[bx, by], [bx + (eff / effMax) * effW, by]], { color: 'Moss', width: 10, wobble: 0.3 });
    if (effHigh) {
      s.wobblyLine([[bx + (eff / effMax) * effW, by], [bx + (Math.min(effHigh, effMax) / effMax) * effW, by]],
        { color: 'Moss', width: 3, wobble: 0.3 });
    }
    s.note(bx, by + 14, effHigh ? `${eff} to ${effHigh}%  (mana counted)` : `${eff}% gold efficient`, { size: 13 });

    // DPS
    const dpsColor = it.dpsGain > 0.2 ? 'Moss' : it.dpsGain > 0 ? 'Parchment' : 'Slate';
    s.note(cols.dps, y, `${it.dps.toFixed(1)}`, { size: 26, color: dpsColor });
    s.note(cols.dps, y + 36, it.dpsGain > 0 ? `${sign(it.dpsGain * 100, 0)}% vs no item` : 'no change', { size: 13, color: 'Slate' });
    if (it.omnivamp) s.note(cols.dps, y + 56, `heals ${it.vamp10s.toFixed(0)} HP per 10 s of autos`, { size: 12, color: 'Slate' });

    // Bulk
    const bulk = Math.max(it.physGain, it.magGain);
    s.note(cols.ehp, y, it.hp ? `${sign(it.physGain * 100, 0)}% / ${sign(it.magGain * 100, 0)}%` : '—',
      { size: 22, color: bulk > 0.25 ? 'Moss' : bulk > 0 ? 'Parchment' : 'Slate' });
    s.note(cols.ehp, y + 36, it.hp ? 'vs physical / magic' : 'no bulk', { size: 13, color: 'Slate' });

    // Mana
    if (it.manaPerSec) {
      s.note(cols.mana, y, `+${it.manaMin} to +${it.manaMinHigh}`, { size: 22, color: 'Moss' });
      s.note(cols.mana, y + 36, `Kog makes ${baseMana.toFixed(0)} on his own.\nThat is ${pct((it.manaMin / baseMana) * 100, 0)} to ${pct((it.manaMinHigh / baseMana) * 100, 0)} more:\n~${(it.manaMin / 40).toFixed(1)} to ${(it.manaMinHigh / 40).toFixed(1)} extra Q or W a minute.`,
        { size: 13, color: 'Slate' });
    } else {
      s.note(cols.mana, y, '—', { size: 22, color: 'Slate' });
    }
  });

  const ring = lane.find((it) => it.key === 'ring');
  const bow = lane.find((it) => it.key === 'bow');
  const blade = lane.find((it) => it.key === 'blade');
  const helm = lane.find((it) => it.key === 'helm');
  const wBonus = (ring.ap / 100) * 1.5; // % max health added to W per hit
  const nx = 1460;
  s.note(nx, top - 50, 'What the lane math says', { size: 24, color: 'Sepia' });
  s.note(nx, top - 12, [
    `• Bow is the fight item. ${sign(bow.dpsGain * 100, 0)}% level 1 auto DPS for the cheapest price, because attack speed multiplies Kog's ${L1.ad} base AD. Blade gives ${sign(blade.dpsGain * 100, 0)}% for 50g more.`,
    `• Helm is the survive item: about ${sign(helm.physGain * 100, 0)}% effective HP against both damage types, for a champion with ${L1.hp} HP and ${L1.armor} armor at level 1 and no dash.`,
    `• Ring is the mana item. Kog's Q, W, E and R all cost 40+ mana and his own regen is ${baseMana.toFixed(0)} a minute. The 18 AP adds only ${wBonus.toFixed(2)}% max health to each W hit (about ${((wBonus / 100) * 650).toFixed(0)} damage on a 650 HP laner), but it also feeds E and R.`,
    `• Blade looks worst for Kog: less DPS than Bow, less bulk than Helm. Its 80 HP and 2.5% omnivamp are built for melee fighters. Omnivamp heals ~${blade.vamp10s.toFixed(0)} HP per 10 s of level 1 autos, so it is not a sustain item at this level.`,
  ].join('\n'), { size: 15, maxChars: 52 });
  s.note(nx, top + 560, [
    'Assumptions: level 1, no runes, no Q passive, target with 0 armor for DPS.',
    'Bulk = effective HP vs Kog with no item (HP × (1 + resist/100)).',
    'Gold values: the LoL wiki cost analysis.',
  ].join('\n'), { size: 13, color: 'Slate', maxChars: 60 });
}

// =====================================================================
// Tab 2: coachless WPA, patches pooled, by rank
// =====================================================================
s.tab('wpa');
{
  const top = 260;
  const rowH = 118;
  const colW = 290;
  const colX0 = 420;
  const plotW = 240;
  const lo = -8;
  const hi = 8;
  const xOf = (c, w) => colX0 + c * colW + ((Math.min(hi, Math.max(lo, w)) - lo) / (hi - lo)) * plotW;
  const order = ["Doran's Bow", "Doran's Ring", "Doran's Helm", "Doran's Blade"];
  const bottom = top + order.length * rowH - 30;

  s.note(0, top - 50, 'Starter', { size: 15, color: 'Slate' });
  order.forEach((name, i) => {
    const y = top + i * rowH;
    s.image(0, y, 56, 56, icon(byName[name]));
    s.note(70, y - 2, name, { size: 24 });
    s.note(70, y + 32, byName[name].short, { size: 14, color: 'Sepia' });
  });

  coachless.samples.forEach((sm, c) => {
    const x = colX0 + c * colW;
    const pool = cPooled[sm.id];
    s.note(x, top - 96, sm.label, { size: 18 });
    s.note(x, top - 70, `${fmtInt(pool.total)} games with a Doran's`, { size: 13, color: 'Slate' });
    const zx = xOf(c, 0);
    s.wobblyLine([[zx, top - 40], [zx, bottom]], { color: 'Sepia', width: 1.2 });
    s.wobblyLine([[x, bottom + 6], [x + plotW, bottom + 6]], { color: 'Parchment', width: 1 });
    for (let t = lo; t <= hi; t += 4) {
      const tx = xOf(c, t);
      s.wobblyLine([[tx, bottom + 1], [tx, bottom + 11]], { color: 'Parchment', width: 1 });
      s.note(tx - 8, bottom + 14, t ? sign(t, 0) : '0', { size: 12, color: 'Slate' });
    }
    order.forEach((name, i) => {
      const a = pool.acc[name];
      const cy = top + i * rowH + 18;
      if (!a) {
        s.note(x, cy - 8, 'under coachless\'s game threshold', { size: 13, color: 'Slate' });
        return;
      }
      const m = margin(a.buys);
      const color = Math.abs(a.wpa) < m ? 'Parchment' : a.wpa > 0 ? 'Moss' : 'Red chalk';
      s.wobblyLine([[xOf(c, a.wpa - m), cy], [xOf(c, a.wpa + m), cy]], { color, width: 1.6, wobble: 0.3 });
      for (const e of [a.wpa - m, a.wpa + m]) {
        if (e > lo && e < hi) s.stroke([[xOf(c, e), cy - 6], [xOf(c, e), cy + 6]], { color, width: 1.6 });
      }
      s.wobblyLine([[xOf(c, a.wpa) - 3, cy], [xOf(c, a.wpa) + 3, cy]], { color, width: 11, wobble: 0.2 });
      const per = patches.map((p) => (a.per[p] === undefined ? '·' : sign(a.per[p], 1))).join(' / ');
      s.note(x, cy + 14, `${sign(a.wpa, 2)} WPA · ${pct(a.share, 0)} of games · ${fmtK(a.buys)} g`,
        { size: 13, color: a.buys < 300 ? 'Slate' : 'Parchment' });
      s.note(x, cy + 32, `by patch: ${per}`, { size: 12, color: 'Slate' });
    });
  });
  s.note(colX0, bottom + 38, [
    `WPA in percentage points, ${patches.length} patches added together (game-weighted).`,
    'Dot = pooled WPA. Whisker = rough 95% noise from the game count alone.',
    'Green or red only when the whole whisker is on one side of zero.',
    `"by patch" lists ${patches.join(' / ')}.`,
  ].join('\n'), { size: 13, color: 'Slate' });

  // Circle the NA Master+ Ring dot: the most interesting number, and a small sample.
  const mCol = coachless.samples.findIndex((sm) => sm.id === 'na-m');
  const mRing = cPooled['na-m'].acc["Doran's Ring"];
  const mBow = cPooled['na-m'].acc["Doran's Bow"];
  s.loop(xOf(mCol, mRing.wpa), top + rowH + 18, 34, 22, { color: 'Red chalk', width: 2.5 });

  const naD = cPooled['na-d'].acc;
  const wD = cPooled['world-d'].acc;
  const gap = (a, b) => ({ d: a.wpa - b.wpa, z: (a.wpa - b.wpa) / (Math.hypot(margin(a.buys), margin(b.buys)) / 1.96) });
  const gM = gap(mRing, mBow);
  const gD = gap(naD["Doran's Ring"], naD["Doran's Bow"]);
  const gW = gap(wD["Doran's Bow"], wD["Doran's Ring"]);
  const ringAheadM = patches.filter((p) => mRing.per[p] > mBow.per[p]).length;
  const nx = colX0 + coachless.samples.length * colW + 40;
  s.note(nx, top - 96, 'What it says', { size: 24, color: 'Sepia' });
  s.note(nx, top - 58, [
    `• Ring's share climbs with rank in NA: ${['na-gold', 'na-d', 'na-m'].map((id) => pct(cPooled[id].acc["Doran's Ring"].share, 0)).join(' → ')} (Gold+ → Diamond+ → Master+).`,
    `• NA Master+: Ring ${sign(mRing.wpa, 1)} vs Bow ${sign(mBow.wpa, 1)}, a ${gM.d.toFixed(1)} pp gap at ${gM.z.toFixed(1)}× its noise. Ring was ahead in ${ringAheadM} of ${patches.length} patches, on only ~${fmtK(mRing.buys + mBow.buys)} games.`,
    `• NA Diamond+: Ring ahead by ${gD.d.toFixed(1)} pp (${gD.z.toFixed(1)}×). A lean, not a result.`,
    `• World Diamond+ (${fmtK(cPooled['world-d'].total)} games): Bow ahead of Ring by ${gW.d.toFixed(1)} pp (${gW.z.toFixed(1)}×). Basically a tie.`,
    `• Helm and Blade: ${fmtK(wD["Doran's Helm"].buys)} and ${fmtK(wD["Doran's Blade"].buys)} world Diamond+ games, both a little under zero, inside the noise. Too rare in NA high elo to show.`,
    '• Why NA Master+ is so different from the world: see tab 3. It is mostly a different build, not just a different starter.',
  ].join('\n'), { size: 15, maxChars: 50 });
}

// =====================================================================
// Tab 3: u.gg, the starter follows the build
// =====================================================================
s.tab('build');
{
  const top = 250;
  const chartX = 0;
  const chartW = 620;
  const chartH = 300;
  const yOf = (v) => top + chartH - (v / 100) * chartH;
  const xOfR = (i) => chartX + 60 + i * ((chartW - 120) / (ranks.length - 1));

  s.note(chartX, top - 70, 'Up the ranks, Kog turns AP and starts Ring', { size: 24 });
  s.note(chartX, top - 38, `NA, u.gg, ${patches.length} patches added together. Share of Kog'Maw games.`, { size: 14, color: 'Slate' });
  // axes
  s.wobblyLine([[chartX + 30, yOf(0)], [chartX + chartW, yOf(0)]], { color: 'Parchment', width: 1 });
  for (const t of [0, 25, 50, 75, 100]) {
    s.note(chartX - 6, yOf(t) - 9, `${t}%`, { size: 12, color: 'Slate' });
    if (t) s.wobblyLine([[chartX + 30, yOf(t)], [chartX + chartW, yOf(t)]], { color: '#3a352c', width: 1, wobble: 0.4 });
  }
  ranks.forEach((r, i) => {
    s.note(xOfR(i) - 30, yOf(0) + 10, r.label, { size: 13 });
    s.note(xOfR(i) - 30, yOf(0) + 28, `${fmtK(uOverall[r.id].games)} g`, { size: 12, color: 'Slate' });
  });

  // Line 1: AP build share (u.gg's AP variant games / all games).
  const apShare = ranks.map((r) => (uAp[r.id].games / uOverall[r.id].games) * 100);
  // Line 2: Doran's Ring share. Coachless for the ranks it covers; u.gg Challenger (Ring was u.gg's pick every patch).
  const ringShare = [
    cPooled['na-gold'].acc["Doran's Ring"].share,
    cPooled['na-d'].acc["Doran's Ring"].share,
    cPooled['na-m'].acc["Doran's Ring"].share,
    (chalRing.games / chal.games) * 100,
  ];
  // Each value label goes on the outer side of the pair, so the two lines never share a label spot.
  const line = (vals, other, color, label) => {
    s.wobblyLine(vals.map((v, i) => [xOfR(i), yOf(v)]), { color, width: 2.5 });
    vals.forEach((v, i) => {
      s.wobblyLine([[xOfR(i) - 3, yOf(v)], [xOfR(i) + 3, yOf(v)]], { color, width: 10, wobble: 0.2 });
      s.note(xOfR(i) - 14, yOf(v) + (v >= other[i] ? -30 : 10), pct(v, 0), { size: 14, color });
    });
    s.note(xOfR(vals.length - 1) + 30, yOf(vals[vals.length - 1]) - 12, label, { size: 15, color });
  };
  line(apShare, ringShare, 'Red chalk', 'AP build\n(Dusk and Dawn)');
  line(ringShare, apShare, 'Moss', 'Doran\'s Ring');
  s.note(chartX, yOf(0) + 56, [
    'AP build = u.gg\'s AP variant (Dusk and Dawn > Sorcerer\'s Shoes > Shadowflame).',
    'Ring share: coachless for Gold+ (not All ranks), Diamond+ and Master+;',
    'u.gg for Challenger, where Ring was u.gg\'s starter on all 3 patches.',
  ].join('\n'), { size: 12, color: 'Slate' });

  // Table: each build variant's starter and pooled win rate by rank.
  const tx = 860;
  const colW = 175;
  const variants = [
    { key: 'ap', label: 'AP build', data: uAp, core: ugg.variantCores.ap },
    { key: 'onhit', label: 'On-hit build', data: uOnhit, core: ugg.variantCores.onhit },
    { key: 'ad', label: 'AD build', data: uAd, core: ugg.variantCores.ad },
  ];
  s.note(tx, top - 70, 'Each build brings its own starter', { size: 24 });
  s.note(tx, top - 38, 'Pooled win rate · games · u.gg\'s starter for that build', { size: 14, color: 'Slate' });
  ranks.forEach((r, c) => s.note(tx + 230 + c * colW, top - 6, r.label, { size: 15 }));
  variants.forEach((v, i) => {
    const y = top + 30 + i * 110;
    s.note(tx, y, v.label, { size: 22 });
    s.note(tx, y + 30, v.core, { size: 12, color: 'Sepia', maxChars: 34 });
    ranks.forEach((r, c) => {
      const d = v.data[r.id];
      const m = margin(d.games);
      const avg = uOverall[r.id].wr;
      const color = Math.abs(d.wr - avg) < m ? 'Parchment' : d.wr > avg ? 'Moss' : 'Red chalk';
      const top1 = Object.entries(d.starters).sort((a, b) => b[1].games - a[1].games)[0];
      const share = (top1[1].games / d.games) * 100;
      const short = top1[0].replace("Doran's ", 'd').toLowerCase();
      const x = tx + 230 + c * colW;
      s.note(x, y, pct(d.wr), { size: 22, color });
      s.note(x, y + 30, `${fmtK(d.games)} g · ±${m.toFixed(0)}`, { size: 12, color: 'Slate' });
      s.note(x, y + 48, `${short} ${share >= 30 ? pct(share, 0) : `(${top1[1].games} g)`}`,
        { size: 13, color: share >= 30 ? 'Parchment' : 'Slate' });
    });
  });
  s.note(tx, top + 360, [
    'Green / red: further from Kog\'s average in that rank than the noise (±).',
    'Builds are defined by finished items, so they skip short stomps and lean toward longer games;',
    'compare builds with each other, not with 50%. Variants overlap a little.',
    'u.gg names one starter per build: its best scorer, not always the most bought.',
    'Grey "(n g)" = u.gg picked a rare starter there, so the usual one is unknown.',
  ].join('\n'), { size: 12, color: 'Slate' });

  const nx = 1780;
  s.note(nx, top - 70, 'What it says', { size: 24, color: 'Sepia' });
  s.note(nx, top - 32, [
    `• NA Challenger Kog is mostly AP now: ${pct(apShare[3], 0)} of ${fmtInt(chal.games)} games build Dusk and Dawn first, against ${pct(apShare[0], 0)} at All ranks.`,
    `• Those AP games start Ring ${pct((uAp.c.starters["Doran's Ring"].games / uAp.c.games) * 100, 0)} of the time. On-hit games start Bow when there is enough data (All ranks: ${pct((uOnhit.all.starters["Doran's Bow"].games / uOnhit.all.games) * 100, 0)}).`,
    `• Challenger, Ring vs every other start: ${pct(ringWr)} (${fmtInt(chalRing.games)} g) vs ${pct(restWr)} (${fmtInt(chalRest.games)} g), ${chalZ.toFixed(1)}× the noise.`,
    `• So the starter question is really a build question: Ring is the AP start. At Challenger the AP build sits at ${pct(uAp.c.wr)} vs on-hit ${pct(uOnhit.c.wr)} (only ${fmtInt(uOnhit.c.games)} on-hit games).`,
    `• Lower down it flips: at All ranks on-hit wins ${pct(uOnhit.all.wr)} vs AP ${pct(uAp.all.wr)}. AP Kog looks like the harder build that pays off in skilled hands.`,
    '• Caveat: NA Master+ Kog games come from a few one-tricks with hundreds of games each (u.gg leaderboard). Their skill is baked into these numbers.',
  ].join('\n'), { size: 15, maxChars: 50 });
}

// =====================================================================
// Tab 4: verdict, as a decision sketch
// =====================================================================
s.tab('verdict');
{
  const top = 250;
  const ringL = lane.find((it) => it.key === 'ring');
  const bowL = lane.find((it) => it.key === 'bow');
  const helmL = lane.find((it) => it.key === 'helm');
  const baseRegen = L1.manaRegenPer5 / 5;
  // AP vs on-hit at Challenger, patch by patch.
  const apWins = patches.filter((p) => {
    const [ag, aw] = ugg.patches[p].ap.c;
    const [og, ow] = ugg.patches[p].onhit.c;
    return aw / ag > ow / og;
  }).length;
  const wD = cPooled['world-d'].acc;
  const bowTop = Object.entries(wD).sort((a, b) => b[1].wpa - a[1].wpa)[0][0] === "Doran's Bow";
  const box = (x, y, it, title, why, color) => {
    s.image(x, y, 64, 64, icon(byName[it]));
    s.note(x + 80, y - 6, title, { size: 28, color });
    s.note(x + 80, y + 34, why, { size: 15, maxChars: 46 });
  };
  s.note(0, top - 70, 'Kog\'Maw ADC in NA Challenger. My pick:', { size: 26 });
  s.note(0, top - 30, 'First decide the build. The starter follows it.', { size: 16, color: 'Sepia' });

  // Root question
  s.note(40, top + 40, 'Which first item?', { size: 24 });
  s.loop(140, top + 54, 130, 34, { color: 'Sepia', width: 2 });
  s.arrow([[280, top + 40], [600, top + 10]], { color: 'Red chalk', width: 2.5 });
  s.arrow([[280, top + 70], [600, top + 260]], { color: 'Moss', width: 2.5 });
  s.note(330, top - 4, 'Dusk and Dawn (AP)', { size: 15, color: 'Red chalk' });
  s.note(250, top + 196, 'Rageblade / BotRK (on-hit)', { size: 15, color: 'Moss' });

  box(620, top - 20, "Doran's Ring", 'dring  ·  the default up top',
    `AP for W, E and R, and Drain adds ${pct((ringL.manaPerSec / baseRegen) * 100, 0)} to Kog's mana regen (${pct(((ringL.manaPerSecTrading ?? 1) / baseRegen) * 100, 0)} while trading), so he can keep casting E and W. It is what NA Challenger Kogs start, and it wins there (tab 3).`,
    'Red chalk');
  box(620, top + 230, "Doran's Bow", 'dbow  ·  the default for on-hit',
    `${sign(bowL.dpsGain * 100, 0)}% level 1 auto DPS for ${bowL.cost}g, the most gold-efficient starter (${bowL.efficiency}%), and its attack speed is what the on-hit build wants.${bowTop ? ' Top pooled WPA in world Diamond+ (tab 2), by a hair.' : ''}`,
    'Moss');
  s.arrow([[700, top + 400], [700, top + 470], [1040, top + 470]], { color: 'Slate', width: 2 });
  s.note(740, top + 440, 'into a kill lane?', { size: 14, color: 'Slate' });
  box(1060, top + 440, "Doran's Helm", 'dhelm  ·  the survival swap',
    `About ${sign(helmL.physGain * 100, 0)}% effective HP vs both damage types at level 1. Take it into lanes that can kill Kog before he scales (heavy level 2 all-ins, double poke). Rare in the data, so this is reasoning, not stats.`,
    'Slate');
  box(0, top + 520, "Doran's Blade", 'dblade  ·  skip',
    'Less DPS than Bow and less bulk than Helm, for more gold than Bow. The data can\'t separate it from the others (tab 2), so this one rests on the lane math. No Kog lane wants exactly this mix.',
    'Slate');

  s.note(1200, top - 50, 'How sure am I?', { size: 24, color: 'Sepia' });
  s.note(1200, top - 12, [
    '• Ring for AP and Bow for on-hit: confident. The item stats line up with each build and the data agrees.',
    `• AP Kog being the better build in NA Challenger: a lean. AP beat on-hit in ${apWins} of ${patches.length} patches, on a few hundred games from a handful of players.`,
    '• Helm into kill lanes: an educated guess. Too few Helm games to test.',
  ].join('\n'), { size: 15, maxChars: 52 });
  s.note(1060, top + 640, 'To test next', { size: 24, color: 'Sepia' });
  s.note(1060, top + 676, [
    '• Matchups: Ring vs Bow into Draven, Lucian, Caitlyn (coachless "vs" filter, once samples allow).',
    '• AP vs on-hit Kog by enemy comp: tanky teams should favour %HP W either way.',
    '• Re-pull when 26.21 has a full patch of games.',
  ].join('\n'), { size: 15, color: 'Moss', maxChars: 52 });
}

// ---- Footer (shared) ----
s.tab(null);
s.note(0, 1080, [
  'Sources:',
  coachless.source,
  '(Filters: NA or world, rank boxes, one patch at a time)',
  'https://stats2.u.gg/lol/1.5/<variant>/<patch>/',
  '  ranked_solo_5x5/96/1.5.0.json (behind u.gg\'s build page)',
  `${data.wiki.source}Doran's_Bow, _Blade, _Helm, _Ring`,
  `Icons: ${data.icons.source}${data.icons.version}`,
  'Made by tools/build-kogmaw-starters.mjs',
  'from data/kogmaw-adc-starters.json.',
].join('\n'), { size: 12, color: 'Slate' });

const page = s.page({
  title: `${data.champion} ${data.role}: Doran's starter`,
  source: {
    stats: `${coachless.source} · ${ugg.source}`,
    wiki: data.wiki.source,
    icons: `${data.icons.source} ${data.icons.version}`,
    pulledAt: data.pulledAt,
  },
  tabs: views,
  activeTab: 'verdict',
});
await writeFile(`${ROOT}library/kogmaw-adc-starters.json`, JSON.stringify(page, null, 1) + '\n');
console.log(`wrote ${page.page.items.length} items, tabs: ${page.page.tabs.map((t) => t.label).join(', ')}`);
console.log({ apShare: ranks.map((r) => (uAp[r.id].games / uOverall[r.id].games * 100).toFixed(1)), ringWr, restWr, chalZ });
