// Builds the "Climb plan: Masters 450 to Challenger" library page from
// data/climb-plan-challenger.json. Re-run after changing the assumptions:
//   node tools/build-climb-plan-challenger.mjs
//
// A coaching page, not a stats page: first principles and arithmetic only.
// Five tabs: the honest push-back, the ladder math, a daily practice system,
// in-game decision rules, and a three-phase plan.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sketch } from './sketch.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const data = JSON.parse(await readFile(`${ROOT}data/climb-plan-challenger.json`, 'utf8'));
const s = sketch({ seed: 9000 });
const { ladder, variance } = data;

// Net LP per game and games needed to climb lpToClimb at win rate p.
const netPerGame = (p) => p * ladder.lpPerWin - (1 - p) * ladder.lpPerLoss;
const gamesNeeded = (p) => ladder.lpToClimb / netPerGame(p);
const pctTxt = (p) => `${Math.round(p * 100)}%`;

// A card: big number in a loop, a title, then text.
function card(x, y, n, title, body, color, maxChars = 48) {
  s.note(x, y - 8, n, { size: 36, color });
  s.loop(x + 12, y + 14, 24, 26, { color, width: 2 });
  s.note(x + 52, y, title, { size: 22 });
  s.note(x + 52, y + 36, body, { size: 15, maxChars });
}

// ---- Shared by every tab ----
s.tab(null);
s.note(0, 0, data.title, { size: 40 });
s.wobblyLine([[4, 60], [1000, 56]], { color: 'Red chalk', width: 2.5 });
s.note(0, 76, [
  'Coach mode: first principles, no win-rate data. Blunt on purpose.',
  'Bronze to Masters 450 LP, one rank a season. Now low Diamond 4.',
  `Written ${data.pulledAt}. Tab 2 is arithmetic with stated assumptions.`,
].join('\n'), { size: 15, color: 'Sepia' });

const views = [
  { id: 'truth', label: '1 · The truth' },
  { id: 'math', label: '2 · The math of losing' },
  { id: 'system', label: '3 · Daily system' },
  { id: 'decisions', label: '4 · In-game rules' },
  { id: 'plan', label: '5 · The plan' },
];

// =====================================================================
// Tab 1: push back on what was said
// =====================================================================
s.tab('truth');
{
  const top = 240;
  const cards = [
    {
      said: '"Kog dies to assassins and can\'t play objectives."',
      truth: 'You took him to Masters 450. The champion did not get worse; your habits got rusty. Assassins kill the carry who stands near fog without knowing where they are, and that habit follows you to any champion. Objectives are won by whoever arrives first with the wave pushed, not by whoever has a dash.',
      color: 'Red chalk',
    },
    {
      said: '"I want a champ and role I can enjoy and climb."',
      truth: 'Enjoyment matters: decay is a sign the fun ran out. But every switch throws away thousands of games of reps. Choose once, this week, then lock it for 100 games. A switch decided after a bad session is tilt, not strategy.',
      color: 'Sepia',
    },
    {
      said: '"You can hit Challenger on any champ."',
      truth: 'Agreed, and follow it through: then the champion is not your bottleneck. You are the variable. Avoidable deaths, tempo and mood decide your climb. Spend most of your energy there, not on the champ list.',
      color: 'Moss',
    },
    {
      said: '"I struggle to accept I can\'t have a 100% win rate."',
      truth: 'This is your biggest lever. Challenger pace is about 55%: you lose 9 of every 20. If a loss feels like failure, you queue the next game to erase it, and that is the game you throw. Grade each game on your decisions, not the result.',
      color: 'Red chalk',
    },
    {
      said: '"I climb one rank every season."',
      truth: 'A steady learning rate, and it is real. But the decay means you stopped playing. Challenger is a top-300 ladder that moves while you are away. It rewards a good win rate held across hundreds of games, not one hot month.',
      color: 'Sepia',
    },
    {
      said: 'What separates Masters 450 from Challenger',
      truth: 'Not mechanics. (1) Fewer avoidable deaths. (2) A plan every minute: wave, recall, objective. (3) The same quality in game 5 of a session as in game 1. All three are habits you can train on purpose.',
      color: 'Moss',
    },
  ];
  cards.forEach((c, i) => {
    const x = (i % 3) * 600;
    const y = top + Math.floor(i / 3) * 330;
    s.note(x, y, c.said, { size: 17, color: c.color, maxChars: 50 });
    s.wobblyLine([[x, y + 52], [x + 520, y + 50]], { color: c.color, width: 1.2 });
    s.note(x, y + 64, c.truth, { size: 15, maxChars: 56 });
  });
}

// =====================================================================
// Tab 2: the arithmetic of a ladder
// =====================================================================
s.tab('math');
{
  const top = 330;
  const x0 = 80;
  const w = 720;
  const h = 360;
  const pMin = 0.52;
  const pMax = 0.62;
  const gMax = 1500;
  const xOf = (p) => x0 + ((p - pMin) / (pMax - pMin)) * w;
  const yOf = (g) => top + h - (Math.min(g, gMax) / gMax) * h;

  s.note(0, top - 110, `Games to climb ${ladder.lpToClimb.toLocaleString('en-US')} LP, by win rate`, { size: 24 });
  s.note(0, top - 76, `Assumes +${ladder.lpPerWin} / −${ladder.lpPerLoss} LP. Low D4 to Masters 0 is ~400 LP;\nthe Challenger cutoff moves, so 1,000 is a round guess.`, { size: 13, color: 'Slate' });
  // Axes.
  s.wobblyLine([[x0, top + h], [x0 + w, top + h]], { color: 'Parchment', width: 1 });
  s.wobblyLine([[x0, top], [x0, top + h]], { color: 'Parchment', width: 1 });
  for (let p = pMin; p <= pMax + 1e-9; p += 0.02) {
    s.wobblyLine([[xOf(p), top + h], [xOf(p), top + h + 8]], { color: 'Parchment', width: 1 });
    s.note(xOf(p) - 14, top + h + 12, pctTxt(p), { size: 13, color: 'Slate' });
  }
  s.note(x0 + w - 60, top + h + 34, 'win rate', { size: 13, color: 'Slate' });
  for (let g = 0; g <= 1500; g += 300) {
    s.wobblyLine([[x0 - 8, yOf(g)], [x0, yOf(g)]], { color: 'Parchment', width: 1 });
    s.note(x0 - 52, yOf(g) - 9, String(g), { size: 13, color: 'Slate' });
  }
  s.note(x0 - 70, top - 30, 'games', { size: 13, color: 'Slate' });
  // Curve.
  const pts = [];
  for (let p = pMin; p <= pMax + 1e-9; p += 0.0025) pts.push([xOf(p), yOf(gamesNeeded(p))]);
  s.stroke(pts, { color: 'Moss', width: 3.5 });
  for (const p of [0.52, 0.55, 0.58]) {
    const g = gamesNeeded(p);
    s.loop(xOf(p), yOf(g), 8, 8, { color: 'Red chalk', width: 2 });
    s.note(xOf(p) + 16, yOf(g) - 22, `${pctTxt(p)}: ${Math.round(g)} games`, { size: 16, color: 'Red chalk' });
  }

  // What a Challenger stretch looks like.
  const by = top + h + 110;
  s.note(0, by - 10, 'Twenty games at Challenger pace (55%) look like this:', { size: 20 });
  const seq = 'WWLWLLWWLWWLLLWWLWLW'; // 11 W, 9 L, with a 3-loss run
  [...seq].forEach((r, i) => {
    const x = x0 + i * 34;
    s.wobblyLine([[x, by + 50], [x + 6, by + 50]], { color: r === 'W' ? 'Moss' : 'Red chalk', width: 22, wobble: 0.2 });
  });
  s.note(x0, by + 72, 'Moss = win, red = loss. 11 wins, 9 losses, a 3-loss run in the middle. That is a great month.', { size: 14, color: 'Slate' });

  const nx = 980;
  s.note(nx, top - 110, 'What it says', { size: 24, color: 'Sepia' });
  s.note(nx, top - 72, [
    `• Win rate is a multiplier, not a detail. ${pctTxt(0.52)} needs ~${Math.round(gamesNeeded(0.52))} games, ${pctTxt(0.55)} ~${Math.round(gamesNeeded(0.55))}, ${pctTxt(0.58)} ~${Math.round(gamesNeeded(0.58))}. Every tilted game you skip moves you right on this curve.`,
    `• Losses are built in. Even playing at a true 55%, simulation says:`,
    `   – ${Math.round(variance.fiveLossStreakIn100 * 100)}% chance of a 5-loss streak somewhere in 100 games`,
    `   – ${Math.round(variance.under50After20 * 100)}% chance you are under 50% after 20 games`,
    `   – ${Math.round(variance.under50After50 * 100)}% chance you are still under 50% after 50`,
    '• So a losing streak is not proof you got worse, and a short sample is not a verdict on a champion. Judge yourself on decisions and deaths over 50+ games.',
    '• The win you can control: the game you do not queue while tilted. Skipping one coin-flip game you would play at 40% is worth more than any build change.',
  ].join('\n'), { size: 15, maxChars: 56 });
}

// =====================================================================
// Tab 3: the daily system
// =====================================================================
s.tab('system');
{
  const top = 270;
  const steps = [
    { n: '1', title: 'Before you queue', color: 'Sepia', body: 'Write one focus for the session, one sentence, e.g. "Before I pass river, I say out loud where their assassin is." 5 minutes of last-hitting in Practice Tool. Mute all chat at load-in.' },
    { n: '2', title: 'Play in blocks of 3', color: 'Moss', body: 'Three games, then stand up. Decide the next block with a clear head, not in the queue pop. Same hours each day if you can: consistency beats marathons.' },
    { n: '3', title: 'Stop rules (not optional)', color: 'Red chalk', body: 'Two losses in a row: done for the day. Typed angry, or felt "I need this one back": done. Last game of the day is never a loss you are trying to erase.' },
    { n: '4', title: 'One line after each game', color: 'Moss', body: 'Win or loss, did I keep my focus (yes / no), and my one most avoidable death with its category (below). Grade the game on that line, not on the result.' },
    { n: '5', title: 'Death review, twice a week', color: 'Sepia', body: 'One loss and one win. Only watch the 10 seconds before each of your deaths. Ask: what did I know, what was I trying to do, what would a Challenger player do here?' },
    { n: '6', title: 'Weekly reset', color: 'Slate', body: 'Count avoidable deaths per game. Next week\'s focus = the most common category. Watch 20 minutes of a Challenger player on your champ, pausing to predict their next move before they make it.' },
  ];
  steps.forEach((st, i) => card((i % 3) * 580, top + Math.floor(i / 3) * 250, st.n, st.title, st.body, st.color));

  const dy = top + 540;
  s.note(0, dy, 'Death categories for the log', { size: 24, color: 'Sepia' });
  const cats = [
    { k: 'Unseen threat', t: 'Died to someone I had not tracked.', c: 'Red chalk' },
    { k: 'Greed', t: 'Stayed for a wave, plate or kill past my safe line.', c: 'Red chalk' },
    { k: 'Bad fight', t: 'Took a fight my team loses on paper.', c: 'Sepia' },
    { k: 'Late', t: 'Arrived after them to an objective and walked in.', c: 'Sepia' },
    { k: 'Fair trade', t: 'Died for something worth more. Not avoidable.', c: 'Moss' },
  ];
  cats.forEach((c, i) => {
    const x = i * 340;
    s.note(x, dy + 44, c.k, { size: 19, color: c.c });
    s.note(x, dy + 74, c.t, { size: 14, maxChars: 34 });
  });
  s.note(0, dy + 140, 'Target: halve the first four in a month. Masters players die to them every game; Challenger players rarely do.', { size: 15, color: 'Slate' });
}

// =====================================================================
// Tab 4: in-game decision rules
// =====================================================================
s.tab('decisions');
{
  const top = 320;
  // Objective clock timeline.
  s.note(0, top - 50, 'The objective clock (Dragon, Grubs, Herald, Baron)', { size: 24 });
  const x0 = 40;
  const k = 7; // units per second
  const xOf = (t) => x0 + (t + 90) * k;
  s.wobblyLine([[xOf(-90), top + 40], [xOf(10), top + 40]], { color: 'Parchment', width: 1.5 });
  const marks = [
    { t: -90, h: '90 s before', b: 'Look at the waves near the pit.\nShove the lane on that side.', c: 'Sepia' },
    { t: -60, h: '60 s before', b: 'Recall now if low or you can buy.\nNever reset at 20 s.', c: 'Moss' },
    { t: -30, h: '30 s before', b: 'Arrive first, wave pushed,\nwards down, stand behind them.', c: 'Moss' },
    { t: 0, h: 'Spawn', b: 'The team that got there\nfirst gets to choose.', c: 'Red chalk' },
  ];
  marks.forEach((m, i) => {
    s.wobblyLine([[xOf(m.t), top + 30], [xOf(m.t), top + 50]], { color: m.c, width: 2 });
    s.note(xOf(m.t) - 10, top - 4 + (i % 2) * 0, m.h, { size: 16, color: m.c });
    s.note(xOf(m.t) - 10, top + 62, m.b, { size: 13, maxChars: 34 });
  });
  s.note(0, top + 130, 'Late or no prio? Do not face-check. Trade across the map: tower plates, a tower, their camps. Losing a dragon is cheaper than losing the carry and the dragon.', { size: 15, color: 'Slate', maxChars: 60 });

  const rules = [
    { n: '1', title: 'Count the missing', color: 'Red chalk', body: 'Glance at the map every wave. If two or more enemies are missing, or their assassin is, you farm the wave closest to your team or under tower. No exceptions when you are the carry.' },
    { n: '2', title: 'Their engage starts the fight', color: 'Moss', body: 'Hit whatever is in range, frontline included. Do not walk forward to reach the backline until their engage button is spent on someone else. Then turn on.' },
    { n: '3', title: 'Ahead: take buildings', color: 'Sepia', body: 'A lead is gold you have not spent yet. Convert it into plates, towers and objectives, not into chasing kills into fog. A tower never flashes back.' },
    { n: '4', title: 'Behind: be the last one reachable', color: 'Slate', body: 'Farm safely, give up what you cannot contest, let them overextend into your team. Every level you reach alive moves the game toward a scaling carry.' },
    { n: '5', title: 'Every reset, three questions', color: 'Sepia', body: 'What is the next objective and when? Which waves crash where? What is my next item and can I afford it? Leave base with the answers.' },
    { n: '6', title: 'Judge the decision', color: 'Moss', body: 'A good call that loses to a coin flip is still a good call. A bad call that works is still bad. Log the call, not the outcome.' },
  ];
  rules.forEach((st, i) => card((i % 3) * 580, top + 220 + Math.floor(i / 3) * 240, st.n, st.title, st.body, st.color));
}

// =====================================================================
// Tab 5: the plan
// =====================================================================
s.tab('plan');
{
  const top = 260;
  const phases = [
    {
      head: 'Phase 1 · D4 to Masters',
      sub: 'Shake off the rust',
      body: [
        'You were Masters 450; D4 is below your level. The danger is impatience, not skill.',
        'Champion: whatever you can play best this week. Do not experiment here.',
        'Focus: avoidable deaths ≤ 2 per game.',
        'Daily system from tab 3, stop rules strict.',
        'Exit: Masters.',
      ],
      color: 'Moss',
    },
    {
      head: 'Phase 2 · Masters to GM',
      sub: 'Tempo',
      body: [
        'Run the objective clock for every objective.',
        'Death review twice a week, weekly focus from the log.',
        'Focus: arrive first, wave pushed, at most objectives.',
        'Allow the champion choice to settle: 100 games before judging it.',
        'Exit: Grandmaster.',
      ],
      color: 'Sepia',
    },
    {
      head: 'Phase 3 · GM to Challenger',
      sub: 'Consistency and volume',
      body: [
        'Your mechanics are already enough. Now it is about the same level in every game.',
        'Track win rate by game number in a session. If game 4+ is worse, shorten sessions.',
        'Play steadily to the end of the season; the cutoff rises late.',
        'Focus: no tilted games at all.',
        'Exit: top 300.',
      ],
      color: 'Red chalk',
    },
  ];
  phases.forEach((p, i) => {
    const x = i * 600;
    s.note(x, top, p.head, { size: 24, color: p.color });
    s.note(x, top + 36, p.sub, { size: 17, color: 'Slate' });
    s.wobblyLine([[x, top + 66], [x + 500, top + 64]], { color: p.color, width: 1.5 });
    s.note(x, top + 80, p.body.map((b) => `• ${b}`).join('\n'), { size: 15, maxChars: 54 });
    if (i < phases.length - 1) s.arrow([[x + 510, top + 18], [x + 580, top + 18]], { color: 'Parchment', width: 2 });
  });

  const by = top + 330;
  s.note(0, by, 'Honest expectation', { size: 24, color: 'Sepia' });
  s.note(0, by + 40, [
    'Getting back to Masters should be quick if you play. Challenger is a volume question as much as a skill one: at a 55% win rate the math on tab 2 says ~500 games from here.',
    'If you can play ~25 games a week, that is a long season. Fewer games means GM is the realistic target this season and Challenger the next. Both are on the path you are already on.',
  ].join('\n\n'), { size: 15, maxChars: 62 });

  const nx = 0;
  s.note(nx + 640, by, 'The one-line version', { size: 24, color: 'Red chalk' });
  s.note(nx + 640, by + 40, 'Stop looking for the champion that never loses. Lock one in, die less, arrive first, and stop queueing after two losses. Challenger is 55% held for a long time.', { size: 18, maxChars: 52 });
}

const out = s.page({
  title: data.title,
  source: {
    basis: data.basis,
    assumptions: ladder.note,
    simulation: variance.method,
    pulledAt: data.pulledAt,
  },
  tabs: views,
});
await writeFile(`${ROOT}library/climb-plan-challenger.json`, JSON.stringify(out, null, 1) + '\n');
console.log(`wrote library/climb-plan-challenger.json (${out.page.items.length} items)`);
