// Builds the "Coach: keep Kog'Maw or switch?" library page.
//   node tools/build-kogmaw-keep-or-switch.mjs
//
// A coaching page, not a data page: no win rates, no stats. The question is whether
// Noah (Master 450 LP peak on Kog'Maw, now low Diamond 4) should keep one-tricking
// Kog'Maw ADC to reach Challenger, or switch champion or role. Five tabs: the verdict,
// both sides steelmanned, his three complaints split into "champion" vs "skill",
// the objective clock, and the habits to build.

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sketch } from './sketch.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WRITTEN = '2026-11-21';
const DD = 'https://ddragon.leagueoflegends.com/cdn/16.22.1/img/';
const champ = (f) => `${DD}champion/${f}`;
const spell = (f) => `${DD}spell/${f}`;
const s = sketch({ seed: 2111 });

// Bulleted block: lines are kept short on purpose (Windows fonts wrap wider than Linux).
const bullets = (x, y, lines, { size = 15, color, maxChars = 46 } = {}) =>
  s.note(x, y, lines.map((l) => (l ? `• ${l}` : '')).join('\n'), { size, color, maxChars });

// ---- Shared by every tab ----
s.tab(null);
s.note(0, 0, 'Coach · keep Kog\'Maw or switch?', { size: 40 });
s.wobblyLine([[4, 60], [1000, 56]], { color: 'Red chalk', width: 2.5 });
s.image(0, 84, 56, 56, champ('KogMaw.png'));
s.note(76, 80, [
  'Peak Master 450 LP on Kog\'Maw (fresh account). Now low Diamond 4.',
  'Goal: Challenger. Complaints: no mobility, dies to assassins,',
  'hard to play for objectives. First principles only: no win rates.',
].join('\n'), { size: 15, color: 'Sepia' });

const views = [
  { id: 'verdict', label: '1 · Verdict' },
  { id: 'steelman', label: '2 · Both sides' },
  { id: 'complaints', label: '3 · Your 3 complaints' },
  { id: 'objectives', label: '4 · Objective clock' },
  { id: 'habits', label: '5 · Habits' },
];
const TOP = 200;

// =====================================================================
// Tab 1: the verdict
// =====================================================================
s.tab('verdict');
{
  s.note(0, TOP, 'Keep Kog\'Maw. Add one pocket pick.\nStay ADC.', { size: 34, color: 'Moss' });
  s.loop(300, TOP + 40, 330, 62, { color: 'Moss', width: 2 });

  s.note(0, TOP + 130, 'Why', { size: 24, color: 'Sepia' });
  bullets(0, TOP + 168, [
    'Your edge at Master was mastery: hundreds of games of Kog ranges, spacing and spikes. A new main throws that away and rebuilds it from Diamond.',
    'All three complaints follow you to any ADC that does real damage. Mobile ADCs die later. They still die.',
    'Kog\'s real weakness is the draft: he needs a team in front of him. That is a some-games problem, so fix it with a second champion for those games, not a new main.',
    'You decayed. Rust feels like "my champion is bad". Judge after 30 to 50 games back, not 10.',
  ]);

  const bx = 560;
  s.note(bx, TOP + 130, 'The blunt part', { size: 24, color: 'Red chalk' });
  s.note(bx, TOP + 168, [
    'You climbed one tier per season. That is real,',
    'steady improvement, and you should be proud of it.',
    '',
    'But Master 450 to Challenger is not one more tier',
    'of the same. It is the gap between knowing Kog',
    'and never dying for nothing.',
    '',
    'Most of your deaths to assassins were decided',
    '10 seconds earlier, by where you stood.',
    'That is the skill to learn. No champion skips it.',
  ].join('\n'), { size: 15 });

  s.note(bx, TOP + 420, 'Pocket pick: Xayah', { size: 22, color: 'Sepia' });
  s.image(bx, TOP + 456, 48, 48, champ('Xayah.png'));
  s.image(bx + 56, TOP + 456, 48, 48, spell('XayahR.png'));
  s.note(bx + 116, TOP + 452, [
    'Same auto-attack spacing you already know.',
    'Her R makes you untargetable through the dive,',
    'her E roots the diver. Lock her when they show',
    '2+ divers and your team has no peel.',
  ].join('\n'), { size: 14 });

  s.note(0, TOP + 520, 'What would change my mind', { size: 20, color: 'Slate' });
  bullets(0, TOP + 552, [
    'You are bored of Kog, not just frustrated. Fun is your goal #1, and a bored one-trick stops queuing.',
    'In 50 games your death notes (tab 5) say "I stood right and still died for nothing". Then switch ADC, not role.',
  ], { size: 14, color: 'Slate' });
}

// =====================================================================
// Tab 2: steelman both sides
// =====================================================================
s.tab('steelman');
{
  const cx = [0, 560];
  s.note(cx[0], TOP, 'The case for switching', { size: 24, color: 'Red chalk' });
  bullets(cx[0], TOP + 40, [
    'Kog has no answer of his own to a dive. His safety is made by teammates, and solo queue does not let you pick them.',
    'Every Master+ player knows to dive Kog. You are the target every single game.',
    'Self-reliant champions (a dash, an untargetable spell) let you fix your own mistakes. Kog punishes each one with a death.',
    'A weak early game means lanes against bullies give the first 10 minutes away, and some games are decided by then.',
  ]);
  s.note(cx[1], TOP, 'The case for staying', { size: 24, color: 'Moss' });
  bullets(cx[1], TOP + 40, [
    'W hits for a % of max health from long range. Few carries melt tanks and objectives from that far.',
    'Mastery is the biggest edge at high rank. You have it on Kog and on nothing else.',
    'Being the target is a weapon: if they always dive you, you know the fight before it starts, and can pull it into your team.',
    'You reached Master 450 on a fresh account with him. People play Kog in NA Challenger (we pulled their builds on the Doran\'s page).',
    'Switching resets what you know about the champion. It does not reset why you die.',
  ]);

  const y = TOP + 340;
  s.wobblyLine([[0, y - 16], [1020, y - 20]], { color: 'Sepia', width: 1.2 });
  s.note(0, y, 'Where it lands', { size: 24, color: 'Sepia' });
  s.note(0, y + 40, [
    'Both sides are right about something. The switch case is really about drafts:',
    'some games, Kog has no one in front of him. That is solved by a pocket pick',
    'for those games. The stay case is about everything else, and everything else',
    'is most games. Do not trade your best tool for a fix to a minority of games.',
  ].join('\n'), { size: 16 });
}

// =====================================================================
// Tab 3: the three complaints
// =====================================================================
s.tab('complaints');
{
  const cols = [0, 230, 590, 960];
  s.note(cols[1], TOP, 'What is the champion', { size: 18, color: 'Red chalk' });
  s.note(cols[2], TOP, 'What is you (the fixable part)', { size: 18, color: 'Moss' });
  s.note(cols[3], TOP, 'Verdict', { size: 18, color: 'Sepia' });
  const rows = [
    {
      title: 'Low mobility',
      icon: spell('SummonerFlash.png'),
      champ: 'True: Flash is your only escape. One misstep and there is no button to undo it.',
      you: 'Mobility fixes mistakes after they happen. A Challenger Kog avoids them before: standing spot, wave, timing. Ask "if they jump me now, who stands between us?" If nobody, you are already wrong.',
      verdict: 'Mostly you.\nKog just makes\nit visible.',
    },
    {
      title: 'Dies to assassins',
      icon: champ('Zed.png'),
      champ: 'True: assassins exist to kill immobile carries, and Kog is their favourite.',
      you: 'Most deaths start with not knowing where the assassin is. A death that pulls their whole kit onto you while your team kills them is a fair trade. Dying alone in a side lane is not.',
      verdict: 'Mostly you.\nRanges and windows:\n"carry into fed\nassassins" page.',
    },
    {
      title: 'Hard to play\nfor objectives',
      icon: spell('KogMawLivingArtillery.png'),
      champ: 'True: Kog cannot walk in first or flank, so he cannot start a contest.',
      you: 'Kog is one of the best objective takers there is: W shreds big health pools. The problem is arriving late or into fog. Objective fights are won 60 s before the spawn. See tab 4.',
      verdict: 'You, mostly\ntiming.',
    },
  ];
  rows.forEach((r, i) => {
    const y = TOP + 50 + i * 140;
    s.image(cols[0], y, 44, 44, r.icon);
    s.note(cols[0] + 54, y + 4, r.title, { size: 18 });
    s.note(cols[1], y, r.champ, { size: 14, maxChars: 38, color: 'Sepia' });
    s.note(cols[2], y, r.you, { size: 14, maxChars: 46 });
    s.note(cols[3], y, r.verdict, { size: 16, color: 'Moss' });
    if (i < rows.length - 1) s.wobblyLine([[0, y + 120], [1140, y + 118]], { color: '#3a352c', width: 1 });
  });

  // The fog rule, drawn twice: wrong and right.
  const dy = TOP + 500;
  s.note(0, dy, 'The fog rule', { size: 24, color: 'Sepia' });
  s.note(0, dy + 36, 'An assassin you cannot see is in the fog closest to you.\nNever be the closest one to that fog.', { size: 15 });
  const panel = (ox, title, good) => {
    const y0 = dy + 110;
    s.note(ox, y0, title, { size: 18, color: good ? 'Moss' : 'Red chalk' });
    // Fog wall on the right.
    for (let k = 0; k < 7; k++) s.wobblyLine([[ox + 380 + (k % 2) * 8, y0 + 40 + k * 22], [ox + 460, y0 + 44 + k * 22]], { color: '#4a4f57', width: 6, wobble: 2 });
    s.note(ox + 382, y0 + 196, 'fog', { size: 13, color: 'Slate' });
    s.loop(ox + 430, y0 + 100, 11, 11, { color: 'Red chalk', width: 2.5 });
    s.note(ox + 380, y0 + 18, 'missing assassin', { size: 13, color: 'Red chalk' });
    const you = good ? [ox + 110, y0 + 110] : [ox + 300, y0 + 110];
    const front = good ? [ox + 260, y0 + 110] : [ox + 150, y0 + 110];
    s.loop(...front, 14, 14, { color: 'Slate', width: 2.5 });
    s.note(front[0] - 30, front[1] + 22, 'frontline', { size: 13, color: 'Slate' });
    s.loop(...you, 10, 10, { color: 'Moss', width: 2.5 });
    s.note(you[0] - 16, you[1] + 22, 'you', { size: 13, color: 'Moss' });
    s.arrow([[ox + 418, y0 + 96], [you[0] + (good ? 170 : 20), you[1] - 6]], { color: 'Red chalk', width: 1.8 });
    s.note(ox, y0 + 196, good ? 'He has to go through your team.' : 'You are the first thing he reaches.', { size: 14, color: good ? 'Moss' : 'Red chalk' });
  };
  panel(0, 'Wrong', false);
  panel(560, 'Right', true);
}

// =====================================================================
// Tab 4: the objective clock
// =====================================================================
s.tab('objectives');
{
  s.note(0, TOP, 'Objective fights are won before the objective spawns', { size: 24 });
  s.note(0, TOP + 36, 'For dragon, grubs, herald and baron. Kog cannot start a contest, so he arrives first.', { size: 15, color: 'Slate' });
  const x0 = 40;
  const k = 9; // world units per second
  const xOf = (sec) => x0 + (sec + 90) * k;
  const ay = TOP + 230;
  s.wobblyLine([[xOf(-90), ay], [xOf(10), ay]], { color: 'Parchment', width: 1.5 });
  for (let t = -90; t <= 0; t += 15) {
    s.wobblyLine([[xOf(t), ay - 6], [xOf(t), ay + 6]], { color: 'Parchment', width: 1 });
    s.note(xOf(t) - 14, ay + 12, t === 0 ? 'spawn' : `${t} s`, { size: 13, color: 'Slate' });
  }
  s.loop(xOf(0), ay, 16, 16, { color: 'Red chalk', width: 2.5 });
  const steps = [
    { t: -90, up: true, c: 'Sepia', text: 'Check your wave.\nWhere will it be\nat −60?' },
    { t: -60, up: false, c: 'Moss', text: 'Shove the wave on the\nobjective\'s side of the map.' },
    { t: -45, up: true, c: 'Moss', text: 'Back and buy.\nNever walk in\nwith 1,000 gold.' },
    { t: -30, up: false, c: 'Moss', text: 'Walk in with your support.\nSweep the entrance together.' },
    { t: -15, up: true, c: 'Moss', text: 'Hold the side of the pit\naway from their fog.\nR checks bushes for free.' },
  ];
  for (const st of steps) {
    const top = st.up ? ay - 110 : ay + 40;
    if (st.up) s.wobblyLine([[xOf(st.t), ay - 8], [xOf(st.t), ay - 40]], { color: st.c, width: 1.5 });
    else s.wobblyLine([[xOf(st.t), ay + 32], [xOf(st.t), ay + 50]], { color: st.c, width: 1.5 });
    s.note(xOf(st.t) - 10, st.up ? top : top + 14, st.text, { size: 14, color: st.c });
  }

  const ny = TOP + 380;
  s.note(0, ny, 'If you cannot arrive first', { size: 22, color: 'Red chalk' });
  bullets(0, ny + 36, [
    'Do not face-check the pit. That is the "hard to play objectives" feeling: walking second into fog.',
    'Trade instead: plates, a tower or the other objective on the far side.',
    'Or give it and live. A dead Kog at 25 minutes costs more than one dragon.',
  ]);
  s.note(560, ny, 'Why this suits Kog', { size: 22, color: 'Moss' });
  bullets(560, ny + 36, [
    'Once you are set up, W takes the objective faster than almost anyone, from behind your team.',
    'Their only answer is to walk through your team to reach you. That is the fight you want.',
    'Dragon spawns on your side of the map. Bot lane wave control is the whole setup.',
  ]);
}

// =====================================================================
// Tab 5: habits
// =====================================================================
s.tab('habits');
{
  s.note(0, TOP, 'Seven habits. My bet: the first three move you most.', { size: 24 });
  const habits = [
    ['The fog rule', 'Every fight: name where each assassin is. Unseen means the closest fog to you. Never be closest.'],
    ['Who is between us?', 'Before each step forward. If the answer is nobody, step back.'],
    ['Fight on their cooldowns', 'Step up right after their engage is spent, never before. Their ult down is your fight.'],
    ['The 60 second clock', 'Shove and back 60 s before every objective. Arrive first or trade elsewhere.'],
    ['The draft rule', 'Enemy shows 2+ divers and your team has no peel: Xayah. Otherwise Kog.'],
    ['One death per game', 'After each game, look at your first death only. One line: where was I, did I know where the killer was?'],
    ['Stop after two losses', 'Challenger is many good games, not the most games. Tilted games undo good ones.'],
  ];
  habits.forEach(([h, d], i) => {
    const col = i < 4 ? 0 : 1;
    const row = i < 4 ? i : i - 4;
    const x = col * 580;
    const y = TOP + 60 + row * 110;
    s.note(x, y - 4, String(i + 1), { size: 34, color: 'Red chalk' });
    s.note(x + 40, y, h, { size: 19, color: 'Moss' });
    s.note(x + 40, y + 30, d, { size: 14, maxChars: 56 });
  });
  const ty = TOP + 420;
  s.note(580, ty, 'The 50 game test', { size: 22, color: 'Sepia' });
  s.note(580, ty + 36, [
    'Write the one-line death note every game.',
    'After 50 games, count two piles:',
    '"did not know where they were" vs "stood right, died anyway".',
    'If the first pile is bigger (I expect it will be),',
    'the fix is habits, and Kog stays.',
    'If the second pile is bigger, come back and we revisit.',
  ].join('\n'), { size: 15 });
  s.loop(660, ty + 16, 100, 24, { color: 'Sepia', width: 1.5 });
}

const out = s.page({
  title: "Coach: keep Kog'Maw or switch?",
  source: {
    method: 'Coaching opinion from first principles. No win rates or stats were used.',
    pulledAt: WRITTEN,
    note: 'Icons: Data Dragon 16.22.1. Rank history as told by Noah in the project chat.',
  },
  tabs: views,
  activeTab: 'verdict',
});
await writeFile(`${ROOT}library/kogmaw-keep-or-switch.json`, JSON.stringify(out, null, 1) + '\n');
console.log(`wrote library/kogmaw-keep-or-switch.json (${out.page.items.length} items)`);
