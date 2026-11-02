// The at-bat lab: plays thousands of at-bats with the pitcher choosing for himself, and measures them the way
// Statcast measures the league. Used by tools/calibrate.mjs and test/atbat.test.mjs, which hold the hitter to the same
// checks (checks, below): the test fails on knobs that miss them, and the calibrator won't write them.
import { LEAGUE, COUNTS, TYPES } from '../js/league.js';
import { autoAtBat, LEAGUE_ARM, PITCHERS } from '../js/atbat.js';

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

export function measure(params, pas = 6000, seed = 1) {
  const c = { pa: 0, pitches: 0, k: 0, bb: 0, hbp: 0, swing: 0, whiff: 0, zone: 0, zoneSwing: 0, zoneWhiff: 0, chaseSwing: 0, chaseWhiff: 0, zoneTake: 0, zoneCalled: 0, chaseTake: 0, chaseCalled: 0, contact: 0, foul: 0, bip: 0, hits: 0, hr: 0, ab: 0 };
  const counts = {}, types = {}, contactScores = [];
  for (const ab of atBats(LEAGUE_ARM, params, pas, seed)) {
    c.pa++;
    if (ab.result === 'K' || ab.result === 'KL') c.k++;
    if (ab.result === 'BB') c.bb++;
    if (ab.result === 'HBP') c.hbp++;
    for (const p of ab.pitches) {
      c.pitches++;
      const ck = `${p.before.balls}-${p.before.strikes}`;
      const cc = counts[ck] ||= { pitches: 0, swings: 0, zone: 0, whiffs: 0, fouls: 0, contact: 0, zoneTake: 0, zoneCalled: 0, chaseTake: 0, chaseCalled: 0 };
      const tc = types[p.code] ||= { pitches: 0, swings: 0, whiffs: 0, zone: 0, zoneSwings: 0 };
      cc.pitches++; tc.pitches++;
      if (p.inZone) { c.zone++; cc.zone++; tc.zone++; }
      if (p.swing) {
        c.swing++; cc.swings++; tc.swings++; if (p.inZone) tc.zoneSwings++;
        const missed = p.result === 'whiff';
        if (missed) { c.whiff++; tc.whiffs++; cc.whiffs++; } else { cc.contact++; if (p.result === 'foul' || p.result === 'tip') cc.fouls++; }
        if (p.inZone) { c.zoneSwing++; if (missed) c.zoneWhiff++; } else { c.chaseSwing++; if (missed) c.chaseWhiff++; }
        if (!missed) { c.contact++; if (p.result === 'foul' || p.result === 'tip') c.foul++; }
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
    contactScores,
  };
}

// Each real pitcher's simulated miss rate per pitch, beside his real one. `seed` is one, or a list to pool.
export function measurePitchers(params, pas = 1500, seed = 1) {
  const out = {};
  for (const pitcher of PITCHERS.filter(p => p.key !== 'average')) {
    const t = {};
    for (const ab of atBats(pitcher, params, pas, seed)) {
      for (const p of ab.pitches) {
        const c = t[p.code] ||= { swings: 0, whiffs: 0 };
        if (p.swing) { c.swings++; if (p.result === 'whiff') c.whiffs++; }
      }
    }
    out[pitcher.key] = pitcher.pitches.map(e => ({ code: e.code, share: e.share, real: e.whiff, sim: t[e.code] ? t[e.code].whiffs / Math.max(1, t[e.code].swings) : null, swings: t[e.code]?.swings || 0 }));
  }
  return out;
}

// What the hitter is held to, on three seeds pooled, so knobs that only pass on the seed they were tuned on don't pass:
// 3,000 at-bats a seed for the league, 1,200 for each real pitcher. `run` is a measure of them already made. Each
// check is { group, what, ok, said }: the league overall, each count, each kind of pitch, each real pitcher's pitches.
export const SEEDS = [21, 22, 23];
export function run(params) {
  return { lab: measure(params, 3000, SEEDS), pitchers: measurePitchers(params, 1200, SEEDS) };
}
export function checks(params, { lab, pitchers } = run(params)) {
  const out = [];
  const near = (group, what, sim, real, by, fmt = v => v.toFixed(3)) => out.push({ group, what, ok: Math.abs(sim - real) <= by, said: `${what}: ${fmt(sim)} against ${fmt(real)} (within ${fmt(by)})` });
  for (const [key, by] of [['k', 0.03], ['bb', 0.015], ['hbp', 0.006], ['ppa', 0.2], ['swing', 0.025], ['whiff', 0.025], ['zone', 0.025], ['zoneSwing', 0.025], ['zoneWhiff', 0.025],
    ['chaseSwing', 0.03], ['chaseWhiff', 0.03], ['calledZone', 0.025], ['calledChase', 0.015], ['foul', 0.03], ['hitsPerBip', 0.025], ['hrPerBip', 0.012]]) near('league', key, lab[key], TARGET[key], by);
  for (const [c, v] of Object.entries(lab.counts)) {
    near('counts', `${c} swings`, v.swing, COUNTS[c].swing, 0.045);
    if (v.pitches * v.swing > 300) near('counts', `${c} misses`, v.whiff, COUNTS[c].whiff, 0.04);
  }
  const pct = v => `${(v * 100).toFixed(1)}%`;
  for (const [t, v] of Object.entries(lab.types)) {
    if (!TYPES[t] || v.swings < 150) continue;
    near('types', `${t} missed per swing`, v.whiff, TYPES[t].whiff, 0.05, pct);
    near('types', `${t} in the zone`, v.zone, TYPES[t].zone, 0.05, pct);
  }
  for (const [key, rows] of Object.entries(pitchers)) for (const r of rows) {
    if (r.swings >= 60) near('pitchers', `${key}'s ${r.code} missed per swing`, r.sim, r.real, 0.09, v => `${Math.round(v * 100)}%`);
  }
  return out;
}
