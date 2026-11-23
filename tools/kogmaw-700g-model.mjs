// Fight model for "two Long Swords or Recurve Bow?" on Kog'Maw with Lethal Tempo.
// Numbers come from data/kogmaw-700g-swords-vs-bow.json (LoL wiki, patch 26.23).
// Used by tools/build-kogmaw-700g-swords-vs-bow.mjs.
//
// The fight: Kog starts with 0 Lethal Tempo stacks, casts Q at t = 0 (and again
// when it comes back), and attacks as fast as his attack speed allows. W is
// on for its 8 s when the scenario says so. Each attack recomputes attack speed
// from the current Lethal Tempo stacks. No movement, no misses, no enemy healing.

const grow = (base, g, lvl) => base + g * (lvl - 1) * (0.7025 + 0.0175 * (lvl - 1));
const ORDER = ['w', 'q', 'e', 'w', 'w', 'r', 'w', 'q', 'w', 'q', 'r', 'q', 'q', 'e', 'e', 'r', 'e', 'e'];
export const ranks = (lvl) => {
  const r = { q: 0, w: 0, e: 0, r: 0 };
  ORDER.slice(0, lvl).forEach((k) => r[k]++);
  return r;
};

export const BUYS = {
  swords: { label: '2× Long Sword', ad: 20, as: 0, onHit: 0 },
  bow: { label: 'Recurve Bow', ad: 0, as: 15, onHit: 15 },
  none: { label: 'nothing', ad: 0, as: 0, onHit: 0 },
};

export function kog(data, lvl, buy, extra = {}) {
  const b = data.kog.base;
  const rk = ranks(lvl);
  const baseAd = grow(b.ad, b.adG, lvl);
  const bonusAd = buy.ad + (extra.ad ?? 0);
  return {
    lvl, rk, baseAd, bonusAd,
    ad: baseAd + bonusAd,
    onHit: buy.onHit,
    // Bonus AS before Lethal Tempo: level growth + Q passive + shard + item (+ any extra AS).
    bonusAs: grow(0, b.asG, lvl) + data.kog.qPassiveAs[rk.q - 1] + data.kog.shardAs + buy.as + (extra.as ?? 0),
  };
}

export function target(data, kind, lvl) {
  const t = data.targets[kind];
  return {
    hp: grow(t.hp, t.hpG, lvl) + (t.bonusHp ?? 0),
    armor: grow(t.armor, t.armorG, lvl) + (t.bonusArmor ?? 0),
    mr: grow(t.mr, t.mrG, lvl),
  };
}

// Damage dealt in `duration` seconds. opts: { w: true/false, ltStart: 0..6 }
export function fight(data, k, tgt, { duration = 8, w = true, ltStart = 0, rCasts = 0 } = {}) {
  const K = data.kog;
  const LT = data.lethalTempo;
  const lvl = k.lvl;
  let stacks = ltStart;
  let t = 0;
  let qAt = 0;
  let shredUntil = -1;
  const out = { auto: 0, onHit: 0, w: 0, lt: 0, q: 0, r: 0, attacks: 0 };
  const shred = () => (t < shredUntil ? K.qShred[k.rk.q - 1] / 100 : 0);
  const phys = (x) => x * 100 / (100 + tgt.armor * (1 - shred()));
  const magic = (x) => x * 100 / (100 + tgt.mr * (1 - shred()));
  const castQ = () => {
    shredUntil = t + K.qShredDuration;
    out.q += magic(K.qDmg[k.rk.q - 1]); // Q damage hits before the shred in game; close enough
    qAt = t + K.qCd;
  };
  castQ();
  while (t < duration) {
    if (t >= qAt) castQ();
    const bonusAs = k.bonusAs + stacks * LT.asPerStack;
    const as = Math.min(2.5, K.base.as + K.base.asRatio * bonusAs / 100);
    // Lethal Tempo stacks on-attack, so the bolt fires on the attack that reaches 6.
    stacks = Math.min(LT.stacks, stacks + 1);
    const bonusAsNow = k.bonusAs + stacks * LT.asPerStack;
    out.auto += phys(k.ad);
    out.onHit += phys(k.onHit);
    if (w && t < K.wDuration) out.w += magic(tgt.hp * K.wHpPct[k.rk.w - 1] / 100);
    if (stacks === LT.stacks) {
      const bolt = (LT.bolt[0] + (LT.bolt[1] - LT.bolt[0]) * (lvl - 1) / 17) * (1 + bonusAsNow / 100);
      // Adaptive: physical with bonus AD; with none (Recurve only) also treated as physical.
      out.lt += phys(bolt);
    }
    out.attacks++;
    t += 1 / as;
  }
  for (let i = 0; i < rCasts && k.rk.r; i++) out.r += magic(K.rDmg[k.rk.r - 1] + K.rBonusAd * k.bonusAd);
  out.total = out.auto + out.onHit + out.w + out.lt + out.q + out.r;
  return out;
}

// Attack counts jump in whole attacks, so one window length can flip a result by
// one auto. Average the damage over windows from duration − spread to + spread.
export function smooth(data, k, tgt, sc, spread = 1) {
  let sum = 0;
  let n = 0;
  for (let d = sc.duration - spread; d <= sc.duration + spread + 1e-9; d += 0.1) {
    sum += fight(data, k, tgt, { ...sc, duration: d }).total;
    n++;
  }
  return sum / n;
}

export const SCENARIOS = [
  { id: 'trade', label: 'Short trade: W + Q, 4 s', duration: 4, w: true },
  { id: 'fight', label: 'Full fight: W + Q, 8 s', duration: 8, w: true },
  { id: 'nowall', label: 'W on cooldown: Q + autos, 6 s', duration: 6, w: false },
];

// Steady state: Lethal Tempo at 6 stacks, damage per second with no Q.
// Gives a clean line (no whole-attack jumps) for "when does AD catch up?".
export function steady(data, k, tgt, { w = true } = {}) {
  const K = data.kog;
  const LT = data.lethalTempo;
  const bonusAs = k.bonusAs + LT.stacks * LT.asPerStack;
  const as = Math.min(2.5, K.base.as + K.base.asRatio * bonusAs / 100);
  const pm = 100 / (100 + tgt.armor);
  const mm = 100 / (100 + tgt.mr);
  const bolt = (LT.bolt[0] + (LT.bolt[1] - LT.bolt[0]) * (k.lvl - 1) / 17) * (1 + bonusAs / 100);
  const hit = (k.ad + k.onHit + bolt) * pm + (w ? tgt.hp * K.wHpPct[k.rk.w - 1] / 100 * mm : 0);
  return { as, hit, dps: as * hit };
}
