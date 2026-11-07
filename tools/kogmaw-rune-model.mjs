// A small fight model for comparing Kog'Maw keystones from first principles.
// Used by tools/build-kogmaw-runes-aggro.mjs. Numbers come from data/kogmaw-adc-runes-aggro.json.
//
// What it does: plays out one trade against one target, attack by attack, and
// reports how much damage each keystone adds on top of the same trade with no keystone.
// What it leaves out: mana, missed skillshots, the enemy hitting back, item passives,
// minions, and pen. It is a ruler for comparing runes, not a fight predictor.

const lerp = ([a, b], lvl) => a + ((b - a) * (lvl - 1)) / 17;
// Riot's per-level stat growth curve.
const grow = (base, g, lvl) => base + g * (lvl - 1) * (0.7025 + 0.0175 * (lvl - 1));
const mult = (resist) => 100 / (100 + Math.max(0, resist));

export function kogAt(data, lvl, { ranks, build, asShard = true }) {
  const b = data.kog.base;
  const item = build ?? { ad: 0, ap: 0, as: 0, ms: 0 };
  const growthAs = b.asG * (lvl - 1) * (0.7025 + 0.0175 * (lvl - 1));
  const qAs = ranks.q ? data.kog.q.passiveAs[ranks.q - 1] : 0;
  return {
    lvl,
    ranks,
    ad: grow(b.ad, b.adG, lvl) + item.ad,
    bad: item.ad,
    ap: item.ap,
    bonusAs: growthAs + qAs + item.as + (asShard ? 10 : 0), // percent
    hp: grow(b.hp, b.hpG, lvl),
    ms: b.ms + item.ms,
    range: b.range + (ranks.w ? data.kog.w.range[ranks.w - 1] : 0),
  };
}

export function enemyAt(data, lvl) {
  const e = data.enemy.base;
  return { hp: grow(e.hp, e.hpG, lvl), armor: grow(e.armor, e.armorG, lvl), mr: grow(e.mr, e.mrG, lvl) };
}

// plan: { duration, wOn, casts: [{ t, spell: 'q'|'e'|'r' }] }
export function simulate(data, kog, enemy, plan, keystone = null) {
  const K = data.kog;
  const R = data.runes;
  const lvl = kog.lvl;
  const adaptiveMagic = kog.ap > kog.bad * 1.0 && kog.ap > 0; // AP outweighs bonus AD
  let armor = enemy.armor;
  let mr = enemy.mr;
  let total = 0;
  const events = []; // [t, dmg] for the 3 s windows
  let hits = 0;
  let amp = 0; // PTA
  let ptaDone = false;
  let elecHits = [];
  let elecDone = false;
  let ltStacks = 0;
  let hobLeft = keystone === 'Hail of Blades' ? 2 : 0;
  let conq = 0;
  let dhDone = false;
  let cometReady = true;
  let fsBonus = 0;
  const pending = []; // delayed damage [t, raw, type]

  const deal = (t, raw, type) => {
    let d = type === 'phys' ? raw * mult(armor) : type === 'magic' ? raw * mult(mr) : raw;
    d *= 1 + amp;
    if (keystone === 'First Strike' && t <= 3) {
      fsBonus += d * (R['First Strike'].true / 100);
      d *= 1 + R['First Strike'].true / 100;
    }
    total += d;
    events.push([t, d]);
    if (keystone === 'Dark Harvest' && !dhDone && total >= enemy.hp * 0.5) {
      dhDone = true;
      const souls = lvl >= 9 ? 5 : 0;
      deal(t, 30 + 11 * souls + 0.1 * kog.bad + 0.05 * kog.ap, adaptiveMagic ? 'magic' : 'phys');
    }
  };
  const adaptive = (t, raw) => deal(t, raw, adaptiveMagic ? 'magic' : 'phys');
  const conqBonus = () => (keystone === 'Conqueror' ? conq * (adaptiveMagic ? 0 : lerp(R.Conqueror.adPerStack, lvl)) : 0);
  const conqAp = () => (keystone === 'Conqueror' && adaptiveMagic ? conq * lerp(R.Conqueror.apPerStack, lvl) : 0);

  const elecHit = (t) => {
    if (keystone !== 'Electrocute' || elecDone) return;
    elecHits = elecHits.filter((x) => t - x <= 3);
    elecHits.push(t);
    if (elecHits.length >= 3) {
      elecDone = true;
      pending.push([t + 0.25, lerp(R.Electrocute.proc, lvl) + 0.1 * kog.bad + 0.05 * kog.ap, 'adaptive']);
    }
  };
  const comet = (t, far) => {
    if (keystone !== 'Arcane Comet' || !cometReady) return;
    cometReady = false;
    const raw = (lerp(R['Arcane Comet'].dmg, lvl) + 0.1 * kog.bad + 0.05 * kog.ap) * (far ? 1.5 : 1);
    pending.push([t + 0.825, raw, 'adaptive']);
  };
  const burn = (t, secs) => {
    if (keystone !== 'Deathfire Touch') return;
    const tick = lerp(R['Deathfire Touch'].tick, lvl) + 0.035 * kog.bad + 0.0125 * kog.ap;
    for (let k = 1; k <= secs * 2; k++) pending.push([t + k * 0.5, tick * (k * 0.5 > 3 ? 1.75 : 1), 'magic']);
  };
  const spellDamage = (t, spell) => {
    const ap = kog.ap + conqAp();
    if (spell === 'q') {
      const r = kog.ranks.q;
      deal(t, K.q.dmg[r - 1] + K.q.ap * ap, 'magic');
      const shred = K.q.shred[r - 1] / 100;
      armor = enemy.armor * (1 - shred);
      mr = enemy.mr * (1 - shred);
      comet(t, true);
      burn(t, 4);
    } else if (spell === 'e') {
      const r = kog.ranks.e;
      deal(t, K.e.dmg[r - 1] + K.e.ap * ap, 'magic');
      comet(t, false);
      burn(t, 4);
    } else if (spell === 'r') {
      const r = kog.ranks.r;
      deal(t, K.r.dmg[r - 1] + K.r.bad * kog.bad + K.r.ap[r - 1] * ap, 'magic');
      comet(t, true);
      burn(t, 2);
    }
    if (keystone === 'Conqueror') conq = Math.min(12, conq + 2);
    elecHit(t);
  };

  const casts = [...(plan.casts ?? [])].sort((a, b) => a.t - b.t);
  let t = 0;
  let ci = 0;
  let stormAt = null;
  const flush = (upTo) => {
    pending.sort((a, b) => a[0] - b[0]);
    while (pending.length && pending[0][0] <= upTo) {
      const [pt, raw, type] = pending.shift();
      if (type === 'adaptive') adaptive(pt, raw);
      else deal(pt, raw, type);
    }
  };
  const checkStorm = (now) => {
    if (stormAt !== null) return;
    const recent = events.filter(([et]) => now - et <= 3).reduce((s, [, d]) => s + d, 0);
    if (recent >= enemy.hp * 0.25) stormAt = now;
  };

  while (t <= plan.duration + 1e-9) {
    while (ci < casts.length && casts[ci].t <= t) {
      flush(casts[ci].t);
      spellDamage(casts[ci].t, casts[ci].spell);
      checkStorm(casts[ci].t);
      ci++;
    }
    flush(t);
    // basic attack lands at t (projectile travel ignored)
    let bonusAs = kog.bonusAs;
    const hobActive = hobLeft > 0;
    let ad = kog.ad + conqBonus();
    deal(t, ad, 'phys');
    if (plan.wOn) {
      const w = K.w.hpPct[kog.ranks.w - 1] + (K.w.hpPctPer100Ap * (kog.ap + conqAp())) / 100;
      deal(t, (w / 100) * enemy.hp, 'magic');
    }
    hits++;
    if (hobActive) {
      deal(t, lerp(R['Hail of Blades'].true, lvl) + 0.12 * kog.bad + 0.1 * kog.ap, 'true');
      hobLeft--;
    }
    if (keystone === 'Lethal Tempo') {
      ltStacks = Math.min(6, ltStacks + 1);
      if (ltStacks === 6) {
        const bonus = kog.bonusAs + 6 * R['Lethal Tempo'].asPerStack;
        adaptive(t, lerp(R['Lethal Tempo'].bolt, lvl) * (1 + bonus / 100));
      }
    }
    if (keystone === 'Press the Attack' && !ptaDone && hits === 3) {
      ptaDone = true;
      adaptive(t, lerp(R['Press the Attack'].proc, lvl));
      amp = R['Press the Attack'].amp / 100;
    }
    if (keystone === 'Conqueror') conq = Math.min(12, conq + 1);
    elecHit(t);
    checkStorm(t);
    // next attack time
    if (keystone === 'Lethal Tempo') bonusAs += ltStacks * R['Lethal Tempo'].asPerStack;
    if (hobLeft > 0) bonusAs += R['Hail of Blades'].as;
    const as = Math.min(hobLeft > 0 ? 99 : 2.5, data.kog.base.as * (1 + bonusAs / 100));
    t += 1 / as;
    if (plan.maxAutos && hits >= plan.maxAutos) break;
  }
  flush(plan.duration + 1);
  // Conqueror heal and FS gold reported separately
  return { total, hits, stormAt, fsGold: fsBonus * (R['First Strike'].goldShare / 100) };
}

export const KEYSTONES = [
  "Stormraider's Surge", 'Press the Attack', 'Lethal Tempo', 'First Strike', 'Electrocute',
  'Arcane Comet', 'Conqueror', 'Fleet Footwork', 'Hail of Blades', 'Dark Harvest', 'Deathfire Touch',
];

// Each scenario: a level, ranks, build and fight plan.
export function scenarios(data) {
  return [
    {
      id: 'l1', label: 'Level 1 trade', sub: 'W on, 3 autos (~2.7 s)', lvl: 1,
      ranks: { q: 0, w: 1, e: 0, r: 0 }, build: null,
      plan: { duration: 4, wOn: true, maxAutos: 3, casts: [] },
    },
    {
      id: 'l3', label: 'Level 3 trade', sub: 'Q, then 3 autos with W on', lvl: 3,
      ranks: { q: 1, w: 1, e: 1, r: 0 }, build: null,
      plan: { duration: 4, wOn: true, maxAutos: 3, casts: [{ t: 0, spell: 'q' }] },
    },
    {
      id: 'l6', label: 'Level 6 all-in', sub: 'Q, E, R and a full 8 s W', lvl: 6,
      ranks: { q: 1, w: 3, e: 1, r: 1 }, build: null,
      plan: { duration: 8, wOn: true, casts: [{ t: 0, spell: 'q' }, { t: 0.3, spell: 'e' }, { t: 1, spell: 'r' }] },
    },
    {
      id: 'mOn', label: 'Mid-game, on-hit', sub: 'level 11, 8 s W window', lvl: 11, buildKey: 'onhit',
      ranks: { q: 3, w: 5, e: 1, r: 2 },
      plan: { duration: 8, wOn: true, casts: [{ t: 0, spell: 'q' }, { t: 0.3, spell: 'e' }, { t: 1, spell: 'r' }, { t: 4, spell: 'r' }] },
    },
    {
      id: 'mAp', label: 'Mid-game, AP', sub: 'level 11, 8 s W window', lvl: 11, buildKey: 'ap',
      ranks: { q: 3, w: 5, e: 1, r: 2 },
      plan: { duration: 8, wOn: true, casts: [{ t: 0, spell: 'q' }, { t: 0.3, spell: 'e' }, { t: 1, spell: 'r' }, { t: 4, spell: 'r' }] },
    },
  ].map((sc) => ({ ...sc, build: sc.buildKey ? data.builds[sc.buildKey] : sc.build }));
}

export function runAll(data) {
  return scenarios(data).map((sc) => {
    const kog = kogAt(data, sc.lvl, { ranks: sc.ranks, build: sc.build });
    const enemy = enemyAt(data, sc.lvl);
    const base = simulate(data, kog, enemy, sc.plan, null);
    const rows = Object.fromEntries(KEYSTONES.map((k) => {
      const r = simulate(data, kog, enemy, sc.plan, k);
      return [k, { ...r, added: r.total - base.total, pct: (r.total / base.total - 1) * 100 }];
    }));
    return { ...sc, kog, enemy, base, rows };
  });
}

export { lerp, grow };

// ---- Kiting a diver ----
// A diver walks at Kog from the edge of his range. Kog attacks, then walks back between
// attacks (standing still only for the windup). Counts the attacks Kog lands before the
// diver reaches melee range, within one W window. Stormraider's speed starts once Kog has
// dealt 25% of the diver's max HP inside 3 s; Fleet's 15% for 1 s is counted too.
export function kite(data, kog, target, keystone, { diverMs, slow = 0, reach = 175, window = 8, wOn = true, casts = [] }) {
  const R = data.runes;
  const windupFrac = 0.16622;
  // Damage timeline vs this target decides when Stormraider's triggers.
  const probe = simulate(data, kog, target, { duration: window, wOn, casts }, null);
  const stormAt = keystone === "Stormraider's Surge" ? probe.stormAt : null;
  const stormCd = lerp(R["Stormraider's Surge"].cd, kog.lvl);
  let gap = kog.range;
  let t = 0;
  let autos = 0;
  let lt = 0;
  let hob = keystone === 'Hail of Blades' ? 2 : 0;
  const path = [[0, gap]];
  const msAt = (time) => {
    let bonus = 0;
    let s = slow;
    if (stormAt !== null && time >= stormAt && time < stormAt + R["Stormraider's Surge"].dur) {
      bonus += R["Stormraider's Surge"].ms / 100;
      s *= 0.5;
    }
    return kog.ms * (1 + bonus) * (1 - s);
  };
  while (t < window && gap > reach) {
    let bonusAs = kog.bonusAs + lt * (keystone === 'Lethal Tempo' ? R['Lethal Tempo'].asPerStack : 0) + (hob > 0 ? R['Hail of Blades'].as : 0);
    const as = Math.min(hob > 0 ? 99 : 2.5, data.kog.base.as * (1 + bonusAs / 100));
    const interval = 1 / as;
    const windup = interval * windupFrac;
    // windup: Kog stands, diver closes
    gap -= diverMs * windup;
    t += windup;
    if (gap <= reach) break;
    autos++;
    if (hob > 0) hob--;
    lt = Math.min(6, lt + 1);
    path.push([t, gap]);
    // rest of the cycle: both move in small steps
    const steps = 10;
    const dt = (interval - windup) / steps;
    for (let k = 0; k < steps; k++) {
      const away = msAt(t) * dt;
      const toward = diverMs * dt;
      // Kog only backs off as far as he needs to stay in range
      gap = Math.min(kog.range, gap - toward + away);
      t += dt;
      if (gap <= reach) break;
    }
    path.push([t, gap]);
  }
  void stormCd;
  const dmg = simulate(data, kog, target, { duration: window, wOn, casts, maxAutos: Math.max(1, autos) }, keystone);
  return { autos, caughtAt: gap <= reach ? t : null, path, stormAt, damage: autos ? dmg.total : 0 };
}
