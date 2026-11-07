// A fight model for comparing Kog'Maw item builds from first principles.
// Used by tools/build-kogmaw-items-aggro.mjs. Item numbers come from
// data/kogmaw-adc-items-aggro.json, Kog'Maw and rune numbers from data/kogmaw-adc-runes-aggro.json.
//
// What it does: buys a build path with a fixed amount of gold, then plays out one fight against
// one target, attack by attack, with item passives, Q shred, pen, crits (as an average), W uptime
// and, when asked, a chase where a diver walks at Kog.
// What it leaves out: mana, missed skillshots, cast times, the enemy hitting back, minions,
// and splash (Runaan's bolts, Statikk's chain). It is a ruler for comparing builds, not a predictor.
//
// Runes are the same for every build: page A from the runes page (Stormraider's Surge, Manaflow,
// Transcendence, Scorch; Legend: Alacrity, Coup de Grace; attack speed, move speed, scaling HP shards).

const lerp = ([a, b], lvl) => a + ((b - a) * (lvl - 1)) / 17;
const grow = (base, g, lvl) => base + g * (lvl - 1) * (0.7025 + 0.0175 * (lvl - 1));

// Skill order W > Q > E (W Q E W W R W Q W Q R Q Q E E R E E, the common order on u.gg).
export const RANKS = {
  6: { q: 1, w: 3, e: 1, r: 1 },
  9: { q: 2, w: 5, e: 1, r: 1 },
  11: { q: 3, w: 5, e: 1, r: 2 },
  14: { q: 5, w: 5, e: 2, r: 2 },
};
// Legend: Alacrity stacks assumed at each level (mostly from minions early).
const ALACRITY = { 6: 1, 9: 3, 11: 5, 14: 8 };

// Order Kog buys each item's parts in. Recurve Bow first on on-hit items (its 15 on-hit
// damage is the best early pressure per gold); Sheen first on spellblade items.
export const BUY_ORDER = {
  "Guinsoo's Rageblade": ['Recurve Bow', 'Pickaxe', 'Amplifying Tome'],
  'Blade of the Ruined King': ['Recurve Bow', 'Vampiric Scepter', 'Pickaxe'],
  Terminus: ['Recurve Bow', 'Hearthbound Axe'],
  'Kraken Slayer': ['Recurve Bow', 'Rectrix', 'Hearthbound Axe'],
  "Wit's End": ['Recurve Bow', 'Negatron Cloak'],
  'Navori Flickerblade': ['Dagger', 'Zeal'],
  'Statikk Shiv': ["Scout's Slingshot", 'Pickaxe', 'Aether Wisp'],
  "Nashor's Tooth": ['Recurve Bow', 'Blasting Wand', 'Fiendish Codex'],
  'Dusk and Dawn': ['Sheen', 'Dagger', 'Blasting Wand', 'Kindlegem'],
  'Lich Bane': ['Sheen', 'Aether Wisp', 'Blasting Wand'],
  "Rabadon's Deathcap": ['Needlessly Large Rod'],
  Shadowflame: ['Hextech Alternator', 'Needlessly Large Rod'],
  Stormsurge: ['Hextech Alternator', 'Aether Wisp'],
};

// What a path owns after spending `gold` (the starter is free: it is the 500 starting gold).
// Buys parts of the next item in order, skipping a part that does not fit, completes the item
// when it can, and buys plain Boots with change of 300 or more. Boots upgrade after item 1.
export function inventory(data, path, gold) {
  const I = data.items;
  let left = gold;
  const inv = [path.starter];
  let boots = null;
  const buyBoots = () => {
    if (!boots && left >= I.Boots.cost) {
      boots = 'Boots';
      left -= I.Boots.cost;
    }
  };
  for (let n = 0; n < path.items.length; n++) {
    const item = path.items[n];
    const parts = BUY_ORDER[item] ?? [];
    const owned = [];
    for (const p of parts) {
      if (left >= I[p].cost) {
        owned.push(p);
        left -= I[p].cost;
      }
    }
    const partsCost = owned.reduce((s, p) => s + I[p].cost, 0);
    const done = owned.length === parts.length && left >= I[item].cost - partsCost;
    if (done) {
      left -= I[item].cost - partsCost;
      inv.push(item);
    } else {
      inv.push(...owned);
      buyBoots();
      break;
    }
    if (n === 0) {
      buyBoots();
      const tier2 = I[path.boots].cost - I.Boots.cost;
      if (boots === 'Boots' && left >= tier2) {
        boots = path.boots;
        left -= tier2;
      }
    }
  }
  if (boots) inv.push(boots);
  return { inv, left, spent: gold - left };
}

const STAT_KEYS = ['ad', 'ap', 'as', 'ms', 'msPct', 'hp', 'armor', 'mr', 'crit', 'ah', 'mpen', 'mpenPct', 'ls', 'omni', 'apAmp'];

export function kogAt(data, rd, lvl, inv) {
  const b = rd.kog.base;
  const ranks = RANKS[lvl];
  const sum = Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
  for (const name of inv) {
    const it = data.items[name];
    if (!it) throw new Error(`unknown item ${name}`);
    for (const k of STAT_KEYS) sum[k] += it[k] ?? 0;
  }
  const has = (n) => inv.includes(n);
  const growthAs = b.asG * (lvl - 1) * (0.7025 + 0.0175 * (lvl - 1));
  const alacrity = 3 + 1.5 * ALACRITY[lvl];
  const bonusHp = sum.hp + lerp([10, 200], lvl);
  let ap = sum.ap + (has('Riftmaker') ? 0.02 * bonusHp : 0);
  ap *= 1 + sum.apAmp / 100;
  const baseAd = grow(b.ad, b.adG, lvl);
  return {
    lvl, ranks, inv, has,
    baseAd,
    ad: baseAd + sum.ad,
    bad: sum.ad,
    ap,
    bonusAs: growthAs + rd.kog.q.passiveAs[ranks.q - 1] + sum.as + 10 + alacrity,
    hp: grow(b.hp, b.hpG, lvl) + bonusHp,
    bonusHp,
    armor: grow(b.armor, b.armorG, lvl) + sum.armor,
    mr: grow(b.mr, b.mrG, lvl) + sum.mr,
    ms: (b.ms + sum.ms) * (1 + (sum.msPct + 2.5) / 100),
    range: b.range + rd.kog.w.range[ranks.w - 1],
    crit: Math.min(100, sum.crit) / 100,
    ah: sum.ah + (lvl >= 8 ? 10 : lvl >= 5 ? 5 : 0),
    mpen: sum.mpen,
    mpenPct: sum.mpenPct / 100,
    ls: sum.ls / 100,
    omni: sum.omni / 100,
  };
}

export function enemyAt(rd, lvl) {
  const e = rd.enemy.base;
  return { hp: grow(e.hp, e.hpG, lvl), armor: grow(e.armor, e.armorG, lvl), mr: grow(e.mr, e.mrG, lvl) };
}

// plan: { duration, casts: [{ t, spell }], autoCast: bool (Q and E again whenever ready),
//         wRecast: bool, maxAutos, chase: { diverMs, slow, reach } }
export function simulate(data, rd, kog, target, plan) {
  const K = rd.kog;
  const lvl = kog.lvl;
  const has = kog.has;
  const haste = 1 + kog.ah / 100;
  const storm = rd.runes["Stormraider's Surge"];
  let total = 0;
  let heal = 0;
  let killAt = null;
  const events = []; // [t, dmg]
  const pending = []; // [t, fn]
  let shredUntil = -1;
  let shredPct = 0;
  let attacks = 0;
  let seething = 0;
  let phantom = 0;
  let sbReady = false;
  let sbCdEnd = 0;
  let alternatorUsed = false;
  let scoutUsed = false;
  let joltUsed = false;
  let statikkCharge = 100;
  let ludenUsed = false;
  let scorchCdEnd = 0;
  let squallDone = false;
  let botrkCdEnd = 0;
  let botrkCount = 0;
  let diverSlowUntil = -1;
  let flurryUntil = -1;
  let stormAt = null;
  let wStart = 0;
  let wActive = true;
  let wCdEnd = (K.w.cd / haste);
  let qCdEnd = Infinity;
  let eCdEnd = Infinity;
  const spellbladeKind = has('Dusk and Dawn') ? 'dusk' : has('Lich Bane') ? 'lich' : has('Sheen') ? 'sheen' : null;

  const hpLeft = () => Math.max(0, target.hp - total);
  const lowHp = () => hpLeft() < 0.4 * target.hp;
  const magicMult = (t) => {
    const shred = t < shredUntil ? shredPct : 0;
    const mr = Math.max(0, target.mr * (1 - shred) * (1 - kog.mpenPct) * (1 - termPen()) - kog.mpen);
    return 100 / (100 + mr);
  };
  const physMult = (t) => {
    const shred = t < shredUntil ? shredPct : 0;
    const armor = target.armor * (1 - shred) * (1 - termPen());
    return 100 / (100 + Math.max(0, armor));
  };
  // Terminus: hits alternate Light, Dark; each Dark stack is 10% pen, up to 3.
  const termPen = () => (has('Terminus') ? Math.min(3, Math.floor(attacks / 2)) * 0.1 : 0);
  const amp = (t, type) => {
    let m = 1;
    if (has('Riftmaker')) m += Math.min(0.08, 0.02 * Math.floor(t));
    if (has("Liandry's Torment")) m += Math.min(0.06, 0.02 * Math.floor(t));
    if (lowHp()) {
      m *= 1.08; // Coup de Grace
      if (has('Shadowflame') && type !== 'phys') m *= 1.2;
    }
    return m;
  };
  const deal = (t, raw, type, { fromAttack = false } = {}) => {
    if (raw <= 0) return 0;
    let d = type === 'phys' ? raw * physMult(t) : type === 'magic' ? raw * magicMult(t) : raw;
    d *= amp(t, type);
    total += d;
    events.push([t, d]);
    heal += d * kog.omni + (fromAttack && type === 'phys' ? d * kog.ls : 0);
    if (killAt === null && total >= target.hp) killAt = t;
    if (!alternatorUsed && has('Hextech Alternator')) {
      alternatorUsed = true;
      deal(t, 65, 'magic');
    }
    if (!scoutUsed && has("Scout's Slingshot")) {
      scoutUsed = true;
      deal(t, 40, 'magic');
    }
    // Stormsurge: 25% max HP inside 2.5 s, lightning 2 s later.
    if (has('Stormsurge') && !squallDone) {
      const recent = events.filter(([et]) => t - et <= 2.5).reduce((s, [, x]) => s + x, 0);
      if (recent >= 0.25 * target.hp) {
        squallDone = true;
        pending.push([t + 2, (pt) => deal(pt, 125 + 0.1 * kog.ap, 'magic')]);
      }
    }
    if (stormAt === null) {
      const recent = events.filter(([et]) => t - et <= 3).reduce((s, [, x]) => s + x, 0);
      if (recent >= 0.25 * target.hp) stormAt = t;
    }
    return d;
  };

  const onHit = (t) => {
    if (wActive) {
      const pctHp = K.w.hpPct[kog.ranks.w - 1] + (K.w.hpPctPer100Ap * kog.ap) / 100;
      deal(t, (pctHp / 100) * target.hp, 'magic', { fromAttack: true });
    }
    if (has('Recurve Bow')) deal(t, 15, 'phys', { fromAttack: true });
    if (has("Guinsoo's Rageblade")) deal(t, 30, 'magic', { fromAttack: true });
    if (has('Blade of the Ruined King')) deal(t, 0.06 * hpLeft(), 'phys', { fromAttack: true });
    if (has("Wit's End")) deal(t, 45, 'magic', { fromAttack: true });
    if (has("Nashor's Tooth")) deal(t, 15 + 0.15 * kog.ap, 'magic', { fromAttack: true });
    if (has('Terminus')) deal(t, 30 + 0.1 * kog.bad + 0.1 * kog.ap, 'magic', { fromAttack: true });
  };

  const cast = (t, spell) => {
    const ap = kog.ap;
    if (spell === 'q') {
      const r = kog.ranks.q;
      deal(t, K.q.dmg[r - 1] + K.q.ap * ap, 'magic');
      shredPct = K.q.shred[r - 1] / 100;
      shredUntil = t + 4;
      qCdEnd = t + K.q.cd / haste;
    } else if (spell === 'e') {
      const r = kog.ranks.e;
      deal(t, K.e.dmg[r - 1] + K.e.ap * ap, 'magic');
      eCdEnd = t + K.e.cd / haste;
    } else if (spell === 'r') {
      const r = kog.ranks.r;
      const missing = 1 - hpLeft() / target.hp;
      const mult = lowHp() ? 2 : 1 + Math.min(0.5, (missing / 0.6) * 0.5);
      deal(t, (K.r.dmg[r - 1] + K.r.bad * kog.bad + K.r.ap[r - 1] * ap) * mult, 'magic');
    }
    if (!ludenUsed && has("Luden's Echo")) {
      ludenUsed = true;
      deal(t, 150 + 0.1 * ap, 'magic');
    }
    if (has("Liandry's Torment")) {
      for (let k = 1; k <= 6; k++) pending.push([t + k * 0.5, (pt) => deal(pt, 0.01 * target.hp, 'magic')]);
    }
    if (t >= scorchCdEnd) {
      scorchCdEnd = t + 10;
      pending.push([t + 1, (pt) => deal(pt, lerp([20, 42.35], lvl), 'magic')]);
    }
    if (spellbladeKind && t >= sbCdEnd) sbReady = true;
  };

  const flush = (upTo) => {
    pending.sort((a, b) => a[0] - b[0]);
    while (pending.length && pending[0][0] <= upTo) {
      const [pt, fn] = pending.shift();
      fn(pt);
    }
  };

  const casts = [...(plan.casts ?? [])].sort((a, b) => a.t - b.t);
  let ci = 0;
  const chase = plan.chase;
  let gap = chase ? kog.range - (chase.dash ?? 0) : null;
  let caughtAt = null;
  const path = chase ? [[0, gap]] : null;
  const windupFrac = 0.16622;
  const kogMs = (time) => {
    let bonus = 0;
    let s = chase.slow;
    if (stormAt !== null && time >= stormAt && time < stormAt + storm.dur) {
      bonus += storm.ms / 100;
      s *= 0.5;
    }
    return kog.ms * (1 + bonus) * (1 - s);
  };
  const diverMs = (time) => chase.diverMs * (time < diverSlowUntil ? 0.7 : 1);
  // Duel: once the diver reaches Kog he bursts, then deals steady damage until one of them dies.
  const duel = chase?.duel ?? null;
  let kogHp = kog.hp;
  let kogDiedAt = null;
  let healSeen = 0;
  let lastT = null;
  const hurt = (raw) => {
    const phys = duel.physShare;
    kogHp -= raw * (phys * (100 / (100 + kog.armor)) + (1 - phys) * (100 / (100 + kog.mr)));
  };

  let t = 0;
  while (t <= plan.duration + 1e-9) {
    // W window: on at 0 for 8 s; recast when ready if the plan allows it.
    if (wActive && t >= wStart + K.w.duration) wActive = false;
    if (!wActive && plan.wRecast && t >= wCdEnd) {
      wActive = true;
      wStart = t;
      wCdEnd = t + K.w.cd / haste;
    }
    while (ci < casts.length && casts[ci].t <= t) {
      flush(casts[ci].t);
      cast(casts[ci].t, casts[ci].spell);
      ci++;
    }
    if (plan.autoCast) {
      if (t >= qCdEnd) cast(t, 'q');
      if (t >= eCdEnd) cast(t, 'e');
    }
    flush(t);

    // attack timing
    let bonusAs = kog.bonusAs;
    if (has("Guinsoo's Rageblade")) bonusAs += 8 * seething;
    if (has('Yun Tal Wildarrows') && t < flurryUntil) bonusAs += 30;
    const as = Math.min(2.5, rd.kog.base.as * (1 + bonusAs / 100));
    const interval = 1 / as;

    if (chase && caughtAt === null) {
      const windup = interval * windupFrac;
      gap -= diverMs(t) * windup;
      t += windup;
      if (gap <= chase.reach) {
        gap = chase.reach;
        caughtAt = t;
        if (!duel) break;
        hurt(duel.burst);
      }
    }
    if (duel && caughtAt !== null) {
      // In melee: the diver deals steady damage between Kog's attacks; Kog heals from his items.
      if (lastT !== null) hurt(duel.dps * (t - lastT));
      kogHp = Math.min(kog.hp, kogHp + (heal - healSeen));
      healSeen = heal;
      lastT = t;
      if (kogHp <= 0) {
        kogDiedAt = t;
        break;
      }
      if (killAt !== null) break;
    }

    // the attack lands at t
    attacks++;
    if (has('Yun Tal Wildarrows') && attacks === 1) flurryUntil = t + 6;
    const critMult = 1 + kog.crit * (0.75 + (has('Infinity Edge') ? 0.3 : 0));
    deal(t, kog.ad * critMult, 'phys', { fromAttack: true });
    onHit(t);
    if (!joltUsed && has('Kircheis Shard')) {
      joltUsed = true;
      deal(t, 50, 'magic');
    }
    if (has('Statikk Shiv')) {
      if (statikkCharge >= 100) {
        statikkCharge = 0;
        deal(t, 60, 'magic');
      } else statikkCharge += 17; // 15 per attack plus a little from moving
    }
    if (has('Kraken Slayer') && attacks % 3 === 0) {
      const missing = 1 - hpLeft() / target.hp;
      deal(t, lerp([120, 168], lvl) * (1 + 0.75 * missing), 'phys', { fromAttack: true });
    }
    if (has('Blade of the Ruined King') && t >= botrkCdEnd) {
      botrkCount++;
      if (botrkCount === 3) {
        botrkCount = 0;
        botrkCdEnd = t + 15;
        diverSlowUntil = t + 1;
      }
    }
    if (sbReady) {
      sbReady = false;
      sbCdEnd = t + 1.5;
      if (spellbladeKind === 'dusk') {
        deal(t, 0.75 * kog.baseAd + 0.1 * kog.ap, 'magic');
        heal += 0.1 * kog.ap + 0.03 * kog.bonusHp;
        pending.push([t + 0.2, (pt) => onHit(pt)]);
      } else if (spellbladeKind === 'lich') {
        deal(t, 0.75 * kog.baseAd + 0.45 * kog.ap, 'magic');
      } else {
        deal(t, kog.baseAd, 'phys');
      }
    }
    if (has("Guinsoo's Rageblade")) {
      if (seething >= 4) {
        if (phantom === 2) {
          phantom = 0;
          pending.push([t + 0.15, (pt) => onHit(pt)]);
        } else phantom++;
      }
      seething = Math.min(4, seething + 1);
    }
    // Navori: each attack cuts remaining Q, W, E cooldowns by 15%.
    if (has('Navori Flickerblade')) {
      const cut = (end) => (end > t && end !== Infinity ? t + (end - t) * 0.85 : end);
      qCdEnd = cut(qCdEnd);
      eCdEnd = cut(eCdEnd);
      wCdEnd = cut(wCdEnd);
    }
    if (chase) path.push([t, gap]);
    if (duel && killAt !== null && caughtAt === null) break; // the diver died before reaching Kog

    if (chase && caughtAt === null) {
      const rest = interval * (1 - windupFrac);
      const steps = 10;
      const dt = rest / steps;
      for (let k = 0; k < steps; k++) {
        gap = Math.min(wActive ? kog.range : rd.kog.base.range, gap - diverMs(t) * dt + kogMs(t) * dt);
        t += dt;
        if (gap <= chase.reach) break;
      }
      path.push([t, gap]);
      if (gap <= chase.reach) {
        gap = chase.reach;
        caughtAt = t;
        if (!duel) break;
        hurt(duel.burst);
        lastT = t;
      }
    } else {
      t += interval;
    }
    if (plan.maxAutos && attacks >= plan.maxAutos) break;
  }
  if (!duel) flush((caughtAt ?? plan.duration) + 3);
  return { total, heal, attacks, killAt, stormAt, caughtAt, path, kogDiedAt, kogHpLeft: duel ? Math.max(0, kogHp) : null, kogMaxHp: kog.hp };
}

// ---- Build paths ----
export const PATHS = [
  { id: 'rbt', family: 'onhit', starter: "Doran's Bow", boots: "Berserker's Greaves", items: ["Guinsoo's Rageblade", 'Blade of the Ruined King', 'Terminus'] },
  { id: 'brt', family: 'onhit', starter: "Doran's Bow", boots: "Berserker's Greaves", items: ['Blade of the Ruined King', "Guinsoo's Rageblade", 'Terminus'] },
  { id: 'rtb', family: 'onhit', starter: "Doran's Bow", boots: "Berserker's Greaves", items: ["Guinsoo's Rageblade", 'Terminus', 'Blade of the Ruined King'] },
  { id: 'rnt', family: 'onhit', starter: "Doran's Bow", boots: 'Gluttonous Greaves', items: ["Guinsoo's Rageblade", 'Navori Flickerblade', 'Terminus'] },
  { id: 'krt', family: 'onhit', starter: "Doran's Bow", boots: "Berserker's Greaves", items: ['Kraken Slayer', "Guinsoo's Rageblade", 'Terminus'] },
  { id: 'rwt', family: 'onhit', starter: "Doran's Bow", boots: "Berserker's Greaves", items: ["Guinsoo's Rageblade", "Wit's End", 'Terminus'] },
  { id: 'dnr', family: 'ap', starter: "Doran's Ring", boots: "Sorcerer's Shoes", items: ['Dusk and Dawn', "Nashor's Tooth", "Rabadon's Deathcap"] },
  { id: 'dsr', family: 'ap', starter: "Doran's Ring", boots: "Sorcerer's Shoes", items: ['Dusk and Dawn', 'Shadowflame', "Rabadon's Deathcap"] },
  { id: 'ndr', family: 'ap', starter: "Doran's Ring", boots: "Sorcerer's Shoes", items: ["Nashor's Tooth", 'Dusk and Dawn', "Rabadon's Deathcap"] },
  { id: 'lnr', family: 'ap', starter: "Doran's Ring", boots: "Sorcerer's Shoes", items: ['Lich Bane', "Nashor's Tooth", "Rabadon's Deathcap"] },
  { id: 'snr', family: 'ap', starter: "Doran's Ring", boots: "Sorcerer's Shoes", items: ['Stormsurge', "Nashor's Tooth", "Rabadon's Deathcap"] },
  { id: 'rnd', family: 'hybrid', starter: "Doran's Bow", boots: "Berserker's Greaves", items: ["Guinsoo's Rageblade", "Nashor's Tooth", 'Dusk and Dawn'] },
  { id: 'rdn', family: 'hybrid', starter: "Doran's Bow", boots: "Berserker's Greaves", items: ["Guinsoo's Rageblade", 'Dusk and Dawn', "Nashor's Tooth"] },
  { id: 'drn', family: 'hybrid', starter: "Doran's Ring", boots: "Sorcerer's Shoes", items: ['Dusk and Dawn', "Guinsoo's Rageblade", "Nashor's Tooth"] },
];

// Gold spent beyond the starter at each checkpoint (a typical lane: ~1,300 on the first back,
// item 1 and boots by level 9, item 2 and tier 2 boots by level 11, item 3 by level 14).
export const CHECKPOINTS = [
  { id: 'back', lvl: 6, gold: 1300, label: 'First back', sub: 'level 6, 1,300 gold' },
  { id: 'one', lvl: 9, gold: 3500, label: 'Item 1', sub: 'level 9, 3,500 gold' },
  { id: 'two', lvl: 11, gold: 7400, label: 'Item 2', sub: 'level 11, 7,400 gold' },
  { id: 'three', lvl: 14, gold: 10600, label: 'Item 3', sub: 'level 14, 10,600 gold' },
];

// A diver at each checkpoint (bruiser or assassin with matching items): HP, resists, move speed,
// the burst he lands on arrival and his steady damage per second after that (60% physical).
export const DIVERS = {
  6: { hp: 1800, armor: 70, mr: 45, ms: 375, dash: 300, burst: 450, dps: 280 },
  9: { hp: 2600, armor: 100, mr: 58, ms: 385, dash: 300, burst: 700, dps: 450 },
  11: { hp: 3300, armor: 130, mr: 72, ms: 390, dash: 300, burst: 1000, dps: 600 },
  14: { hp: 4200, armor: 165, mr: 90, ms: 400, dash: 300, burst: 1400, dps: 820 },
};
export const FRONTLINE = { hp: 3600, armor: 170, mr: 120 };

// The same four spells for every build, in one of two timings: front-loaded (Q, E, R at once)
// or spaced 1.6 s apart so each spell empowers an attack (how Sheen, Lich Bane and Dusk and Dawn
// are played). Each fight is run both ways and the better result is kept: a good player picks.
export const TIMINGS = {
  burst: [{ t: 0, spell: 'q' }, { t: 0.3, spell: 'e' }, { t: 1, spell: 'r' }, { t: 4, spell: 'r' }],
  spaced: [{ t: 0, spell: 'q' }, { t: 1.6, spell: 'e' }, { t: 3.2, spell: 'r' }, { t: 4.8, spell: 'r' }],
};
const better = (a, b, score) => (score(b) > score(a) ? b : a);
const killScore = (r) => (r.killAt !== null ? 100 - r.killAt : 0) + r.total / 1e6;

export function skirmish(data, rd, kog, target, duration = 8) {
  const run = (casts) => ({ ...simulate(data, rd, kog, target, { duration, casts }), timing: casts === TIMINGS.burst ? 'burst' : 'spaced' });
  return better(run(TIMINGS.burst), run(TIMINGS.spaced), killScore);
}

export function duel(data, rd, kog, lvl, slow) {
  const d = DIVERS[lvl];
  const run = (casts) => simulate(data, rd, kog, d, {
    duration: 14, casts,
    chase: { diverMs: d.ms, slow, reach: 175, dash: d.dash, duel: { burst: d.burst, dps: d.dps, physShare: 0.6 } },
  });
  return better(run(TIMINGS.burst), run(TIMINGS.spaced), (r) => duelScore(r, d.hp) - (r.killAt ?? 99) / 1000);
}

export function evaluate(data, rd, path) {
  const out = { path, at: {} };
  for (const cp of CHECKPOINTS) {
    const { inv, left } = inventory(data, path, cp.gold);
    const kog = kogAt(data, rd, cp.lvl, inv);
    const adc = enemyAt(rd, cp.lvl);
    const r = { inv, left, kog };
    // Short trade: Q, then 4 autos with W on.
    r.trade = simulate(data, rd, kog, adc, { duration: 4, maxAutos: 4, casts: [{ t: 0, spell: 'q' }] });
    // 8 s skirmish standing on an enemy ADC: Q, E, R, R and one W window. Damage and time to kill.
    r.skirmish = skirmish(data, rd, kog, adc);
    // A diver walks at Kog from the edge of W range; Kog kites, then they trade until one dies.
    r.duelOpen = duel(data, rd, kog, cp.lvl, 0);
    r.duelSlow = duel(data, rd, kog, cp.lvl, 0.3);
    // 16 s on a tanky frontliner: Q and E whenever ready, W recast when ready, R every ~4 s.
    r.front = simulate(data, rd, kog, FRONTLINE, {
      duration: 16, wRecast: true, autoCast: true,
      casts: [{ t: 0, spell: 'q' }, { t: 0.3, spell: 'e' }, { t: 1, spell: 'r' }, { t: 4, spell: 'r' }, { t: 8, spell: 'r' }, { t: 12, spell: 'r' }],
    });
    out.at[cp.id] = r;
  }
  return out;
}

// Duel score: + Kog's HP left (as a share) if the diver dies first, - the diver's HP left if Kog dies.
export function duelScore(r, diverHp) {
  if (r.killAt !== null && (r.kogDiedAt === null || r.killAt <= r.kogDiedAt)) return r.kogHpLeft / r.kogMaxHp;
  return -Math.max(0, diverHp - r.total) / diverHp;
}

export { lerp, grow };
