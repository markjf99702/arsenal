// The at-bat lab: plays thousands of at-bats with the pitcher choosing for himself, and measures them the way
// Statcast measures the league. Used by tools/calibrate.mjs and test/atbat.test.mjs, which hold the hitter to the same
// checks (checks, below): the test fails on knobs that miss them, and the calibrator won't write them.
import { LEAGUE, COUNTS, TYPES, ZONES, HITTERS } from '../js/league.js';
import { autoAtBat, autoCall, startAtBat, throwCall, spotById, pitcherByKey, AVERAGE, LEAGUE_ARM, PITCHERS, ZONE, inZone } from '../js/atbat.js';

const L = LEAGUE;
const outOfZone = L.pitches - L.zone.pitches;
const chaseSwings = L.swings - L.zone.swings;
export const TARGET = {
  k: L.so / L.pa, bb: L.bb / L.pa, hbp: L.hbp / L.pa, ppa: L.pitches / L.pa,
  swing: L.swings / L.pitches, whiff: L.whiffs / L.swings,
  zone: L.zone.pitches / L.pitches,
  zoneSwing: L.zone.swings / L.zone.pitches, zoneWhiff: L.zone.whiffs / L.zone.swings,
  chaseSwing: chaseSwings / outOfZone, chaseWhiff: (L.whiffs - L.zone.whiffs) / chaseSwings,
  calledZone: L.zone.called / (L.zone.pitches - L.zone.swings),
  calledChase: (L.called - L.zone.called) / (outOfZone - chaseSwings),
  foul: (L.swings - L.whiffs - L.bip) / (L.swings - L.whiffs),
  hitsPerBip: L.hits / L.bip, hrPerBip: L.hrs / L.bip,
  avg: L.hits / (L.pa - L.bb - L.hbp - Math.max(0, L.pa - L.bb - L.hbp - (L.so + L.bip))),
};

// The batter for the i-th at-bat of a lab run: right-handed as often as the pitcher's batters were in 2026 (paBy), and
// for the league-average righty and the league's arm, on his side of the plate as often as the league's were.
export function batterFor(pitcher, i) {
  const r = pitcher.paBy ? pitcher.paBy.R / (pitcher.paBy.R + pitcher.paBy.L) : pitcher.hand === 'R' ? PLATOON.sameShare : 1 - PLATOON.sameShare;
  return Math.floor((i + 1) * r) > Math.floor(i * r) ? 'R' : 'L';
}
// The at-bats of a lab run: `pas` of them for each seed (one, or a list to pool), to a hitter of one kind.
function* atBats(pitcher, params, pas, seeds, hitter = 'average') {
  for (const seed of [seeds].flat()) for (let i = 0; i < pas; i++) yield autoAtBat({ pitcher, batter: batterFor(pitcher, i), hitter, seed: (seed * 1000003 + i * 7919) >>> 0, params });
}

// Where a pitch crossed, as Statcast's zones put it: 'middle' (zone 5), 'edge' (2, 4, 6, 8, the middle of each side),
// 'corner' (1, 3, 7, 9), or 'out' of the zone (11 to 14). And 2026's swings, whiffs, balls in play and their wOBA in
// each (wOBA on contact: Statcast's weights for each hit, summed over balls in play).
export function zoneGroup(x, z) {
  if (!inZone(x, z)) return 'out';
  const third = (v, lo, hi) => Math.min(2, Math.max(0, Math.floor((3 * (v - lo)) / (hi - lo))));
  const c = third(x, -ZONE.half, ZONE.half), r = third(z, ZONE.bottom, ZONE.top);
  return c === 1 && r === 1 ? 'middle' : c === 1 || r === 1 ? 'edge' : 'corner';
}
// A swing that missed, as Statcast counts its whiffs: a foul tip is one.
export const MISSED = p => p.result === 'whiff' || p.result === 'tip';
// What Statcast's wOBA counts a ball in play as (wobaOf), and the end of a plate appearance (wobaEnd).
const W = LEAGUE.woba, wobaOf = play => ({ '1B': W['1B'], '2B': W['2B'], '3B': W['3B'], HR: W.HR }[play] || 0);
const wobaEnd = r => ({ BB: W.BB, HBP: W.HBP, '1B': W['1B'], '2B': W['2B'], '3B': W['3B'], HR: W.HR }[r] || 0);
export const GROUPS = {};
for (const [zn, v] of Object.entries(ZONES)) {
  const g = GROUPS[zn === '5' ? 'middle' : Number(zn) > 9 ? 'out' : ['1', '3', '7', '9'].includes(zn) ? 'corner' : 'edge'] ||= { pitches: 0, swings: 0, whiffs: 0, bip: 0, w: 0 };
  g.pitches += v.pitches; g.swings += v.swings; g.whiffs += v.whiffs; g.bip += v.bip;
  g.w += W['1B'] * v.singles + W['2B'] * v.doubles + W['3B'] * v.triples + W.HR * v.hrs;
}
for (const g of Object.values(GROUPS)) Object.assign(g, { whiff: g.whiffs / g.swings, wobacon: g.w / g.bip });

// The platoon split, 2026's: each hand of pitcher to each side of the plate pooled into the same side (RR and LL) and
// the other (RL and LR). Its wOBA (Statcast's weights over plate appearances, as the lab counts it), misses per swing,
// chases and wOBA on contact; and how many of the league's plate appearances were on the same side, 42%.
const sum = (a, b, f) => f(L.platoon[a]) + f(L.platoon[b]);
const line = (a, b) => {
  const hits = p => W['1B'] * p.singles + W['2B'] * p.doubles + W['3B'] * p.triples + W.HR * p.hrs;
  return {
    pa: sum(a, b, p => p.pa), woba: sum(a, b, p => W.BB * p.bb + W.HBP * p.hbp + hits(p)) / sum(a, b, p => p.pa),
    whiff: sum(a, b, p => p.whiffs) / sum(a, b, p => p.swings), wobacon: sum(a, b, p => hits(p)) / sum(a, b, p => p.bip),
    chase: sum(a, b, p => p.swings - p.zone.swings) / sum(a, b, p => p.pitches - p.zone.pitches),
    k: sum(a, b, p => p.so) / sum(a, b, p => p.pa), bb: sum(a, b, p => p.bb) / sum(a, b, p => p.pa),
  };
};
export const PLATOON = { same: line('RR', 'LL'), other: line('RL', 'LR'), lines: Object.fromEntries(['RR', 'RL', 'LR', 'LL'].map(k => [k, line(k, k)])) };
PLATOON.sameShare = PLATOON.same.pa / (PLATOON.same.pa + PLATOON.other.pa);

// How much likelier a miss is right after a pitch 6 mph apart than right after the same pitch: the log of the
// Mantel-Haenszel odds ratio over strata of { same: [swings, whiffs], apart: [swings, whiffs] }, as tools/league.mjs
// works out 2026's.
export function oddsAfter(strata) {
  let num = 0, den = 0, apart = 0, same = 0;
  for (const { same: [n0, w0], apart: [n1, w1] } of Object.values(strata)) {
    if (!n0 || !n1) continue;
    num += (w1 * (n0 - w0)) / (n0 + n1); den += (w0 * (n1 - w1)) / (n0 + n1);
    apart += n1; same += n0;
  }
  return { lor: Math.log(num / den), apart, same };
}

export function measure(params, pas = 6000, seed = 1) {
  const c = { pa: 0, pitches: 0, k: 0, bb: 0, hbp: 0, swing: 0, whiff: 0, zone: 0, zoneSwing: 0, zoneWhiff: 0, chaseSwing: 0, chaseWhiff: 0, zoneTake: 0, zoneCalled: 0, chaseTake: 0, chaseCalled: 0, contact: 0, foul: 0, bip: 0, hits: 0, hr: 0, ab: 0 };
  const counts = {}, types = {}, groups = {}, after = {}, contactScores = [];
  const sides = { same: {}, other: {} };
  for (const ab of atBats(LEAGUE_ARM, params, pas, seed)) {
    const sd = sides[ab.batter === LEAGUE_ARM.hand ? 'same' : 'other'];
    for (const k of ['pa', 'w', 'k', 'bb', 'swings', 'whiffs', 'out', 'chases', 'bip', 'wc']) sd[k] ||= 0;
    sd.pa++; sd.w += wobaEnd(ab.result);
    if (ab.result === 'K' || ab.result === 'KL') sd.k++;
    if (ab.result === 'BB') sd.bb++;
    for (const p of ab.pitches) {
      if (p.swing) { sd.swings++; if (MISSED(p)) sd.whiffs++; }
      if (!p.inZone) { sd.out++; if (p.swing) sd.chases++; }
      if (p.result === 'inplay') { sd.bip++; sd.wc += wobaOf(p.play); }
    }
    // Each swing beside the pitch before it: the same kind, or one at least 6 mph faster or slower, compared within the
    // same kind of pitch, count and height, as tools/league.mjs compares 2026's (LEAGUE.after).
    ab.pitches.forEach((p, i) => {
      const q = ab.pitches[i - 1];
      if (!p.swing || !q) return;
      const rel = q.code === p.code ? 'same' : Math.abs(q.mph - p.mph) >= 6 ? 'apart' : null;
      if (!rel) return;
      const where = p.inZone ? 'in' : p.plate[1] > (ZONE.top + ZONE.bottom) / 2 ? 'high' : 'low';
      const g = ((after[`${p.code}|${p.before.balls}-${p.before.strikes}|${where}`] ||= { same: [0, 0], apart: [0, 0] }))[rel];
      g[0]++; if (MISSED(p)) g[1]++;
    });
    c.pa++;
    if (ab.result === 'K' || ab.result === 'KL') c.k++;
    if (ab.result === 'BB') c.bb++;
    if (ab.result === 'HBP') c.hbp++;
    for (const p of ab.pitches) {
      c.pitches++;
      const ck = `${p.before.balls}-${p.before.strikes}`;
      const cc = counts[ck] ||= { pitches: 0, swings: 0, zone: 0, whiffs: 0, fouls: 0, contact: 0, zoneTake: 0, zoneCalled: 0, chaseTake: 0, chaseCalled: 0 };
      const tc = types[p.code] ||= { pitches: 0, swings: 0, whiffs: 0, zone: 0, zoneSwings: 0 };
      const gc = groups[zoneGroup(p.plate[0], p.plate[1])] ||= { pitches: 0, swings: 0, whiffs: 0, bip: 0, w: 0 };
      cc.pitches++; tc.pitches++; gc.pitches++;
      if (p.swing) { gc.swings++; if (MISSED(p)) gc.whiffs++; }
      if (p.result === 'inplay') { gc.bip++; gc.w += wobaOf(p.play); }
      if (p.inZone) { c.zone++; cc.zone++; tc.zone++; }
      if (p.swing) {
        c.swing++; cc.swings++; tc.swings++; if (p.inZone) tc.zoneSwings++;
        const missed = MISSED(p);
        if (missed) { c.whiff++; tc.whiffs++; cc.whiffs++; } else { cc.contact++; if (p.result === 'foul') cc.fouls++; }
        if (p.inZone) { c.zoneSwing++; if (missed) c.zoneWhiff++; } else { c.chaseSwing++; if (missed) c.chaseWhiff++; }
        if (!missed) { c.contact++; if (p.result === 'foul') c.foul++; }
        if (p.result === 'inplay') {
          c.bip++; contactScores.push(p.contact);
          if (p.play !== 'out') c.hits++;
          if (p.play === 'HR') c.hr++;
        }
      } else if (p.result !== 'hbp') {
        const called = p.result === 'called';
        if (p.inZone) { c.zoneTake++; cc.zoneTake++; if (called) { c.zoneCalled++; cc.zoneCalled++; } } else { c.chaseTake++; cc.chaseTake++; if (called) { c.chaseCalled++; cc.chaseCalled++; } }
      }
    }
  }
  const outZ = c.pitches - c.zone;
  return {
    pa: c.pa, k: c.k / c.pa, bb: c.bb / c.pa, hbp: c.hbp / c.pa, ppa: c.pitches / c.pa,
    swing: c.swing / c.pitches, whiff: c.whiff / c.swing, zone: c.zone / c.pitches,
    zoneSwing: c.zoneSwing / c.zone, zoneWhiff: c.zoneWhiff / c.zoneSwing,
    chaseSwing: c.chaseSwing / outZ, chaseWhiff: c.chaseWhiff / c.chaseSwing,
    calledZone: c.zoneCalled / c.zoneTake, calledChase: c.chaseCalled / c.chaseTake,
    foul: c.foul / c.contact, hitsPerBip: c.hits / c.bip, hrPerBip: c.hr / c.bip,
    counts: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, {
      pitches: v.pitches, swing: v.swings / v.pitches, zone: v.zone / v.pitches, whiff: v.whiffs / v.swings, foul: v.fouls / v.contact,
      calledZone: v.zoneCalled / v.zoneTake, calledOut: v.chaseCalled / v.chaseTake, zoneTake: v.zoneTake, chaseTake: v.chaseTake,
    }])),
    types: Object.fromEntries(Object.entries(types).map(([k, v]) => [k, {
      pitches: v.pitches, swings: v.swings, zone: v.zone / v.pitches, whiff: v.whiffs / v.swings,
      zonePitches: v.zone, zoneSwing: v.zoneSwings / v.zone, chaseSwing: (v.swings - v.zoneSwings) / (v.pitches - v.zone),
    }])),
    after: oddsAfter(after),
    groups: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, { pitches: v.pitches, swings: v.swings, bip: v.bip, whiff: v.whiffs / v.swings, wobacon: v.w / v.bip }])),
    platoon: Object.fromEntries(Object.entries(sides).map(([k, v]) => [k, { pa: v.pa, woba: v.w / v.pa, k: v.k / v.pa, bb: v.bb / v.pa, whiff: v.whiffs / v.swings, chase: v.chases / v.out, wobacon: v.wc / v.bip }])),
    contactScores,
  };
}

// Each real pitcher's simulated miss rate per pitch, beside his real one (rows, with how often each crossed in the zone:
// zone and zoneReal), and per plate appearance his strikeouts (k), walks (bb) and wOBA (woba), and his wOBA on contact
// (wobacon, over balls in play). `seed` is one, or a list to pool.
// His real ones, from js/league.js: wOBA with Statcast's weights over his plate appearances, as the lab counts it.
export function realLine(p) {
  const hits = W['1B'] * p.singles + W['2B'] * p.doubles + W['3B'] * p.triples + W.HR * p.hrs;
  return { k: p.so / p.pa, bb: p.bb / p.pa, woba: (W.BB * p.bb + W.HBP * p.hbp + hits) / p.pa, wobacon: hits / p.bip, pa: p.pa };
}
export function measurePitchers(params, pas = 1500, seed = 1) {
  const out = {};
  for (const pitcher of PITCHERS.filter(p => p.key !== 'average')) {
    const t = {};
    let n = 0, k = 0, bb = 0, w = 0, bip = 0, wc = 0;
    for (const ab of atBats(pitcher, params, pas, seed)) {
      n++; if (ab.result === 'K' || ab.result === 'KL') k++;
      if (ab.result === 'BB') bb++;
      w += wobaEnd(ab.result);
      for (const p of ab.pitches) {
        const c = t[p.code] ||= { swings: 0, whiffs: 0, pitches: 0, zone: 0 };
        c.pitches++; if (p.inZone) c.zone++;
        if (p.swing) { c.swings++; if (MISSED(p)) c.whiffs++; }
        if (p.result === 'inplay') { bip++; wc += wobaOf(p.play); }
      }
    }
    const real = realLine(pitcher);
    out[pitcher.key] = {
      rows: pitcher.pitches.map(e => ({
        code: e.code, share: e.share, real: e.whiff, sim: t[e.code] ? t[e.code].whiffs / Math.max(1, t[e.code].swings) : null, swings: t[e.code]?.swings || 0,
        zone: t[e.code] ? t[e.code].zone / t[e.code].pitches : null, zoneReal: e.zone, pitches: t[e.code]?.pitches || 0,
      })),
      k: { sim: k / n, real: real.k, pa: pitcher.pa },
      bb: { sim: bb / n, real: real.bb, pa: pitcher.pa },
      woba: { sim: w / n, real: real.woba, pa: pitcher.pa },
      wobacon: { sim: wc / bip, real: real.wobacon, bip },
    };
  }
  return out;
}

// The quarters of 2026's qualified hitters the hitter types are tuned to (js/league.js, HITTERS), as the lab counts them:
// chases (swings at pitches out of the zone), swings in the zone, misses per swing, wOBA on contact, strikeouts and walks.
export const QUARTERS = Object.fromEntries(['free', 'patient', 'contact', 'power'].map(k => {
  const h = HITTERS[k];
  return [k, {
    chase: (h.swings - h.zoneSwings) / (h.pitches - h.zone), zoneSwing: h.zoneSwings / h.zone, whiff: h.whiffs / h.swings,
    wobacon: (W['1B'] * h.singles + W['2B'] * h.doubles + W['3B'] * h.triples + W.HR * h.hrs) / h.bip, k: h.so / h.pa, bb: h.bb / h.pa,
  }];
}));
// Each kind of hitter against the league's arm, on each seed (per) and pooled: the same as QUARTERS gives.
export function measureHitters(params, pas = 3000, seeds = [1]) {
  const out = {};
  for (const type of Object.keys(QUARTERS)) {
    const per = [...[seeds].flat(), null].map(() => ({ pa: 0, k: 0, bb: 0, pitches: 0, zone: 0, swings: 0, zoneSwings: 0, whiffs: 0, bip: 0, wc: 0 }));
    [seeds].flat().forEach((seed, i) => {
      for (const ab of atBats(LEAGUE_ARM, params, pas, seed, type)) for (const c of [per[i], per.at(-1)]) {
        c.pa++; if (ab.result === 'K' || ab.result === 'KL') c.k++; if (ab.result === 'BB') c.bb++;
        for (const p of ab.pitches) {
          c.pitches++; if (p.inZone) c.zone++;
          if (p.swing) { c.swings++; if (p.inZone) c.zoneSwings++; if (MISSED(p)) c.whiffs++; }
          if (p.result === 'inplay') { c.bip++; c.wc += wobaOf(p.play); }
        }
      }
    });
    const rates = c => ({ chase: (c.swings - c.zoneSwings) / (c.pitches - c.zone), zoneSwing: c.zoneSwings / c.zone, whiff: c.whiffs / c.swings, wobacon: c.wc / c.bip, k: c.k / c.pa, bb: c.bb / c.pa });
    out[type] = { ...rates(per.at(-1)), per: per.slice(0, -1).map(rates) };
  }
  return out;
}

// Changing speeds: the league-average righty's changeup down in the zone at 0-1, right after a four-seamer down the
// middle and right after a changeup there, `throws` times each. Misses per swing at the changeup, after each.
export function speedChange(params, throws = 600) {
  const after = prevCode => {
    let swings = 0, whiffs = 0;
    for (let i = 0; i < throws; i++) {
      const ab = startAtBat({ pitcher: AVERAGE, seed: 900 + i, params });
      throwCall(ab, { code: prevCode, spot: spotById('00') });
      if (ab.result) continue;
      ab.balls = 0; ab.strikes = 1;
      const r = throwCall(ab, { code: 'CH', spot: spotById('m10') });
      if (r.swing) { swings++; if (MISSED(r)) whiffs++; }
    }
    return whiffs / swings;
  };
  return { afterFastball: after('FF'), afterChangeup: after('CH') };
}

// Plans a pitcher could follow instead of calling his own pitches, each against his own calls (autoCall) on the same
// at-bats: `pas` a seed. A call for each pitch, from its number in the at-bat (0 first). For each: wOBA allowed and
// strikeouts per plate appearance, on each seed and pooled.
const S = id => spotById(id);
const own = (j, ab) => autoCall(ab);
const middle = (j, ab) => ({ code: autoCall(ab).code, spot: S('00') });
const every = (code, spot) => () => ({ code, spot: S(spot) });
const turns = (a, sa, b, sb) => j => (j % 2 ? { code: b, spot: S(sb) } : { code: a, spot: S(sa) });
// The pitchers for whom down the middle every pitch does about as well as their own calls (checks, below).
export const MIDDLING = new Set(['miller', 'rogers']);
// Each plan: the pitcher, what it is, its calls, and whether it does about as well as his own calls (checks, below).
export const PLANS = {
  // Down the middle every pitch, with his own mix: every pitcher.
  middle: PITCHERS.map(p => [p.key, 'down the middle every pitch', middle, MIDDLING.has(p.key)]),
  // One pitch to one spot every time: Misiorowski's curve down and away, the league-average righty's curve at the knees,
  // Miller's slider down and away.
  one: [['misiorowski', 'his curve down and away every pitch', every('CU', 'm11')], ['average', 'his curve down in the zone every pitch', every('CU', 'm10')],
    ['miller', 'his slider down and away every pitch', every('SL', 'm11')]],
  // Two pitches in turn, the same two spots.
  two: [['average', 'curve and slider at the knees in turn', turns('CU', 'm10', 'SL', 'm10')], ['skenes', 'splitter and slider down and away in turn', turns('FS', 'm11', 'SL', 'm11')],
    ['gausman', 'four-seamer up and splitter down in turn', turns('FF', '10', 'FS', 'm10')], ['sale', 'four-seamer up and slider down and away in turn', turns('FF', '10', 'SL', 'm11')]],
};
// Mason Miller's four-seamer up in the zone and his slider down and away, in turn: no surer a strikeout than his real
// 47.4%, on any seed.
export const MILLER = ['miller', 'four-seamer up and slider down and away in turn', turns('FF', '10', 'SL', 'm11')];
export function plan(params, key, call, pas = 1000, seeds = SEEDS) {
  const pitcher = pitcherByKey(key), per = [];
  for (const seed of seeds) {
    let k = 0, w = 0;
    for (let i = 0; i < pas; i++) {
      const ab = startAtBat({ pitcher, batter: batterFor(pitcher, i), seed: (seed * 1000003 + i * 7919) >>> 0, params });
      for (let j = 0; !ab.result; j++) throwCall(ab, call(j, ab));
      if (ab.result === 'K' || ab.result === 'KL') k++;
      w += wobaEnd(ab.result);
    }
    per.push({ k: k / pas, w: w / pas });
  }
  return { per, k: per.reduce((a, x) => a + x.k, 0) / per.length, w: per.reduce((a, x) => a + x.w, 0) / per.length };
}

// What the hitter is held to, on three seeds pooled, so knobs that only pass on the seed they were tuned on don't pass:
// 3,000 at-bats a seed for the league, and 16,000 for each kind of pitch (enough for one thrown as seldom as the
// knuckle curve, 2% of the league's pitches) and the platoon split (a few points of wOBA between the two sides of the
// plate), 1,200 for each real pitcher, 1,000 for each plan. `run` is a measure of them already made. Each check is { group, what, ok, said }: the league
// overall, each count, each kind of pitch, where pitches crossed, each real pitcher's pitches, strikeouts, walks and
// wOBA, the platoon split, each kind of hitter (3,000 at-bats a seed), changing speeds, and the plans.
export const SEEDS = [21, 22, 23];
export function run(params) {
  const plans = { own: {} };
  for (const [key] of [...Object.values(PLANS).flat(), MILLER]) plans.own[key] ||= plan(params, key, own);
  for (const [group, list] of Object.entries(PLANS)) plans[group] = list.map(([key, what, call, even]) => ({ key, what, even, ...plan(params, key, call) }));
  plans.miller = plan(params, MILLER[0], MILLER[2]);
  const big = measure(params, 16000, SEEDS);
  return { lab: measure(params, 3000, SEEDS), types: big.types, platoon: big.platoon, pitchers: measurePitchers(params, 1200, SEEDS), hitters: measureHitters(params, 3000, SEEDS), plans };
}
export function checks(params, { lab, types, platoon, pitchers, hitters, plans } = run(params)) {
  const out = [];
  const near = (group, what, sim, real, by, fmt = v => v.toFixed(3)) => out.push({ group, what, ok: Math.abs(sim - real) <= by, said: `${what}: ${fmt(sim)} against ${fmt(real)} (within ${fmt(by)})` });
  for (const [key, by] of [['k', 0.03], ['bb', 0.015], ['hbp', 0.006], ['ppa', 0.2], ['swing', 0.025], ['whiff', 0.025], ['zone', 0.025], ['zoneSwing', 0.025], ['zoneWhiff', 0.025],
    ['chaseSwing', 0.03], ['chaseWhiff', 0.03], ['calledZone', 0.025], ['calledChase', 0.015], ['foul', 0.03], ['hitsPerBip', 0.025], ['hrPerBip', 0.012]]) near('league', key, lab[key], TARGET[key], by);
  // In each count: swings, misses, how much of the contact is fouled off, and how often taken pitches are called strikes
  // in the zone and out of it, by an umpire whose zone shifts with the count.
  for (const [c, v] of Object.entries(lab.counts)) {
    near('counts', `${c} swings`, v.swing, COUNTS[c].swing, 0.045);
    if (v.pitches * v.swing > 300) near('counts', `${c} misses`, v.whiff, COUNTS[c].whiff, 0.04);
    if (v.pitches * v.swing * (1 - v.whiff) > 300) near('counts', `${c} contact fouled off`, v.foul, COUNTS[c].foul, 0.04);
    if (v.zoneTake > 300) near('counts', `${c} called strikes in the zone`, v.calledZone, COUNTS[c].calledZone, 0.04);
    if (v.chaseTake > 300) near('counts', `${c} called strikes out of the zone`, v.calledOut, COUNTS[c].calledOut, 0.02);
  }
  const pct = v => `${(v * 100).toFixed(1)}%`;
  // Each kind of pitch: missed per swing, in the zone, and swung at in the zone and chased out of it, within 4 points.
  for (const [t, v] of Object.entries(types)) {
    if (!TYPES[t] || v.swings < 150) continue;
    near('types', `${t} missed per swing`, v.whiff, TYPES[t].whiff, 0.05, pct);
    near('types', `${t} in the zone`, v.zone, TYPES[t].zone, 0.05, pct);
    near('types', `${t} swung at in the zone`, v.zoneSwing, TYPES[t].zoneSwing, 0.04, pct);
    near('types', `${t} chased`, v.chaseSwing, TYPES[t].chaseSwing, 0.04, pct);
  }
  // Where pitches crossed: missed per swing, and wOBA on contact, over the middle, on the edges, on the corners and out.
  for (const [g, v] of Object.entries(lab.groups)) {
    near('zones', `${g} missed per swing`, v.whiff, GROUPS[g].whiff, 0.03, pct);
    if (v.bip > 300) near('zones', `${g} wOBA on contact`, v.wobacon, GROUPS[g].wobacon, 0.05);
  }
  for (const [key, { rows, k, bb, woba }] of Object.entries(pitchers)) {
    for (const r of rows) if (r.swings >= 60) near('pitchers', `${key}'s ${r.code} missed per swing`, r.sim, r.real, 0.09, v => `${Math.round(v * 100)}%`);
    near('pitchers', `${key}'s strikeouts`, k.sim, k.real, 0.04, pct);
    // His walks within 2.5 points and his wOBA within .040; more room for one who faced under 300 batters, whose real
    // numbers say less: by the square root of 300 over how many he faced (Waldron's 194, a quarter more).
    const room = Math.max(1, Math.sqrt(300 / bb.pa));
    near('pitchers', `${key}'s walks`, bb.sim, bb.real, 0.025 * room, pct);
    near('pitchers', `${key}'s wOBA`, woba.sim, woba.real, 0.04 * room);
    // The knuckleball as wild as Waldron's: as many in the zone, within 4 points.
    for (const r of rows) if (r.code === 'KN') near('pitchers', `${key}'s knuckleball in the zone`, r.zone, r.zoneReal, 0.04, pct);
  }
  // Each plan is clearly worse for him than his own calls: at least .030 more wOBA, pooled. Two pitchers' stuff, with
  // their own walks and damage, plays down the middle nearly as well as with their own calls (even, in PLANS): Mason
  // Miller's, which is missed anywhere, and Tyler Rogers's, which is hit weakly anywhere, while a pitch there every time
  // walks nobody. They are held only to doing no better there than with their own calls, give or take .015. (Matt
  // Waldron's knuckleball, whose wobble the hitter can't read however often he's seen it, isn't held to the knuckleball
  // to one spot every time: that does better than his own calls.)
  for (const p of [...plans.middle, ...plans.one, ...plans.two]) {
    const base = plans.own[p.key].w, by = p.even ? -0.015 : 0.03;
    out.push({ group: 'plans', what: `${p.key}: ${p.what}`, ok: p.w >= base + by, said: `${p.key}, ${p.what}: wOBA ${p.w.toFixed(3)} against his own calls' ${base.toFixed(3)} (${by > 0 ? `.030 more, at least` : 'no more than .015 less'})` });
  }
  out.push({ group: 'plans', what: `miller: ${MILLER[1]}`, ok: plans.miller.per.every(x => x.k < 0.5), said: `miller, ${MILLER[1]}: strikes out ${plans.miller.per.map(x => pct(x.k)).join(', ')} on seeds ${SEEDS.join(', ')} (under 50% on each)` });
  // The platoon split: the wOBA of a batter on the pitcher's own side of the plate and on the other, each against both of
  // 2026's lines on that side (a left-hander here is a right-hander in a mirror: RR and LL, RL and LR), within .015, and
  // the gap between the sides within .010 of 2026's.
  for (const [side, lines] of [['same', ['RR', 'LL']], ['other', ['RL', 'LR']]]) {
    for (const l of lines) near('platoon', `${l} wOBA`, platoon[side].woba, PLATOON.lines[l].woba, 0.015);
  }
  near('platoon', 'the other side’s wOBA over the same side’s', platoon.other.woba - platoon.same.woba, PLATOON.other.woba - PLATOON.same.woba, 0.01);
  // Each kind of hitter, against the quarter of 2026's qualified hitters he's tuned to: his chases and his misses per
  // swing within 3 points on each seed, and pooled his swings in the zone within 3 points and his wOBA on contact within
  // .040.
  for (const [type, m] of Object.entries(hitters)) {
    const q = QUARTERS[type];
    m.per.forEach((x, i) => {
      near('hitters', `${type} hitter's chases on seed ${SEEDS[i]}`, x.chase, q.chase, 0.03, pct);
      near('hitters', `${type} hitter's misses per swing on seed ${SEEDS[i]}`, x.whiff, q.whiff, 0.03, pct);
    });
    near('hitters', `${type} hitter's swings in the zone`, m.zoneSwing, q.zoneSwing, 0.03, pct);
    near('hitters', `${type} hitter's wOBA on contact`, m.wobacon, q.wobacon, 0.04);
  }
  // Changing speeds still works: a changeup after a four-seamer fools him more than one after a changeup.
  const sc = speedChange(params);
  out.push({ group: 'sequence', what: 'changing speeds', ok: sc.afterFastball > sc.afterChangeup + 0.03, said: `a changeup after a four-seamer missed on ${pct(sc.afterFastball)} of swings, after a changeup ${pct(sc.afterChangeup)} (3 points less, at least)` });
  return out;
}
