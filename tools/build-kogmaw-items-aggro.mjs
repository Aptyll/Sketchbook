// Builds the "Kog'Maw ADC: items for aggression" library page from
// data/kogmaw-adc-items-aggro.json (items, LoL wiki 26.22), data/kogmaw-adc-runes-aggro.json
// (Kog'Maw and rune numbers) and the fight model in tools/kogmaw-item-model.mjs.
// Re-run after a patch: update the JSON, then node tools/build-kogmaw-items-aggro.mjs
//
// The question is not "what wins most" but "which build path lets Kog'Maw pressure from the
// first back, win mid-game fights, and reward good play". Win rates sit in the last tab as context.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sketch } from './sketch.mjs';
import {
  PATHS, CHECKPOINTS, DIVERS, FRONTLINE, evaluate, duelScore, inventory, kogAt, enemyAt, simulate, skirmish, duel,
} from './kogmaw-item-model.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const data = JSON.parse(await readFile(`${ROOT}data/kogmaw-adc-items-aggro.json`, 'utf8'));
const rd = JSON.parse(await readFile(`${ROOT}data/kogmaw-adc-runes-aggro.json`, 'utf8'));
const s = sketch({ seed: 2612 });
const I = data.items;
const icon = (name) => `${data.icons.item}${I[name].id}.png`;
const runeIcon = (name) => `${data.icons.rune}${rd.runes[name].icon}`;
const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
const pct = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(0)}%`;
const SHORT = {
  "Guinsoo's Rageblade": 'Rageblade', 'Blade of the Ruined King': 'Ruined King', Terminus: 'Terminus',
  'Navori Flickerblade': 'Navori', 'Kraken Slayer': 'Kraken', "Wit's End": "Wit's End",
  'Dusk and Dawn': 'Dusk', "Nashor's Tooth": "Nashor's", "Rabadon's Deathcap": "Rabadon's",
  Shadowflame: 'Shadowflame', 'Lich Bane': 'Lich Bane', Stormsurge: 'Stormsurge',
  "Berserker's Greaves": "Berserker's", "Sorcerer's Shoes": "Sorcerer's", 'Gluttonous Greaves': 'Gluttonous',
};
const short = (n) => SHORT[n] ?? n;
const pathLabel = (p) => p.items.map(short).join(' → ');
const FAMILY = { onhit: 'on-hit', ap: 'AP', hybrid: 'hybrid' };

// ---- Run the model ----
const ev = Object.fromEntries(PATHS.map((p) => [p.id, evaluate(data, rd, p)]));
const at = (id, cp) => ev[id].at[cp];
const duelAvg = (id, cp, lvl) => (duelScore(at(id, cp).duelOpen, DIVERS[lvl].hp) + duelScore(at(id, cp).duelSlow, DIVERS[lvl].hp)) / 2;
const metric = {
  back: (id) => at(id, 'back').skirmish.total,
  one: (id) => at(id, 'one').skirmish.total,
  oneDuel: (id) => duelAvg(id, 'one', 9),
  twoTtk: (id) => at(id, 'two').skirmish.killAt ?? 8,
  twoSk: (id) => at(id, 'two').skirmish.total,
  twoDuel: (id) => duelAvg(id, 'two', 11),
  front: (id) => at(id, 'three').front.total,
  threeTtk: (id) => at(id, 'three').skirmish.killAt ?? 8,
};
const ids = PATHS.map((p) => p.id);
const best = (fn, low = false) => (low ? Math.min : Math.max)(...ids.map(fn));
const rel = (fn, id, low = false) => (low ? best(fn, true) / fn(id) : fn(id) / best(fn));

// Skill ceiling: a judgment call, reason given on the page.
const ceiling = {
  dnr: 5, ndr: 5, drn: 5, dsr: 4, lnr: 4, rnd: 4, rdn: 4, snr: 3, krt: 3, brt: 3, rnt: 3, rbt: 2, rtb: 2, rwt: 2,
};
const scores = Object.fromEntries(ids.map((id) => {
  const early = (rel(metric.back, id) + rel(metric.one, id) + (metric.oneDuel(id) + 1) / 2) / 3;
  const mid = (rel(metric.twoTtk, id, true) + rel(metric.twoSk, id) + (metric.twoDuel(id) + 1) / 2) / 3;
  const late = (rel(metric.front, id) + rel(metric.threeTtk, id, true)) / 2;
  // Goal weighting: early, late and skill once, the mid-game twice.
  return [id, { early, mid, late, total: early + 2 * mid + late + ceiling[id] / 5 }];
}));
const order = [...ids].sort((a, b) => scores[b].total - scores[a].total);
const P = Object.fromEntries(PATHS.map((p) => [p.id, p]));

// ---- Header (all tabs) ----
s.tab(null);
s.note(0, 0, "Kog'Maw ADC · items for aggression", { size: 40 });
s.wobblyLine([[4, 60], [700, 55]], { color: 'Red chalk', width: 2.5 });
s.note(0, 72, [
  'Goal: pressure from the first back, win the mid-game,',
  'highest skill ceiling. 14 build paths, bought with the same gold,',
  `run through a fight model with LoL wiki numbers (patch ${data.wiki.patch}).`,
  "Runes: the runes page's default (Stormraider's Surge).",
  `Win rates: tab 6 only (patch 16.21). Pulled ${data.pulledAt}.`,
].join('\n'), { size: 15, color: 'Sepia' });

const tabs = [
  { id: 'score', label: '1 · Scorecard' },
  { id: 'back', label: '2 · First back & boots' },
  { id: 'order', label: '3 · Item order' },
  { id: 'duel', label: '4 · Mid-game duel' },
  { id: 'paths', label: '5 · Build paths' },
  { id: 'context', label: '6 · What NA builds (context)' },
];

const pathIcons = (x, y, p, size = 34) => {
  p.items.forEach((name, k) => {
    s.image(x + k * (size + 14), y, size, size, icon(name));
    if (k < p.items.length - 1) s.note(x + k * (size + 14) + size + 1, y + size / 2 - 9, '›', { size: 16, color: 'Slate' });
  });
};
const duelText = (r, hp) => {
  const sc = duelScore(r, hp);
  if (sc > 0) return { text: r.caughtAt === null ? `wins, never reached (${r.killAt.toFixed(1)} s)` : `wins, ${(sc * 100).toFixed(0)}% HP left`, color: r.caughtAt === null ? 'Moss' : 'Parchment' };
  return { text: `dies, diver at ${(-sc * 100).toFixed(0)}%`, color: 'Red chalk' };
};

// =====================================================================
// Tab 1: scorecard
// =====================================================================
s.tab('score');
{
  const top = 300;
  const rowH = 58;
  const cols = [
    { x: 470, label: 'First back\n8 s damage, level 6', get: metric.back, fmt: (v) => fmtInt(v), f: (id) => rel(metric.back, id) },
    { x: 660, label: 'Item 1\n8 s damage, level 9', get: metric.one, fmt: (v) => fmtInt(v), f: (id) => rel(metric.one, id) },
    { x: 850, label: 'Item 2: time to\nkill an ADC', get: metric.twoTtk, fmt: (v) => `${v.toFixed(1)} s`, f: (id) => rel(metric.twoTtk, id, true) },
    { x: 1040, label: 'Item 2: fed diver,\nyou slowed 30%', duel: true },
    { x: 1290, label: 'Item 3: 16 s\non a tank', get: metric.front, fmt: (v) => fmtInt(v), f: (id) => rel(metric.front, id) },
    { x: 1480, label: 'Skill ceiling\n(judgment)', dots: true },
  ];
  cols.forEach((c) => s.note(c.x, top - 64, c.label, { size: 14, color: 'Slate' }));
  order.forEach((id, i) => {
    const p = P[id];
    const y = top + i * rowH;
    pathIcons(0, y, p);
    s.note(150, y + 2, pathLabel(p), { size: 17 });
    s.note(150, y + 26, `${FAMILY[p.family]} · ${short(p.boots)}`, { size: 11, color: 'Slate' });
    cols.forEach((c) => {
      if (c.dots) {
        s.note(c.x, y + 4, '●'.repeat(ceiling[id]) + '○'.repeat(5 - ceiling[id]), { size: 18, color: ceiling[id] >= 4 ? 'Moss' : 'Parchment' });
        return;
      }
      if (c.duel) {
        const d = duelText(at(id, 'two').duelSlow, DIVERS[11].hp);
        s.note(c.x, y + 6, d.text, { size: 13, color: d.color });
        return;
      }
      const f = c.f(id);
      const color = f >= 0.93 ? 'Moss' : f >= 0.8 ? 'Parchment' : 'Slate';
      s.wobblyLine([[c.x, y + 32], [c.x + Math.max(0.02, (f - 0.5) / 0.5) * 150, y + 32]], { color, width: 7, wobble: 0.3 });
      s.note(c.x, y + 2, c.fmt(c.get(id)), { size: 18, color });
    });
  });
  const pick = order[0];
  s.loop(200, top + order.indexOf(pick) * rowH + 18, 215, 30, { color: 'Red chalk', width: 2.5 });

  const nx = 1690;
  const n = (id) => at(id, 'two').skirmish.killAt;
  s.note(nx, top - 64, 'Verdict', { size: 26, color: 'Sepia' });
  s.note(nx, top - 24, [
    `• Default: Nashor's Tooth → Dusk and Dawn → Rabadon's, Sorcerer's Shoes. At item 2 it kills an ADC in ${n('ndr').toFixed(1)} s. On-hit builds need ${n('krt').toFixed(1)} to ${n('rbt').toFixed(1)} s. That gap is the mid-game.`,
    `• Nashor's before Dusk. Its 50% attack speed gives W more hits: +${((metric.one('ndr') / metric.one('dnr') - 1) * 100).toFixed(0)}% item 1 damage, same kill time. Dusk second still makes every spell an extra W hit.`,
    `• Into a frontline, or for the strongest early lane: Rageblade → Nashor's → Dusk. Best item 1 (${fmtInt(metric.one('rnd'))} damage) and the best 3-item teamfight short of Navori.`,
    `• Kraken → Rageblade → Terminus is the most damage over 8 s at items 2 and 3, and the safest duel. Fewest decisions, though.`,
    '• Every top path is close. A gap under ~10% here is a lean, not a result.',
  ].join('\n'), { size: 15, maxChars: 54 });
  s.note(0, top + order.length * rowH + 10, [
    'Each path buys with the same gold: 1,300 (first back), 3,500 (item 1, level 9), 7,400 (item 2, level 11), 10,600 (item 3, level 14), plus a Doran\'s.',
    `Damage = Q, E, R, R and one 8 s W on an enemy ADC with no defensive items. Tank = ${fmtInt(FRONTLINE.hp)} HP, ${FRONTLINE.armor} armor, ${FRONTLINE.mr} MR, 16 s with W recast.`,
    'Sorted by goal: first back + item 1 once, item 2 twice, item 3 once, skill ceiling once. Skill ceiling is a judgment (tab 5). Bars start at 50% of the best.',
  ].join('\n'), { size: 12, color: 'Slate' });
}

// =====================================================================
// Tab 2: first back and boots
// =====================================================================
s.tab('back');
const combos = [
  { inv: ["Doran's Bow", 'Recurve Bow', 'Dagger', 'Boots'], to: 'on-hit, any' },
  { inv: ["Doran's Bow", 'Recurve Bow', 'Amplifying Tome'], to: 'Rageblade' },
  { inv: ["Doran's Bow", 'Recurve Bow', 'Boots'], to: 'Kraken, Ruined King' },
  { inv: ["Doran's Bow", 'Pickaxe', 'Boots'], to: 'Rageblade, Ruined King' },
  { inv: ["Doran's Bow", 'Hearthbound Axe'], to: 'Terminus, Kraken' },
  { inv: ["Doran's Ring", 'Recurve Bow', 'Boots'], to: "Nashor's" },
  { inv: ["Doran's Ring", 'Blasting Wand', 'Amplifying Tome'], to: "Nashor's, Rabadon's" },
  { inv: ["Doran's Ring", 'Sheen', 'Dagger'], to: 'Dusk and Dawn' },
  { inv: ["Doran's Ring", 'Hextech Alternator'], to: 'Stormsurge, Shadowflame' },
];
{
  const top = 300;
  const rowH = 56;
  const rows = combos.map((c) => {
    const kog = kogAt(data, rd, 6, c.inv);
    const adc = enemyAt(rd, 6);
    return {
      ...c,
      cost: c.inv.slice(1).reduce((sum, n) => sum + I[n].cost, 0),
      trade: simulate(data, rd, kog, adc, { duration: 4, maxAutos: 4, casts: [{ t: 0, spell: 'q' }] }),
      sk: skirmish(data, rd, kog, adc),
      open: duel(data, rd, kog, 6, 0),
      ms: kog.ms,
    };
  });
  const bestTrade = Math.max(...rows.map((r) => r.trade.total));
  const bestSk = Math.max(...rows.map((r) => r.sk.total));
  s.note(0, top - 96, 'First back with ~1,300 gold, level 6', { size: 24 });
  s.note(0, top - 64, 'Q + 4 autos with W = a lane trade. 8 s = an all-in. Open field = a diver one item ahead dashes at you.', { size: 13, color: 'Slate' });
  const cx = [470, 660, 850, 1020];
  ['Lane trade', 'All-in, 8 s', 'Move speed', 'Diver dashes in (open field)'].forEach((l, k) => s.note(cx[k], top - 30, l, { size: 14, color: 'Slate' }));
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    r.inv.forEach((n, k) => s.image(k * 42, y, 36, 36, icon(n)));
    s.note(180, y + 2, r.inv.slice(1).map((n) => n.replace("Amplifying Tome", 'Tome').replace('Hextech Alternator', 'Alternator')).join(' + '), { size: 15 });
    s.note(180, y + 24, `${fmtInt(r.cost)} g · builds into ${r.to}`, { size: 11, color: 'Slate' });
    const ft = r.trade.total / bestTrade;
    const fs = r.sk.total / bestSk;
    const c1 = ft >= 0.97 ? 'Moss' : 'Parchment';
    const c2 = fs >= 0.97 ? 'Moss' : 'Parchment';
    s.note(cx[0], y + 6, `${fmtInt(r.trade.total)}`, { size: 18, color: c1 });
    s.note(cx[1], y + 6, `${fmtInt(r.sk.total)}`, { size: 18, color: c2 });
    s.note(cx[2], y + 6, `${fmtInt(r.ms)}`, { size: 18, color: r.ms > 350 ? 'Moss' : 'Slate' });
    const o = r.open;
    const sc = duelScore(o, DIVERS[6].hp);
    const txt = o.caughtAt === null ? 'never reaches you' : `reaches you at ${o.caughtAt.toFixed(1)} s${sc > 0 ? ', you win' : ''}`;
    s.note(cx[3], y + 6, txt, { size: 15, color: o.caughtAt === null || o.caughtAt > 5 ? 'Moss' : 'Red chalk' });
  });

  // Boots swap at item 2
  const bx = 1420;
  const swaps = ['ndr', 'rnd', 'krt'];
  const boots = ["Berserker's Greaves", "Sorcerer's Shoes", 'Gluttonous Greaves'];
  s.note(bx, top - 96, 'Which boots? (item 2, level 11)', { size: 24 });
  s.note(bx, top - 64, 'Same path, three boots. Kill time on an ADC / 16 s on a tank.', { size: 13, color: 'Slate' });
  boots.forEach((b, k) => {
    s.image(bx + 230 + k * 170, top - 34, 30, 30, icon(b));
    s.note(bx + 266 + k * 170, top - 30, short(b), { size: 13 });
  });
  swaps.forEach((id, i) => {
    const y = top + 20 + i * 70;
    pathIcons(bx, y, P[id], 28);
    s.note(bx, y + 34, pathLabel(P[id]), { size: 12, color: 'Slate' });
    const res = boots.map((b) => {
      const { inv } = inventory(data, { ...P[id], boots: b }, 7400);
      const kog = kogAt(data, rd, 11, inv);
      const sk = skirmish(data, rd, kog, enemyAt(rd, 11));
      const fr = simulate(data, rd, kog, FRONTLINE, {
        duration: 16, wRecast: true, autoCast: true,
        casts: [{ t: 0, spell: 'q' }, { t: 0.3, spell: 'e' }, { t: 1, spell: 'r' }, { t: 4, spell: 'r' }, { t: 8, spell: 'r' }, { t: 12, spell: 'r' }],
      });
      return { ttk: sk.killAt ?? 8, front: fr.total };
    });
    const bt = Math.min(...res.map((r) => r.ttk));
    res.forEach((r, k) => {
      s.note(bx + 230 + k * 170, y + 4, `${r.ttk.toFixed(1)} s`, { size: 18, color: r.ttk <= bt + 0.01 ? 'Moss' : 'Parchment' });
      s.note(bx + 230 + k * 170, y + 28, fmtInt(r.front), { size: 13, color: 'Slate' });
    });
  });
  const ny = top + 260;
  const rb = rows[0];
  const rt = rows[1];
  s.note(bx, ny, 'What it says', { size: 24, color: 'Sepia' });
  s.note(bx, ny + 38, [
    `• The first back barely changes damage: every option lands within ~${(100 - (Math.min(...rows.map((r) => r.sk.total)) / bestSk) * 100).toFixed(0)}% of the best all-in.`,
    `• Boots buy time. Without them the diver reaches you at ${rt.open.caughtAt?.toFixed(1)} s, with them at ${rb.open.caughtAt === null ? 'never' : `${rb.open.caughtAt.toFixed(1)} s`}, after your W is over. At level 6 a diver one item ahead still wins once he arrives, so that time is for your support, Flash or tower.`,
    '• Buy: Recurve Bow + Dagger + Boots (on-hit or Nashor\'s). Recurve Bow\'s 15 on-hit damage is the most pressure per gold, and every path below wants it.',
    '• Sorcerer\'s Shoes cut the item 2 kill time on every path: W, Q, E and R are all magic. Berserker\'s win longer fights. Gluttonous is the safe pick, not the aggressive one.',
  ].join('\n'), { size: 15, maxChars: 62 });
  s.note(0, top + rows.length * rowH + 14, [
    `Level 6 Kog (W rank 3) vs a level 6 enemy ADC. Diver at level 6: ${fmtInt(DIVERS[6].hp)} HP, ${DIVERS[6].ms} speed, dashes ${DIVERS[6].dash} at the start, then ${DIVERS[6].burst} burst and ${DIVERS[6].dps} damage per second once he reaches you.`,
    'Kog kites: stands only for his attack windup, then walks back. Stormraider\'s fires after 25% of the diver\'s HP in 3 s.',
  ].join('\n'), { size: 12, color: 'Slate' });
}

// =====================================================================
// Tab 3: item order, power curve
// =====================================================================
s.tab('order');
{
  const top = 330;
  const cw = 560;
  const ch = 320;
  const show = [
    { id: 'ndr', color: 'Moss' }, { id: 'rnd', color: '#d9b26a' }, { id: 'krt', color: 'Parchment' },
    { id: 'dsr', color: 'Slate' }, { id: 'rnt', color: '#9d7fb0' }, { id: 'brt', color: 'Red chalk' },
  ];
  const base = 'rbt';
  const chart = (x0, title, sub, valueOf, step, fmtY) => {
    const vals = show.flatMap((l) => CHECKPOINTS.map((cp) => valueOf(l.id, cp.id)));
    const lo = Math.floor(Math.min(...vals) / step) * step;
    const hi = Math.ceil(Math.max(...vals) / step) * step;
    const xOf = (i) => x0 + 60 + (i / (CHECKPOINTS.length - 1)) * (cw - 100);
    const yOf = (v) => top + ch - ((v - lo) / (hi - lo)) * ch;
    s.note(x0, top - 110, title, { size: 22 });
    s.note(x0, top - 80, sub, { size: 13, color: 'Slate' });
    for (let v = lo; v <= hi + 1e-9; v += step) {
      s.wobblyLine([[x0 + 60, yOf(v)], [x0 + cw - 30, yOf(v)]], { color: Math.abs(v) < 1e-9 ? 'Parchment' : '#3a352c', width: 1, wobble: 0.3 });
      s.note(x0, yOf(v) - 9, fmtY(v), { size: 12, color: 'Slate' });
    }
    CHECKPOINTS.forEach((cp, i) => s.note(xOf(i) - 36, top + ch + 10, `${cp.label}\nlevel ${cp.lvl}`, { size: 12, color: 'Slate' }));
    show.forEach((l) => {
      const pts = CHECKPOINTS.map((cp, i) => [xOf(i), yOf(valueOf(l.id, cp.id))]);
      s.wobblyLine(pts, { color: l.color, width: 3, wobble: 0.3 });
      pts.forEach(([x, y]) => s.loop(x, y, 4, 4, { color: l.color, width: 2 }));
    });
  };
  chart(0, 'Time to kill an enemy ADC', 'Seconds, lower is better. Same spells for every build.', (id, cp) => at(id, cp).skirmish.killAt ?? 8, 1, (v) => `${v} s`);
  chart(cw + 60, 'Damage in 8 s, vs the classic build', `Compared with ${pathLabel(P[base])}. Above the line = more.`, (id, cp) => (at(id, cp).skirmish.total / at(base, cp).skirmish.total - 1) * 100, 10, (v) => `${v > 0 ? '+' : ''}${v}%`);
  // legend under both charts
  show.forEach((l, i) => {
    const x = (i % 3) * 380;
    const y = top + ch + 60 + Math.floor(i / 3) * 28;
    s.wobblyLine([[x, y + 10], [x + 30, y + 10]], { color: l.color, width: 3 });
    s.note(x + 38, y, pathLabel(P[l.id]), { size: 14, color: l.color });
  });
  s.note(0, top + ch + 124, `Gold: first back 1,300 · item 1 3,500 · item 2 7,400 · item 3 10,600 (same for every path). Target: an enemy ADC of the same level, no defensive items.`, { size: 12, color: 'Slate' });

  const nx = 1300;
  const o = (id) => at(id, 'one').skirmish.total;
  const t2 = (id) => at(id, 'two').skirmish.total;
  s.note(nx, top - 110, 'Item order lessons', { size: 24, color: 'Sepia' });
  s.note(nx, top - 72, [
    `• Rageblade first, not Ruined King: ${pct((o('rbt') / o('brt') - 1) * 100)} item 1 damage. Ruined King is a second item for duels and tanks.`,
    `• Nashor's before Dusk: ${pct((o('ndr') / o('dnr') - 1) * 100)} at item 1. Same story in the hybrid: Rageblade → Nashor's beats Rageblade → Dusk at item 2 (${fmtInt(t2('rnd'))} vs ${fmtInt(t2('rdn'))}).`,
    `• Navori third, not second. Second it is the weakest item 2 (${fmtInt(t2('rnt'))} vs ${fmtInt(t2('rtb'))} for Terminus). Third it wins long fights: W is back almost the moment it ends (${fmtInt(metric.front('rnt'))} on the tank, the most of any path).`,
    `• Shadowflame second gives the fastest item 2 kill (${at('dsr', 'two').skirmish.killAt.toFixed(1)} s) and the weakest teamfight (${fmtInt(metric.front('dsr'))} on the tank). Into five squishies only.`,
    `• Rabadon's costs 3,500: it lands later than any other third item. With Shadowflame first it was not done by level 14.`,
    `• Lich Bane and Stormsurge first are the weakest item 1s (${fmtInt(o('lnr'))} and ${fmtInt(o('snr'))}). No attack speed, and Kog's damage is in his autos.`,
  ].join('\n'), { size: 15, maxChars: 60 });
}

// =====================================================================
// Tab 4: mid-game duel
// =====================================================================
s.tab('duel');
{
  const top = 300;
  const rowH = 46;
  const cx = [420, 700, 980, 1260];
  s.note(0, top - 100, 'A fed diver dashes at you: who dies first?', { size: 24 });
  s.note(0, top - 70, `Diver one item ahead. Level 9: ${fmtInt(DIVERS[9].hp)} HP, ${DIVERS[9].armor} armor. Level 11: ${fmtInt(DIVERS[11].hp)} HP, ${DIVERS[11].armor} armor. Dash ${DIVERS[11].dash}, then burst + steady damage.`, { size: 13, color: 'Slate' });
  ['Item 1, open field', 'Item 1, you slowed 30%', 'Item 2, open field', 'Item 2, you slowed 30%'].forEach((l, k) => s.note(cx[k], top - 34, l, { size: 14 }));
  order.forEach((id, i) => {
    const y = top + i * rowH;
    pathIcons(0, y, P[id], 30);
    s.note(150, y + 6, pathLabel(P[id]), { size: 15 });
    [[at(id, 'one').duelOpen, 9], [at(id, 'one').duelSlow, 9], [at(id, 'two').duelOpen, 11], [at(id, 'two').duelSlow, 11]].forEach(([r, lvl], k) => {
      const d = duelText(r, DIVERS[lvl].hp);
      s.note(cx[k], y + 6, d.text, { size: 14, color: d.color });
    });
  });
  const nx = 1560;
  const lost1 = order.filter((id) => duelScore(at(id, 'one').duelSlow, DIVERS[9].hp) <= 0).length;
  const won2 = order.filter((id) => duelScore(at(id, 'two').duelSlow, DIVERS[11].hp) > 0).length;
  s.note(nx, top - 100, 'What it says', { size: 24, color: 'Sepia' });
  s.note(nx, top - 62, [
    `• Item 1 is the danger zone. Slowed, ${lost1} of ${order.length} paths die to a fed diver. Respect divers until item 2.`,
    `• Item 2 flips it: ${won2} of ${order.length} paths win slowed. Most never get reached, because Stormraider's fires mid-chase and you outrun him.`,
    "• Items with move speed (Lich Bane, Stormsurge, Kraken) stack with Stormraider's. So does Ruined King's slow on every third hit.",
    "• Dusk and Dawn's 300 HP and heals are the only real buffer on a damage path. Wit's End is the swap into a magic diver.",
    '• Limits: the diver has one dash and no knock-up. Real assassins (Syndra, Qiyana, Yone) skip the chase: see the "carry into fed assassins" page.',
  ].join('\n'), { size: 15, maxChars: 52 });
  s.note(0, top + order.length * rowH + 14, [
    `Diver after reaching you: ${DIVERS[11].burst} burst then ${DIVERS[11].dps} damage per second at level 11 (60% physical), against Kog's armor and MR. Kog keeps attacking; his heals count.`,
    'Each build uses its best spell timing (front-loaded or spaced for Spellblade). "wins, X% HP left" = Kog\'s HP when the diver dies.',
  ].join('\n'), { size: 12, color: 'Slate' });
}

// =====================================================================
// Tab 5: build paths
// =====================================================================
s.tab('paths');
{
  const top = 300;
  const colW = 660;
  const pages = [
    {
      title: 'A · Spellblade AP (default)',
      when: 'Most games. Squishy enemies, skirmishes from item 2 on.',
      steps: ["Doran's Ring", 'Recurve Bow', 'Dagger', 'Boots', "Nashor's Tooth", "Sorcerer's Shoes", 'Dusk and Dawn', "Rabadon's Deathcap"],
      id: 'ndr',
      why: [
        `Kills an ADC in ${at('ndr', 'two').skirmish.killAt.toFixed(1)} s at item 2, the fastest of the full builds that also hold up in teamfights.`,
        "Nashor's first: attack speed and on-hit for W. Dusk second: every spell becomes another W hit and a heal.",
        'Skill: weave a spell before an auto every 1.5 s for Spellblade, and choose burst (Q E R at once) or spaced spells per fight.',
        'Rabadon\'s third: +30% AP on everything. Late: Shadowflame or Void Staff.',
      ],
    },
    {
      title: 'B · Hybrid on-hit',
      when: 'A frontline to chew through, or a lane you want to win at level 9.',
      steps: ["Doran's Bow", 'Recurve Bow', 'Amplifying Tome', "Guinsoo's Rageblade", "Berserker's Greaves", "Nashor's Tooth", 'Dusk and Dawn'],
      id: 'rnd',
      why: [
        `Best item 1 (${fmtInt(metric.one('rnd'))} damage in 8 s) and ${fmtInt(metric.front('rnd'))} on the tank at item 3.`,
        'Rageblade\'s phantom hit, Dusk\'s second on-hit and Nashor\'s AP all multiply W\'s % HP damage.',
        'Swap Berserker\'s for Sorcerer\'s when the enemy is squishy: faster kills, less sustained damage.',
        'Late: Terminus, then Navori for near-permanent W.',
      ],
    },
    {
      title: 'C · Duelist on-hit',
      when: 'Divers and bruisers who walk at you. The simplest to play.',
      steps: ["Doran's Bow", 'Recurve Bow', 'Dagger', 'Boots', 'Kraken Slayer', "Berserker's Greaves", "Guinsoo's Rageblade", 'Terminus'],
      id: 'krt',
      why: [
        `Most damage over 8 s at items 2 and 3 (${fmtInt(t2c('krt'))} at item 2). Wins every slowed duel at item 2 here.`,
        'Kraken\'s every-third-hit burst grows on low targets, and its move speed stacks with Stormraider\'s.',
        'Lower ceiling: mostly stand and hit. Time Kraken\'s third hit for the finish.',
        'Late: Navori, then Wit\'s End or a defensive item.',
      ],
    },
  ];
  function t2c(id) { return at(id, 'two').skirmish.total; }
  pages.forEach((p, i) => {
    const x = i * colW;
    s.note(x, top - 70, p.title, { size: 26, color: i === 0 ? 'Moss' : 'Parchment' });
    s.note(x, top - 34, p.when, { size: 13, color: 'Slate', maxChars: 76 });
    // build order: row of icons with arrows; parts drawn smaller
    let cx = x;
    const majors = new Set([...P[p.id].items, P[p.id].boots, P[p.id].starter]);
    p.steps.forEach((name, k) => {
      const sz = majors.has(name) ? 52 : 34;
      s.image(cx, top + 10 + (52 - sz) / 2, sz, sz, icon(name));
      cx += sz + 6;
      if (k < p.steps.length - 1) {
        s.note(cx - 2, top + 22, '›', { size: 20, color: 'Slate' });
        cx += 14;
      }
    });
    s.note(x, top + 74, 'Doran\'s · first back (small icons) · item 1 · boots · item 2 · item 3', { size: 11, color: 'Slate' });
    // ceiling dots + key numbers
    const r = ev[p.id].at;
    s.note(x, top + 104, `Skill ceiling ${'●'.repeat(ceiling[p.id])}${'○'.repeat(5 - ceiling[p.id])}`, { size: 16, color: 'Sepia' });
    s.note(x, top + 130, `Item 1: ${fmtInt(r.one.skirmish.total)} damage in 8 s\nItem 2: an ADC dead in ${r.two.skirmish.killAt.toFixed(1)} s\nItem 3: ${fmtInt(r.three.front.total)} on the tank in 16 s`, { size: 13, color: 'Slate' });
    s.wobblyLine([[x, top + 192], [x + colW - 60, top + 190]], { color: 'Sepia', width: 1 });
    s.note(x, top + 206, p.why.map((w) => `• ${w}`).join('\n'), { size: 14, maxChars: 60 });
  });
  // runes reminder
  const ry = top + 470;
  s.image(0, ry, 44, 44, runeIcon("Stormraider's Surge"));
  s.note(56, ry, "All three assume the runes page's default:\nStormraider's Surge, Manaflow, Transcendence, Scorch;\nLegend: Alacrity, Coup de Grace.", { size: 14 });
  s.note(700, ry, 'Defensive swaps: Wit\'s End into magic divers,\nMercurial or Banshee\'s into one key CC spell,\nJak\'Sho when you are the target.\nSee the "carry into fed assassins" page.', { size: 14, color: 'Slate' });
  s.note(0, ry + 90, [
    'Skill ceiling judgments: Spellblade paths 4 to 5 (spell-auto weaving, burst vs spaced, R mana).',
    'Kraken, Ruined King and Navori 3 (count hits, use the slow, spend the resets). Stormsurge 3 (hit the 25% threshold).',
    'Rageblade, Terminus and Wit\'s End 2 (stand and hit).',
  ].join('\n'), { size: 12, color: 'Slate' });
}

// =====================================================================
// Tab 6: context
// =====================================================================
s.tab('context');
{
  const top = 300;
  const c = data.context;
  s.note(0, top - 100, 'Legendary items · coachless, NA Diamond+, patch 16.21 (2,036 games)', { size: 22 });
  s.note(0, top - 70, 'Context only. WPA = win rate minus the win chance when the item was bought. Bar = buys. Noise on ~500 buys is about ±4 points.', { size: 13, color: 'Slate' });
  const items = Object.entries(c.coachlessNaD.items).sort((a, b) => b[1][1] - a[1][1]);
  const maxBuys = Math.max(...items.map(([, v]) => v[1]));
  items.forEach(([name, [wpa, buys]], i) => {
    const y = top + i * 44;
    s.image(0, y, 34, 34, icon(name));
    s.note(44, y + 6, short(name), { size: 16 });
    s.wobblyLine([[200, y + 17], [200 + (buys / maxBuys) * 260, y + 17]], { color: 'Sepia', width: 10, wobble: 0.3 });
    s.note(210 + (buys / maxBuys) * 260, y + 6, `${fmtInt(buys)} buys`, { size: 13, color: 'Slate' });
    const noise = 100 * 1.96 * Math.sqrt(0.25 / buys);
    s.note(600, y + 6, `${wpa >= 0 ? '+' : ''}${wpa.toFixed(2)} WPA`, { size: 16, color: Math.abs(wpa) > noise ? (wpa > 0 ? 'Moss' : 'Red chalk') : 'Parchment' });
    s.note(730, y + 8, `±${noise.toFixed(1)}`, { size: 12, color: 'Slate' });
  });
  const ux = 900;
  s.note(ux, top - 100, 'AP vs on-hit build · u.gg, NA, patch 26.21', { size: 22 });
  s.note(ux, top - 70, 'Share of games by finished build variant. Buckets overlap.', { size: 13, color: 'Slate' });
  Object.entries(c.uggNa.ranks).forEach(([rank, v], i) => {
    const y = top + i * 64;
    const both = v.ap[0] + v.onhit[0];
    const apShare = v.ap[0] / both;
    s.note(ux, y, `${rank} · ${fmtInt(v.total)} games`, { size: 15 });
    s.wobblyLine([[ux, y + 34], [ux + apShare * 360, y + 34]], { color: 'Moss', width: 12, wobble: 0.3 });
    s.wobblyLine([[ux + apShare * 360 + 4, y + 34], [ux + 364, y + 34]], { color: 'Sepia', width: 12, wobble: 0.3 });
    s.note(ux + 376, y + 22, `AP ${(apShare * 100).toFixed(0)}% · on-hit ${((1 - apShare) * 100).toFixed(0)}%`, { size: 14 });
  });
  s.note(ux, top + 270, `Most common cores.\nAP: ${c.uggNa.cores.ap}.\nOn-hit: ${c.uggNa.cores.onhit}.`, { size: 13, color: 'Slate' });
  const nx = 1560;
  s.note(nx, top - 100, 'What it says', { size: 24, color: 'Sepia' });
  s.note(nx, top - 62, [
    '• The higher the rank, the more AP: about 30% of AP-or-on-hit games at All ranks, 86% in NA Challenger. The model\'s mid-game kill times point the same way.',
    '• Dusk and Dawn has the best WPA among the big items (+1.39 on 822 buys), but inside the noise. Terminus and Rabadon\'s lean positive too.',
    '• Ruined King leans negative (-3.27 on 452 buys, noise ±4.6). It is often bought from behind. The model also rates it a weak first item.',
    '• No stat here can say Nashor\'s before Dusk; the u.gg AP core is Dusk first. That call is the model\'s, at a ~10% edge.',
    '• Patch 16.22 was too young (705 NA Diamond+ Kog games on u.gg). Numbers above are copied from the "carry into fed assassins" page.',
  ].join('\n'), { size: 15, maxChars: 52 });
}

const out = s.page({
  title: "Kog'Maw ADC: items for aggression",
  source: { numbers: data.wiki.source, stats: 'coachless.gg and u.gg, patch 16.21 (see data file)', model: 'tools/kogmaw-item-model.mjs', pulledAt: data.pulledAt },
  tabs,
  activeTab: 'score',
});
await writeFile(`${ROOT}library/kogmaw-adc-items-aggro.json`, JSON.stringify(out, null, 1) + '\n');
console.log(`wrote library/kogmaw-adc-items-aggro.json (${out.page.items.length} items)`);
console.log('order:', order.map((id) => `${id} ${scores[id].total.toFixed(2)}`).join(', '));
