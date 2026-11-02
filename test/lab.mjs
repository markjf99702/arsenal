// The at-bat lab: plays thousands of at-bats with the pitcher choosing for himself, and measures them the way
// Statcast measures the league. Used by tools/calibrate.mjs and test/atbat.test.mjs, which hold the hitter to the same
// checks (checks, below): the test fails on knobs that miss them, and the calibrator won't write them.
import { LEAGUE, COUNTS, TYPES, ZONES } from '../js/league.js';
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

// The at-bats of a lab run: `pas` of them for each seed (one, or a list to pool), three in five to a right-handed batter.
function* atBats(pitcher, params, pas, seeds) {
  for (const seed of [seeds].flat()) for (let i = 0; i < pas; i++) yield autoAtBat({ pitcher, batter: i % 5 < 3 ? 'R' : 'L', seed: (seed * 1000003 + i * 7919) >>> 0, params });
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
const W = LEAGUE.woba, wobaOf = play => ({ '1B': W['1B'], '2B': W['2B'], '3B': W['3B'], HR: W.HR }[play] || 0);
export const GROUPS = {};
for (const [zn, v] of Object.entries(ZONES)) {
  const g = GROUPS[zn === '5' ? 'middle' : Number(zn) > 9 ? 'out' : ['1', '3', '7', '9'].includes(zn) ? 'corner' : 'edge'] ||= { pitches: 0, swings: 0, whiffs: 0, bip: 0, w: 0 };
  g.pitches += v.pitches; g.swings += v.swings; g.whiffs += v.whiffs; g.bip += v.bip;
  g.w += W['1B'] * v.singles + W['2B'] * v.doubles + W['3B'] * v.triples + W.HR * v.hrs;
}
for (const g of Object.values(GROUPS)) Object.assign(g, { whiff: g.whiffs / g.swings, wobacon: g.w / g.bip });

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
  for (const ab of atBats(LEAGUE_ARM, params, pas, seed)) {
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
    contactScores,
  };
}

// Each real pitcher's simulated miss rate per pitch, beside his real one (rows), and his strikeouts per plate appearance
// (k). `seed` is one, or a list to pool.
export function measurePitchers(params, pas = 1500, seed = 1) {
  const out = {};
  for (const pitcher of PITCHERS.filter(p => p.key !== 'average')) {
    const t = {};
    let n = 0, k = 0;
    for (const ab of atBats(pitcher, params, pas, seed)) {
      n++; if (ab.result === 'K' || ab.result === 'KL') k++;
      for (const p of ab.pitches) {
        const c = t[p.code] ||= { swings: 0, whiffs: 0 };
        if (p.swing) { c.swings++; if (MISSED(p)) c.whiffs++; }
      }
    }
    out[pitcher.key] = {
      rows: pitcher.pitches.map(e => ({ code: e.code, share: e.share, real: e.whiff, sim: t[e.code] ? t[e.code].whiffs / Math.max(1, t[e.code].swings) : null, swings: t[e.code]?.swings || 0 })),
      k: { sim: k / n, real: pitcher.so / pitcher.pa, pa: pitcher.pa },
    };
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
export const PLANS = {
  // Down the middle every pitch, with his own mix: every pitcher, but the knuckleballer (below).
  middle: PITCHERS.filter(p => p.key !== 'waldron').map(p => [p.key, 'down the middle every pitch', middle]),
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
const Wt = LEAGUE.woba, wobaEnd = r => ({ BB: Wt.BB, HBP: Wt.HBP, '1B': Wt['1B'], '2B': Wt['2B'], '3B': Wt['3B'], HR: Wt.HR }[r] || 0);
export function plan(params, key, call, pas = 1000, seeds = SEEDS) {
  const pitcher = pitcherByKey(key), per = [];
  for (const seed of seeds) {
    let k = 0, w = 0;
    for (let i = 0; i < pas; i++) {
      const ab = startAtBat({ pitcher, batter: i % 5 < 3 ? 'R' : 'L', seed: (seed * 1000003 + i * 7919) >>> 0, params });
      for (let j = 0; !ab.result; j++) throwCall(ab, call(j, ab));
      if (ab.result === 'K' || ab.result === 'KL') k++;
      w += wobaEnd(ab.result);
    }
    per.push({ k: k / pas, w: w / pas });
  }
  return { per, k: per.reduce((a, x) => a + x.k, 0) / per.length, w: per.reduce((a, x) => a + x.w, 0) / per.length };
}

// What the hitter is held to, on three seeds pooled, so knobs that only pass on the seed they were tuned on don't pass:
// 3,000 at-bats a seed for the league, 1,200 for each real pitcher, 1,000 for each plan. `run` is a measure of them
// already made. Each check is { group, what, ok, said }: the league overall, each count, each kind of pitch, where
// pitches crossed, each real pitcher's pitches and strikeouts, changing speeds, and the plans.
export const SEEDS = [21, 22, 23];
export function run(params) {
  const plans = { own: {} };
  for (const [key] of [...Object.values(PLANS).flat(), MILLER]) plans.own[key] ||= plan(params, key, own);
  for (const [group, list] of Object.entries(PLANS)) plans[group] = list.map(([key, what, call]) => ({ key, what, ...plan(params, key, call) }));
  plans.miller = plan(params, MILLER[0], MILLER[2]);
  return { lab: measure(params, 3000, SEEDS), pitchers: measurePitchers(params, 1200, SEEDS), plans };
}
export function checks(params, { lab, pitchers, plans } = run(params)) {
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
  for (const [t, v] of Object.entries(lab.types)) {
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
  for (const [key, { rows, k }] of Object.entries(pitchers)) {
    for (const r of rows) if (r.swings >= 60) near('pitchers', `${key}'s ${r.code} missed per swing`, r.sim, r.real, 0.09, v => `${Math.round(v * 100)}%`);
    near('pitchers', `${key}'s strikeouts`, k.sim, k.real, 0.04, pct);
  }
  // Each plan is clearly worse for him than his own calls: at least .030 more wOBA, pooled. (Matt Waldron's knuckleball
  // isn't held to it: the hitter can't read its wobble however often he's seen it, so down the middle every pitch it
  // costs him nothing, and to one spot every time it does better than his own calls.)
  for (const p of [...plans.middle, ...plans.one, ...plans.two]) {
    const base = plans.own[p.key].w;
    out.push({ group: 'plans', what: `${p.key}: ${p.what}`, ok: p.w >= base + 0.03, said: `${p.key}, ${p.what}: wOBA ${p.w.toFixed(3)} against his own calls' ${base.toFixed(3)} (.030 more, at least)` });
  }
  out.push({ group: 'plans', what: `miller: ${MILLER[1]}`, ok: plans.miller.per.every(x => x.k < 0.5), said: `miller, ${MILLER[1]}: strikes out ${plans.miller.per.map(x => pct(x.k)).join(', ')} on seeds ${SEEDS.join(', ')} (under 50% on each)` });
  // Changing speeds still works: a changeup after a four-seamer fools him more than one after a changeup.
  const sc = speedChange(params);
  out.push({ group: 'sequence', what: 'changing speeds', ok: sc.afterFastball > sc.afterChangeup + 0.03, said: `a changeup after a four-seamer missed on ${pct(sc.afterFastball)} of swings, after a changeup ${pct(sc.afterChangeup)} (3 points less, at least)` });
  return out;
}
