// The at-bat lab: plays thousands of at-bats with the pitcher choosing for himself, and measures them the way
// Statcast measures the league. Used by tools/calibrate.mjs and test/atbat.test.mjs.
import { LEAGUE } from '../js/league.js';
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

export function measure(params, pas = 6000, seed = 1) {
  const c = { pa: 0, pitches: 0, k: 0, bb: 0, hbp: 0, swing: 0, whiff: 0, zone: 0, zoneSwing: 0, zoneWhiff: 0, chaseSwing: 0, chaseWhiff: 0, zoneTake: 0, zoneCalled: 0, chaseTake: 0, chaseCalled: 0, contact: 0, foul: 0, bip: 0, hits: 0, hr: 0, ab: 0 };
  const counts = {}, types = {}, contactScores = [];
  for (let i = 0; i < pas; i++) {
    const ab = autoAtBat({ pitcher: LEAGUE_ARM, batter: i % 5 < 3 ? 'R' : 'L', seed: (seed * 1000003 + i * 7919) >>> 0, params });
    c.pa++;
    if (ab.result === 'K' || ab.result === 'KL') c.k++;
    if (ab.result === 'BB') c.bb++;
    if (ab.result === 'HBP') c.hbp++;
    for (const p of ab.pitches) {
      c.pitches++;
      const ck = `${p.before.balls}-${p.before.strikes}`;
      const cc = counts[ck] ||= { pitches: 0, swings: 0, zone: 0, whiffs: 0, fouls: 0, contact: 0 };
      const tc = types[p.code] ||= { pitches: 0, swings: 0, whiffs: 0, zone: 0 };
      cc.pitches++; tc.pitches++;
      if (p.inZone) { c.zone++; cc.zone++; tc.zone++; }
      if (p.swing) {
        c.swing++; cc.swings++; tc.swings++;
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
        if (p.inZone) { c.zoneTake++; if (p.result === 'called') c.zoneCalled++; } else { c.chaseTake++; if (p.result === 'called') c.chaseCalled++; }
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
    counts: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, { pitches: v.pitches, swing: v.swings / v.pitches, zone: v.zone / v.pitches, whiff: v.whiffs / v.swings, foul: v.fouls / v.contact }])),
    types: Object.fromEntries(Object.entries(types).map(([k, v]) => [k, { pitches: v.pitches, swings: v.swings, zone: v.zone / v.pitches, whiff: v.whiffs / v.swings }])),
    contactScores,
  };
}

// Each real pitcher's simulated miss rate per pitch, beside his real one.
export function measurePitchers(params, pas = 1500, seed = 1) {
  const out = {};
  for (const pitcher of PITCHERS.filter(p => p.key !== 'average')) {
    const t = {};
    for (let i = 0; i < pas; i++) {
      const ab = autoAtBat({ pitcher, batter: i % 5 < 3 ? 'R' : 'L', seed: (seed * 1000003 + i * 7919) >>> 0, params });
      for (const p of ab.pitches) {
        const c = t[p.code] ||= { swings: 0, whiffs: 0 };
        if (p.swing) { c.swings++; if (p.result === 'whiff') c.whiffs++; }
      }
    }
    out[pitcher.key] = pitcher.pitches.map(e => ({ code: e.code, share: e.share, real: e.whiff, sim: t[e.code] ? t[e.code].whiffs / Math.max(1, t[e.code].swings) : null, swings: t[e.code]?.swings || 0 }));
  }
  return out;
}
