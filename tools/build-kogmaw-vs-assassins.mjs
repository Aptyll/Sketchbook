// Builds the "Kog'Maw ADC: carry into fed assassins" library page from
// data/kogmaw-adc-vs-assassins.json. Re-run after refreshing the numbers:
//   node tools/build-kogmaw-vs-assassins.mjs
//
// One question (how does a behind Kog'Maw still carry into Syndra, Qiyana, Yone?),
// five tabs: the range gap, cooldown windows, AP and on-hit builds, what the stats
// can and cannot say, and a game plan.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sketch } from './sketch.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const data = JSON.parse(await readFile(`${ROOT}data/kogmaw-adc-vs-assassins.json`, 'utf8'));
const s = sketch({ seed: 4096 });
const { kog, threats, coachless, ugg, items, runes, summoners, icons } = data;

const fmtK = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(Math.round(n)));
const sign = (n, d = 1) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(d)}`;
const pct = (n, d = 1) => `${n.toFixed(d)}%`;
// 95% margin for a rate from n games, in percentage points (binomial only).
const margin = (n) => 1.96 * Math.sqrt(0.25 / n) * 100;
const itemIcon = (name) => `${icons.item}${items[name].id}.png`;
const spellIcon = (file) => `${icons.spell}${file}`;
const champIcon = (file) => `${icons.champion}${file}`;
const runeIcon = (name) => `${icons.rune}${runes[name].icon}`;
const kogW = kog.ranges.find((r) => r.key === 'w').range;

// ---- Shared by every tab ----
s.tab(null);
s.note(0, 0, `${data.champion} ${data.role} · carry from behind into fed assassins`, { size: 40 });
s.wobblyLine([[4, 60], [940, 56]], { color: 'Red chalk', width: 2.5 });
s.image(0, 84, 56, 56, champIcon(kog.icon));
threats.forEach((t, i) => s.image(110 + i * 64, 84, 56, 56, champIcon(t.icon)));
s.note(80, 98, 'vs', { size: 18, color: 'Sepia' });
s.note(330, 76, [
  'Team behind. Syndra, Qiyana and Yone fed. How does Kog still 1v9?',
  `Ranges and cooldowns: LoL wiki, pulled ${data.pulledAt}.`,
  `Stats: coachless.gg ${data.patch.coachless} and u.gg ${data.patch.ugg},`,
  `NA where the sample allows. Icons: Data Dragon ${data.patch.dataDragon}.`,
].join('\n'), { size: 15, color: 'Sepia' });

const views = [
  { id: 'range', label: '1 · The range gap' },
  { id: 'windows', label: '2 · Fight windows' },
  { id: 'builds', label: '3 · AP and on-hit builds' },
  { id: 'data', label: '4 · What the stats say' },
  { id: 'plan', label: '5 · Game plan' },
];

// =====================================================================
// Tab 1: how far each side reaches
// =====================================================================
s.tab('range');
{
  const top = 250;
  const x0 = 300;
  const k = 0.55; // world units per game unit
  const rowH = 40;
  const xOf = (u) => x0 + u * k;
  const rows = [];
  rows.push({ head: 'Kog\'Maw', icon: champIcon(kog.icon) });
  for (const r of kog.ranges) rows.push({ ...r, side: 'kog' });
  for (const t of threats) {
    rows.push({ head: t.name, icon: champIcon(t.icon), gap: true });
    const maxCC = Math.max(...t.reach.filter((r) => r.cc).map((r) => r.range));
    for (const r of t.reach) rows.push({ ...r, side: 'enemy', flash: r.range === maxCC ? t.flash : 0 });
  }
  let y = top;
  const placed = rows.map((r) => {
    if (r.head && r.gap) y += 18;
    const out = { ...r, y };
    y += r.head ? 34 : rowH;
    return out;
  });
  const bottom = y + 6;

  // Axis and guides.
  s.wobblyLine([[xOf(0), bottom], [xOf(1800), bottom]], { color: 'Parchment', width: 1 });
  for (let u = 0; u <= 1800; u += 300) {
    s.wobblyLine([[xOf(u), bottom], [xOf(u), bottom + 10]], { color: 'Parchment', width: 1 });
    s.note(xOf(u) - 14, bottom + 14, String(u), { size: 12, color: 'Slate' });
  }
  s.note(xOf(1800) + 16, bottom + 14, 'units', { size: 12, color: 'Slate' });
  s.wobblyLine([[xOf(kogW), top - 36], [xOf(kogW), bottom]], { color: 'Moss', width: 1.6 });
  s.note(xOf(kogW) + 6, top - 50, `your damage stops at ${kogW}`, { size: 14, color: 'Moss' });

  for (const r of placed) {
    if (r.head) {
      s.image(0, r.y - 4, 30, 30, r.icon);
      s.note(40, r.y - 2, r.head, { size: 20, color: r.side === 'kog' || r.head === 'Kog\'Maw' ? 'Moss' : 'Red chalk' });
      continue;
    }
    if (r.icon) s.image(40, r.y - 3, 24, 24, r.side === 'kog' ? spellIcon(r.icon) : spellIcon(r.icon));
    s.note(72, r.y - 1, r.label, { size: 13, color: r.cc ? 'Parchment' : 'Sepia' });
    const color = r.side === 'kog' ? 'Moss' : r.cc ? 'Red chalk' : 'Sepia';
    const cy = r.y + 9;
    s.wobblyLine([[xOf(0), cy], [xOf(r.range), cy]], { color, width: r.side === 'kog' || r.cc ? 9 : 5, wobble: 0.3 });
    if (r.from) s.wobblyLine([[xOf(r.from), cy - 9], [xOf(r.from), cy + 9]], { color: 'Parchment', width: 1.5 });
    for (const st of r.steps ?? []) s.wobblyLine([[xOf(st), cy - 7], [xOf(st), cy + 7]], { color: 'Parchment', width: 1.2 });
    s.note(xOf(r.range) + 8, cy - 10, String(r.range), { size: 14, color });
    if (r.flash) {
      s.wobblyLine([[xOf(r.range) + 46, cy], [xOf(r.range + r.flash), cy]], { color: 'Red chalk', width: 1.5 });
      s.note(xOf(r.range + r.flash) + 6, cy - 10, `${r.range + r.flash} with Flash`, { size: 12, color: 'Slate' });
    }
  }
  s.note(x0, bottom + 40, [
    'Bars start at the caster. Red = starts their lockdown (CC).',
    'Sepia = damage only. Ticks: W rank 1, R ranks 1 / 2 / 3.',
    'Centre to centre; hitboxes add ~65 units on each side.',
  ].join('\n'), { size: 12, color: 'Slate' });

  const gaps = threats.map((t) => ({ t, g: Math.max(...t.reach.filter((r) => r.cc).map((r) => r.range)) - kogW }));
  const nx = xOf(1800) + 150;
  s.note(nx, top - 50, 'What it says', { size: 24, color: 'Sepia' });
  s.note(nx, top - 12, [
    `• Every one of them can start a lockdown from further away than you can shoot back: ${gaps.map((g) => `${g.t.name} +${g.g}`).join(', ')} units past your W range, before Flash.`,
    '• So you cannot win by out-ranging them. Kiting alone loses.',
    '• You win by making their start point cost something. To lock you down they must first get within 875 to 1,300 units of you. Put your frontline and support about 600 ahead and that spot is inside your team\'s range.',
    `• Your long tools are for scouting and zoning, not killing: E (${kog.ranges.find((r) => r.key === 'e').range}, slow) and R (up to ${kog.r.range[2]}, gives sight and reveals for 2 s) reach further than any of their engages.`,
    '• Syndra is the odd one: she does not need to walk in. Her Q then E stun hits from 1,300 behind her own team. Against her, standing behind a minion wave or a wall matters more than standing behind your team.',
  ].join('\n'), { size: 15, maxChars: 50 });

  // A side view of a good standing spot.
  const dy = bottom + 150;
  const sx = (u) => x0 + u * k;
  s.note(0, dy - 30, 'Where to stand', { size: 22, color: 'Sepia' });
  s.wobblyLine([[sx(0), dy + 40], [sx(1800), dy + 40]], { color: '#3a352c', width: 1 });
  const dot = (u, label, color, size = 10) => {
    s.loop(sx(u), dy + 40, size, size, { color, width: 2.5 });
    s.note(sx(u) - 30, dy + 58, label, { size: 13, color });
  };
  dot(0, 'Kog\'Maw', 'Moss');
  dot(300, 'support', 'Slate');
  dot(650, 'frontline', 'Slate', 14);
  dot(1300, 'assassin\nmust start here', 'Red chalk', 12);
  s.arrow([[sx(1300), dy + 20], [sx(700), dy + 4]], { color: 'Red chalk', width: 2 });
  s.wobblyLine([[sx(650), dy + 30], [sx(1300), dy + 30]], { color: 'Moss', width: 1, wobble: 1.2 });
  s.note(sx(760), dy - 30, 'he has to pass your team first', { size: 13, color: 'Moss' });
}

// =====================================================================
// Tab 2: cooldown windows
// =====================================================================
s.tab('windows');
{
  const top = 300;
  const x0 = 330;
  const k = 7.5; // world units per second
  const xOf = (sec) => x0 + sec * k;
  const rowH = 64;
  const rows = [
    { t: 'syndra', label: 'E Scatter the Weak (her stun)', icon: 'SyndraE.png', cds: threats[0].keyCC.cooldown },
    { t: 'syndra', label: 'R Unleashed Power (her burst)', icon: 'SyndraR.png', cds: threats[0].ult.cooldown },
    { t: 'qiyana', label: 'E Audacity (her gap close)', icon: 'QiyanaE.png', cds: threats[1].eCooldown },
    { t: 'qiyana', label: 'R Supreme Display (her stun)', icon: 'QiyanaR.png', cds: threats[1].ult.cooldown },
    { t: 'yone', label: 'E Soul Unbound (his gap close)', icon: 'YoneE.png', cds: threats[2].eCooldown },
    { t: 'yone', label: 'R Fate Sealed (his stun)', icon: 'YoneR.png', cds: threats[2].ult.cooldown },
  ];
  const end = 125;
  const bottom = top + rows.length * rowH + rowH + 10;
  s.note(0, top - 70, 'After they use it, how long until it is back?', { size: 24 });
  s.note(0, top - 38, 'Base cooldowns, LoL wiki, no ability haste.\nThick bar = max rank, thin line = rank 1.', { size: 14, color: 'Slate' });
  s.wobblyLine([[xOf(0), bottom], [xOf(end), bottom]], { color: 'Parchment', width: 1 });
  for (let t = 0; t <= 120; t += 15) {
    s.wobblyLine([[xOf(t), bottom], [xOf(t), bottom + 10]], { color: 'Parchment', width: 1 });
    s.note(xOf(t) - 8, bottom + 14, `${t}`, { size: 12, color: 'Slate' });
  }
  s.note(xOf(end) + 8, bottom + 14, 'seconds', { size: 12, color: 'Slate' });

  rows.forEach((r, i) => {
    const y = top + i * rowH;
    s.image(0, y, 40, 40, spellIcon(r.icon));
    s.note(52, y + 6, r.label, { size: 14 });
    const lo = Math.min(...r.cds);
    const hi = Math.max(...r.cds);
    const cy = y + 18;
    s.wobblyLine([[xOf(0), cy], [xOf(lo), cy]], { color: 'Red chalk', width: 12, wobble: 0.3 });
    if (hi > lo) s.wobblyLine([[xOf(lo), cy], [xOf(hi), cy]], { color: 'Red chalk', width: 2.5, wobble: 0.3 });
    s.note(xOf(hi) + 10, cy - 10, hi > lo ? `${lo} to ${hi} s` : `${lo} s`, { size: 15, color: 'Red chalk' });
  });
  // Kog's W cycle.
  const wy = top + rows.length * rowH;
  s.image(0, wy, 40, 40, spellIcon('KogMawBioArcaneBarrage.png'));
  s.note(52, wy + 6, `Your W: ${kog.w.duration} s on, ${kog.w.cooldown} s cooldown`, { size: 14, color: 'Moss' });
  for (let t = 0; t < end; t += kog.w.cooldown) {
    s.wobblyLine([[xOf(t), wy + 18], [xOf(Math.min(end, t + kog.w.duration)), wy + 18]], { color: 'Moss', width: 12, wobble: 0.3 });
  }

  const nx = xOf(end) + 110;
  s.note(nx, top - 70, 'What it says', { size: 24, color: 'Sepia' });
  s.note(nx, top - 32, [
    '• Each of them has one or two buttons that decide the fight. Once a stun button is spent, they are a squishy melee or short-range mage for a while, and you out-damage that.',
    '• Ults are the big window: 80 to 120 s. If Yone or Qiyana ults your frontline, that is your fight, not a reason to run.',
    '• Short windows matter too: Syndra\'s E is down for 15 s, Yone\'s E for 10 to 22 s. Walk up only right after you see it used.',
    `• Your W is down ${kog.w.cooldown - kog.w.duration} of every ${kog.w.cooldown} s. Never show yourself with W on cooldown; it is your whole range and half your damage.`,
    '• Fed does not change cooldowns. It changes how fast they kill you, so the rule gets stricter, not different.',
  ].join('\n'), { size: 15, maxChars: 50 });
}

// =====================================================================
// Tab 3: AP and on-hit builds into these three
// =====================================================================
s.tab('builds');
{
  const top = 270;
  const W = coachless.legendaries['world-d'];
  const N = coachless.legendaries['na-d'];
  const Bw = coachless.boots['world-d'];
  const dataLine = (name, table = W, tableNa = N) => {
    const w = table[name];
    const n = tableNa?.[name];
    const parts = [];
    if (n) parts.push(`NA D+ ${sign(n[0], 1)} ±${margin(n[1]).toFixed(1)} (${fmtK(n[1])})`);
    if (w) parts.push(`World D+ ${sign(w[0], 1)} ±${margin(w[1]).toFixed(1)} (${fmtK(w[1])})`);
    return parts.length ? `WPA ${parts.join(' · ')}` : 'not in coachless\'s table';
  };
  // Marks: how well each answer handles each threat's lockdown (my read of the CC types).
  const markColor = { yes: 'Moss', half: 'Sepia', no: 'Red chalk' };
  const markText = { yes: 'good', half: 'partly', no: 'no' };
  const card = (x, y, icon, title, why, marks, dl) => {
    s.image(x, y, 52, 52, icon);
    s.note(x + 64, y - 6, title, { size: 20 });
    s.note(x + 64, y + 22, why, { size: 13, color: 'Sepia', maxChars: 58 });
    marks.forEach((m, i) => {
      s.note(x + 520 + i * 74, y + 4, markText[m], { size: 14, color: markColor[m] });
    });
    s.note(x + 64, y + 80, dl, { size: 12, color: 'Slate', maxChars: 64 });
  };
  const header = (x, y) => threats.forEach((t, i) => s.image(x + 526 + i * 74, y, 30, 30, champIcon(t.icon)));

  const plans = [
    {
      x: 0, title: 'AP Kog\'Maw', color: 'Red chalk',
      core: ['Dusk and Dawn', "Sorcerer's Shoes", 'Shadowflame'],
      coreNote: `u.gg NA core (${ugg.cores.ap}). Plays from R range.`,
      picks: [
        { name: "Zhonya's Hourglass", why: 'Stasis after their CC ends, or as Syndra\'s R starts. Their follow-up hits nothing and your team gets 2.5 s to turn on them. Best into Yone and Qiyana.', marks: ['yes', 'half', 'half'] },
        { name: "Banshee's Veil", why: 'Blocks one whole ability. Strong when one spell is the whole threat (Syndra\'s Q then E, her R). Weak into Yone and Qiyana, whose Q pops it first.', marks: ['yes', 'half', 'half'] },
        { name: 'Void Staff', why: 'Not defense. If they stack MR to survive your R, this is how you kill them first. Kill speed is also safety.', marks: ['no', 'no', 'no'], plain: true },
      ],
    },
    {
      x: 900, title: 'On-hit Kog\'Maw', color: 'Moss',
      core: ["Guinsoo's Rageblade", 'Gluttonous Greaves', 'Navori Flickerblade'],
      coreNote: `u.gg NA core (${ugg.cores.onhit}). Plays from W range.`,
      picks: [
        { name: "Wit's End", why: 'Still a damage item: attack speed and on-hit, plus 45 MR and 20% tenacity. The best answer to Syndra and to Yone\'s magic half.', marks: ['yes', 'half', 'half'] },
        { name: 'Guardian Angel', why: 'A second life when they jump you. Good if your team can punish the 4 s revive; useless if 4 of them wait for it.', marks: ['half', 'half', 'half'] },
        { name: 'Mercurial Scimitar', why: 'All three lock you with a knock-up first (airborne), which Quicksilver cannot remove. It only clears the stun after it. Rarely worth it here.', marks: ['half', 'half', 'half'] },
      ],
    },
  ];
  for (const p of plans) {
    s.note(p.x, top - 60, p.title, { size: 30, color: p.color });
    p.core.forEach((n, i) => s.image(p.x + i * 60, top - 14, 48, 48, itemIcon(n)));
    s.note(p.x + 196, top - 8, p.coreNote, { size: 13, color: 'Slate', maxChars: 44 });
    s.note(p.x, top + 52, 'Into Syndra · Qiyana · Yone, add:', { size: 16, color: 'Sepia' });
    header(p.x, top + 46);
    p.picks.forEach((pk, i) => {
      const y = top + 110 + i * 140;
      if (pk.plain) {
        s.image(p.x, y, 52, 52, itemIcon(pk.name));
        s.note(p.x + 64, y - 6, pk.name, { size: 20 });
        s.note(p.x + 64, y + 22, pk.why, { size: 13, color: 'Sepia', maxChars: 58 });
        s.note(p.x + 64, y + 80, dataLine(pk.name), { size: 12, color: 'Slate', maxChars: 64 });
      } else {
        card(p.x, y, itemIcon(pk.name), pk.name, pk.why, pk.marks, dataLine(pk.name));
      }
    });
  }

  // Shared answers: boots, runes, summoners.
  const sy = top + 560;
  s.note(0, sy - 20, 'Either build', { size: 26, color: 'Sepia' });
  header(0, sy - 26);
  const R = coachless.resolveRunes['world-d'];
  const Sp = coachless.spells['world-d'];
  const shared = [
    { icon: runeIcon('Bone Plating'), title: 'Bone Plating (Resolve secondary)', why: 'Takes 30 to 60 off each of their next 3 hits. Yone and Qiyana combos are many small hits; Syndra\'s is a few big ones.', marks: ['half', 'yes', 'yes'], dl: `WPA World D+ ${sign(R['Bone Plating'][0], 1)} ±${margin(R['Bone Plating'][1]).toFixed(1)} (${fmtK(R['Bone Plating'][1])}). NA: under threshold.` },
    { icon: spellIcon(summoners.Barrier), title: 'Barrier over Cleanse', why: 'Barrier works on any damage, including during a knock-up. Cleanse, like Quicksilver, cannot remove the airborne part.', marks: ['yes', 'yes', 'yes'], dl: `WPA World D+ Barrier ${sign(Sp.Barrier[0], 2)} ±${margin(Sp.Barrier[1]).toFixed(1)} (${fmtK(Sp.Barrier[1])}) · Cleanse ${sign(Sp.Cleanse[0], 2)} ±${margin(Sp.Cleanse[1]).toFixed(1)} (${fmtK(Sp.Cleanse[1])}). Picked before the game, not vs these.` },
    { icon: itemIcon('Gluttonous Greaves'), title: 'Gluttonous Greaves (or Mercury\'s)', why: 'Omnivamp keeps you alive through poke and grows with takedowns. Mercury\'s 30% tenacity only shortens stuns, not knock-ups.', marks: ['half', 'half', 'half'], dl: `WPA World D+ Gluttonous ${sign(Bw['Gluttonous Greaves'][0], 2)} ±${margin(Bw['Gluttonous Greaves'][1]).toFixed(1)} (${fmtK(Bw['Gluttonous Greaves'][1])}) · Mercury's ${sign(Bw["Mercury's Treads"][0], 2)} ±${margin(Bw["Mercury's Treads"][1]).toFixed(1)} (${fmtK(Bw["Mercury's Treads"][1])})` },
  ];
  shared.forEach((c, i) => card(0, sy + 40 + i * 150, c.icon, c.title, c.why, c.marks, c.dl));

  const nx = 900;
  s.note(nx, sy - 20, 'How to read this', { size: 24, color: 'Sepia' });
  s.note(nx, sy + 18, [
    '• good / partly / no is my read of the CC types on the LoL wiki, not a measurement. All three lock you with airborne first: Syndra\'s E knock-back, Qiyana\'s R knock-back, Yone\'s Q3 and R knock-up. Nothing removes airborne.',
    '• That is why the answers here are stasis, a spell shield, a second life, shields and resists, and not Quicksilver or Cleanse.',
    '• Buy one answer, not three. A behind Kog that builds only defense survives and then cannot kill anyone. Third or fourth item is usually the slot.',
    '• Grey lines: coachless WPA, patch 16.21, ± = rough 95% noise from the game count. Most are inside their noise. Tab 4 has the details.',
  ].join('\n'), { size: 15, maxChars: 56 });
}

// =====================================================================
// Tab 4: what the stats can and cannot say
// =====================================================================
s.tab('data');
{
  const top = 330;
  const rowH = 46;
  const x0 = 330;
  const plotW = 420;
  const lo = -12;
  const hi = 12;
  const xOf = (w) => x0 + ((Math.min(hi, Math.max(lo, w)) - lo) / (hi - lo)) * plotW;
  const W = coachless.legendaries['world-d'];
  const N = coachless.legendaries['na-d'];
  const rows = [
    { name: "Banshee's Veil", icon: itemIcon("Banshee's Veil"), w: W["Banshee's Veil"], n: N["Banshee's Veil"] },
    { name: "Zhonya's Hourglass", icon: itemIcon("Zhonya's Hourglass"), w: W["Zhonya's Hourglass"], n: N["Zhonya's Hourglass"] },
    { name: "Wit's End", icon: itemIcon("Wit's End"), w: W["Wit's End"], n: N["Wit's End"] },
    { name: 'Guardian Angel', icon: itemIcon('Guardian Angel'), w: W['Guardian Angel'] },
    { name: 'Mercurial Scimitar', icon: itemIcon('Mercurial Scimitar'), w: W['Mercurial Scimitar'] },
    { name: "Jak'Sho, The Protean", icon: itemIcon("Jak'Sho, The Protean"), w: W["Jak'Sho, The Protean"], n: N["Jak'Sho, The Protean"] },
    { name: 'Gluttonous Greaves', icon: itemIcon('Gluttonous Greaves'), w: coachless.boots['world-d']['Gluttonous Greaves'], n: coachless.boots['na-d']['Gluttonous Greaves'] },
    { name: "Mercury's Treads", icon: itemIcon("Mercury's Treads"), w: coachless.boots['world-d']["Mercury's Treads"] },
    { name: 'Bone Plating', icon: runeIcon('Bone Plating'), w: coachless.resolveRunes['world-d']['Bone Plating'] },
    { name: 'Cleanse', icon: spellIcon(summoners.Cleanse), w: coachless.spells['world-d'].Cleanse },
    { name: 'Barrier', icon: spellIcon(summoners.Barrier), w: coachless.spells['world-d'].Barrier },
  ];
  const bottom = top + rows.length * rowH;
  s.note(0, top - 90, 'Coachless WPA for the defensive answers', { size: 24 });
  s.note(0, top - 58, `Patch ${coachless.patch}, Diamond+, all Kog'Maw ADC games.\nCoachless's "vs champion" filter is paid.`, { size: 14, color: 'Slate' });
  s.note(x0, top - 14, `● World D+ (${fmtK(coachless.samples['world-d'].games)} games)   ◆ NA D+ (~${fmtK(coachless.samples['na-d'].games)} games)`, { size: 13, color: 'Parchment' });
  const zx = xOf(0);
  s.wobblyLine([[zx, top - 8], [zx, bottom]], { color: 'Sepia', width: 1.2 });
  s.wobblyLine([[x0, bottom + 4], [x0 + plotW, bottom + 4]], { color: 'Parchment', width: 1 });
  for (let t = lo; t <= hi; t += 4) {
    s.wobblyLine([[xOf(t), bottom], [xOf(t), bottom + 10]], { color: 'Parchment', width: 1 });
    s.note(xOf(t) - 10, bottom + 12, t ? sign(t, 0) : '0', { size: 12, color: 'Slate' });
  }
  const whisker = (v, n, cy, width) => {
    const m = margin(n);
    const color = Math.abs(v) < m ? 'Parchment' : v > 0 ? 'Moss' : 'Red chalk';
    s.wobblyLine([[xOf(v - m), cy], [xOf(v + m), cy]], { color, width: 1.4, wobble: 0.3 });
    s.wobblyLine([[xOf(v) - 3, cy], [xOf(v) + 3, cy]], { color, width, wobble: 0.2 });
    return { m, color };
  };
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    s.image(0, y, 32, 32, r.icon);
    s.note(42, y + 4, r.name, { size: 15 });
    const w = whisker(r.w[0], r.w[1], y + 10, 10);
    let txt = `${sign(r.w[0], 1)} ±${w.m.toFixed(1)} · ${fmtK(r.w[1])}`;
    if (r.n) {
      const n = whisker(r.n[0], r.n[1], y + 24, 6);
      txt += `   NA ${sign(r.n[0], 1)} ±${n.m.toFixed(1)} · ${fmtK(r.n[1])}`;
    }
    s.note(x0 + plotW + 20, y + 4, txt, { size: 13, color: r.w[1] < 500 ? 'Slate' : 'Parchment' });
  });
  s.note(x0, bottom + 36, [
    'Dot = WPA in percentage points: win rate minus the',
    'win chance at the moment it was bought.',
    'Whisker = rough 95% noise from the game count.',
    'Green / red only if the whole whisker clears zero.',
    'NA shows only where coachless listed the item for NA.',
  ].join('\n'), { size: 12, color: 'Slate' });

  // u.gg: AP vs on-hit by NA rank.
  const tx = 1300;
  s.note(tx, top - 90, 'AP or on-hit? (u.gg, NA)', { size: 24 });
  s.note(tx, top - 58, `Patch ${data.patch.ugg}.\nWin rate · games · ± noise`, { size: 14, color: 'Slate' });
  const colW = 150;
  ugg.ranks.forEach((r, c) => s.note(tx + 160 + c * colW, top - 20, r.label, { size: 15 }));
  [['ap', 'AP build', 'Red chalk'], ['onhit', 'On-hit build', 'Moss']].forEach(([key, label, color], i) => {
    const y = top + 20 + i * 90;
    s.note(tx, y, label, { size: 20, color });
    ugg.ranks.forEach((r, c) => {
      const [g, w] = ugg.games[key][r.id];
      const wr = (w / g) * 100;
      s.note(tx + 160 + c * colW, y - 4, pct(wr), { size: 22 });
      s.note(tx + 160 + c * colW, y + 26, `${fmtK(g)} g · ±${margin(g).toFixed(0)}`, { size: 12, color: g < 300 ? 'Slate' : 'Parchment' });
    });
  });
  s.note(tx, top + 210, [
    'Builds are defined by finished items, so both lean',
    'toward longer games. Compare the rows, not with 50%.',
  ].join('\n'), { size: 12, color: 'Slate' });

  const nx = tx;
  const bv = W["Banshee's Veil"];
  const jk = W["Jak'Sho, The Protean"];
  s.note(nx, top + 280, 'What it says', { size: 24, color: 'Sepia' });
  s.note(nx, top + 318, [
    `• Almost nobody in NA high elo buys defense on Kog: Zhonya's ${N["Zhonya's Hourglass"][1]} buys, the rest under coachless's threshold. The numbers cannot settle this, so the build tab leans on the CC rules.`,
    `• Banshee's Veil is the one bright spot: ${sign(bv[0], 1)} ±${margin(bv[1]).toFixed(1)} on ${bv[1]} world Diamond+ buys. A lean worth trying, not proof.`,
    `• Jak'Sho is the one clear negative: ${sign(jk[0], 1)} ±${margin(jk[1]).toFixed(1)} on ${fmtK(jk[1])} buys. Pure tank stats on Kog cost more damage than they save.`,
    '• Mercurial, Mercury\'s and Cleanse sit at or below zero, which fits "it cannot remove knock-ups". Small samples, so a fit, not a result.',
    `• On-hit wins more than AP in NA below Master+ (${pct((ugg.games.onhit.all[1] / ugg.games.onhit.all[0]) * 100)} vs ${pct((ugg.games.ap.all[1] / ugg.games.ap.all[0]) * 100)} at All ranks); at Master+ and Challenger they are inside each other's noise.`,
    '• None of this is filtered to "behind, into assassins". That needs a paid coachless filter or a match-by-match pull.',
  ].join('\n'), { size: 15, maxChars: 60 });
}

// =====================================================================
// Tab 5: game plan
// =====================================================================
s.tab('plan');
{
  const top = 250;
  const steps = [
    { n: '1', title: 'Stop feeding the lead', color: 'Red chalk', body: 'Behind into fed assassins, every death is worth more to them than any farm is to you. Farm with W and E from max range, clear waves under tower, and give up a plate or a drake rather than walk into fog.' },
    { n: '2', title: 'Light the map before you move', color: 'Sepia', body: `They need fog to start from 1,000 to 1,300 units away. Ward the flank you walk past, sweep with Oracle's Lens if you have it, and spend R (${kog.r.range.join(' / ')} range, 2 s reveal) to scout brush before you step in.` },
    { n: '3', title: 'Stand behind a screen', color: 'Moss', body: 'Frontline and support about 600 units ahead of you, or a minion wave in front of you against Syndra. The assassin must enter your team to reach you. Never be the closest champion to the fog.' },
    { n: '4', title: 'Let them go first', color: 'Moss', body: 'Do not start the fight. Wait for the stun button (Syndra E, Qiyana R, Yone R) to land on someone else, then turn W on and shoot whoever came in. Fed assassins are still squishy once they are inside your team.' },
    { n: '5', title: 'Pick fights at chokes', color: 'Sepia', body: 'Play objectives where they have to walk to you: Baron and Dragon pits, jungle entrances you have warded. Open lanes favour flanks. If they take an objective you cannot contest, take a tower or a camp on the other side.' },
    { n: '6', title: 'Ask for peel', color: 'Slate', body: 'This comp wants an enchanter support or a frontline that stays next to you. Ping your support to stand with you, not to roam. Your E slow (up to 60%) is your own peel: aim it at the gap closer, not for damage.' },
  ];
  steps.forEach((st, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = col * 560;
    const y = top + row * 240;
    s.note(x, y - 8, st.n, { size: 40, color: st.color });
    s.loop(x + 14, y + 16, 26, 28, { color: st.color, width: 2 });
    s.note(x + 56, y, st.title, { size: 24 });
    s.note(x + 56, y + 40, st.body, { size: 15, color: 'Parchment', maxChars: 50 });
  });

  // Scaling breakpoints, on a level line.
  const by = top + 640;
  const x0 = 60;
  const lx = (lvl) => x0 + (lvl - 1) * 82;
  s.note(0, by - 150, 'Scaling breakpoints: why waiting works', { size: 24, color: 'Sepia' });
  s.wobblyLine([[lx(1), by], [lx(18), by]], { color: 'Parchment', width: 1.5 });
  for (let l = 1; l <= 18; l++) {
    s.wobblyLine([[lx(l), by - 5], [lx(l), by + 5]], { color: 'Parchment', width: 1 });
    s.note(lx(l) - 6, by + 10, String(l), { size: 12, color: 'Slate' });
  }
  const marks = [
    { l: 6, t: `R rank 1\n${kog.r.range[0]} range`, c: 'Sepia' },
    { l: 9, t: `W rank 5 (W maxed first)\nW range ${kogW}, 6% max HP`, c: 'Moss' },
    { l: 11, t: `R rank 2\n${kog.r.range[1]} range`, c: 'Sepia' },
    { l: 16, t: `R rank 3\n${kog.r.range[2]} range, 1 s cd`, c: 'Sepia' },
  ];
  marks.forEach((m, i) => {
    s.wobblyLine([[lx(m.l), by - 12], [lx(m.l), by - 40 - (i % 2) * 40]], { color: m.c, width: 1.5 });
    s.note(lx(m.l) + 6, by - 76 - (i % 2) * 40, m.t, { size: 13, color: m.c });
  });
  s.note(0, by + 44, '• W hits for a % of max health, so your damage grows with their HP items while their burst does not. Assassins peak at 2 to 3 items; you peak at 4 to 5.', { size: 15, maxChars: 56 });
  s.note(560, by + 44, '• Every level and item you reach without dying moves the fight toward you. Stalling is a real plan, not giving up. (This is the logic, not a measured game-length curve.)', { size: 15, maxChars: 56 });

  const nx = 1720;
  s.note(nx, top - 8, 'The 1v9 in one line', { size: 24, color: 'Red chalk' });
  s.note(nx, top + 34, [
    'You do not 1v9 by outplaying three assassins. You 1v9 by being the last one they can reach, so they spend their buttons on your team, and you shoot for the 80 to 120 s after.',
    '',
    'AP: Zhonya\'s or Banshee\'s 3rd, fight from R range.',
    'On-hit: Wit\'s End 3rd, Guardian Angel if your team can punish the revive.',
    'Both: Bone Plating, Barrier, no Quicksilver.',
  ].join('\n'), { size: 16, maxChars: 40 });
}

const out = s.page({
  title: "Kog'Maw ADC: carry into fed assassins",
  source: {
    stats: 'https://coachless.gg/items/kogmaw/legendaries?role=adc · https://u.gg/lol/champions/kogmaw/build/adc',
    numbers: 'https://wiki.leagueoflegends.com/en-us/',
    pulledAt: data.pulledAt,
    note: `coachless patch ${data.patch.coachless} (Diamond+, NA and all regions), u.gg ${data.patch.ugg} NA. ${coachless.note}`,
  },
  tabs: views,
  activeTab: 'range',
});
await writeFile(`${ROOT}library/kogmaw-adc-vs-assassins.json`, JSON.stringify(out, null, 1) + '\n');
console.log(`wrote library/kogmaw-adc-vs-assassins.json (${out.page.items.length} items)`);
