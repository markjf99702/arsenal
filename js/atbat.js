// The at-bat: you call each pitch and a spot, and a hitter tries to hit it.
// A coaching model, not physics. The pitch flies on the same flight model as the rest of Arsenal; the hitter
// guesses what's coming, reads the ball until the decision point (0.175 s from the plate), then commits.
// If it isn't what he guessed and he didn't pick it up, he swings where that pitch would have gone, when it
// would have got there. Its knobs are calibrated (tools/calibrate.mjs) so that, pitch after pitch, it comes out
// near the real league: how often hitters swing, chase and miss, in each count, and what happens on contact.
import { BY_CODE } from './pitches.js';
import { NUMBERS } from './numbers.js';
import { PITCHERS as REAL } from './league.js';
import { throwPitch, PLATE_Y, DECIDE, MPH, G } from './flight.js';
import { rng as makeRng } from './rng.js';
import { PARAMS as DEFAULTS } from './atbat-params.js';

export const FASTBALLS = new Set(['FF', 'SI', 'FC']);
// The strike zone a pitch is judged by: the plate's width plus the ball touching its edge, and a typical
// hitter's knees to letters, in feet.
export const ZONE = { half: 17 / 24 + 1.45 / 12, bottom: 1.6, top: 3.4 };

// Spots you can call: a 5 x 5 grid. Columns from inside (-2) to away (2), rows from up (2) to down (-2);
// the middle 3 x 3 is the strike zone, the ring around it is off the plate.
const COLS = { '-2': -1.2, '-1': -0.47, 0: 0, 1: 0.47, 2: 1.2 };
const ROWS = { 2: 3.85, 1: 3.1, 0: 2.5, '-1': 1.9, '-2': 1.12 };
export const SPOTS = [];
for (const r of [2, 1, 0, -1, -2]) for (const c of [-2, -1, 0, 1, 2]) SPOTS.push({ c, r, id: `${r}${c}`.replace(/-/g, 'm'), zone: Math.abs(c) < 2 && Math.abs(r) < 2 });
export const spotById = id => SPOTS.find(s => s.id === id);

// Where a spot is, from the catcher's view: away is the catcher's right for a right-handed hitter.
export function spotXZ(spot, batter) {
  const away = COLS[spot.c];
  return [batter === 'R' ? away : -away, ROWS[spot.r]];
}

// What the catcher calls each spot. The two sides read alike: "in" and "away" are in the zone, "off the plate inside"
// and "off the plate away" are past its edge. The bottom row is "in the dirt", the call for a pitch to bounce; where
// one really went is in its why (js/atbat-words.js) and in the log.
export function spotName(spot) {
  if (spot.c === 0 && spot.r === 0) return 'down the middle';
  const v = { 2: 'high', 1: 'up', 0: '', '-1': 'down', '-2': 'in the dirt' }[spot.r];
  const h = { '-2': 'off the plate inside', '-1': 'in', 0: '', 1: 'away', 2: 'off the plate away' }[spot.c];
  if (spot.r === 2 && spot.c === 0) return 'high, above the zone';
  if (!v) return spot.c === -1 ? 'in, at the belt' : spot.c === 1 ? 'away, at the belt' : h;
  if (!h) return spot.r === 1 ? 'up in the zone' : spot.r === -1 ? 'down in the zone' : v;
  return `${v} and ${h}`;
}

// ---------------------------------------------------------------- pitchers

// A league-average righty: the five most common pitches at their league averages.
const AVERAGE_SET = ['FF', 'SI', 'SL', 'CH', 'CU'];
const avgShare = AVERAGE_SET.reduce((s, c) => s + NUMBERS[c].share, 0);
const fromLeague = (code, share) => {
  const n = NUMBERS[code];
  return { code, share, mph: n.mph, rpm: n.rpm, rise: n.rise, arm: n.arm, height: n.height, side: 1.85, extension: n.extension, whiff: n.whiff / 100 };
};
export const AVERAGE = {
  key: 'average', name: 'League-average righty', hand: 'R', line: 'The five most common pitches, each at the league average.',
  pitches: AVERAGE_SET.map(c => fromLeague(c, NUMBERS[c].share / avgShare)),
};
// For calibration: every common pitch, thrown as often as the league throws it.
const COMMON = ['FF', 'SI', 'FC', 'SL', 'ST', 'CU', 'KC', 'CH', 'FS'];
const commonShare = COMMON.reduce((s, c) => s + NUMBERS[c].share, 0);
export const LEAGUE_ARM = { key: 'league', name: 'The whole league', hand: 'R', pitches: COMMON.map(c => fromLeague(c, NUMBERS[c].share / commonShare)) };

export const PITCHERS = [AVERAGE, ...REAL];
export const pitcherByKey = key => PITCHERS.find(p => p.key === key) || AVERAGE;

// The pitch as the flight model wants it, aimed at a spot on the plate (catcher's view, feet).
export function pitchFor(pitcher, entry, plate) {
  const base = BY_CODE[entry.code];
  const sgn = pitcher.hand === 'R' ? 1 : -1;
  return {
    ...base, side: -entry.side, target: [plate[0] * sgn, plate[1]],
    n: { ...base.n, mph: entry.mph, rpm: entry.rpm || base.n.rpm, rise: entry.rise, arm: entry.arm, height: entry.height, extension: entry.extension },
  };
}

// ---------------------------------------------------------------- the zone

// How far inside the zone a point is (feet): positive inside, negative outside.
export function margin(x, z) {
  const dx = ZONE.half - Math.abs(x), dz = Math.min(z - ZONE.bottom, ZONE.top - z);
  if (dx >= 0 && dz >= 0) return Math.min(dx, dz);
  return -Math.hypot(Math.min(0, dx), Math.min(0, dz));
}
export const inZone = (x, z) => margin(x, z) >= 0;

// ---------------------------------------------------------------- an at-bat

export function startAtBat({ pitcher = AVERAGE, batter = 'R', seed = 1, params = DEFAULTS } = {}) {
  return { pitcher, batter, seed, params, rand: makeRng(seed), balls: 0, strikes: 0, pitches: [], result: null };
}

const countKey = ab => `${ab.balls}-${ab.strikes}`;
const sigmoid = v => 1 / (1 + Math.exp(-v));
const entryOf = (pitcher, code) => pitcher.pitches.find(p => p.code === code);

// What the hitter thinks a pitch of this type will do: mostly this pitcher's version, partly the league's.
function template(ab, code) {
  const own = entryOf(ab.pitcher, code), lg = NUMBERS[code] || own;
  const k = ab.params.own;
  const mix = key => own[key] * k + (lg[key] ?? own[key]) * (1 - k);
  return { code, mph: mix('mph'), rise: mix('rise'), arm: mix('arm') };
}

// The hitter's guess before the pitch: a fastball or not, from the count and what this pitcher throws, leaning
// toward whatever he just saw; then which pitch of that kind he's sitting on, again leaning toward the last one.
function guess(ab) {
  const P = ab.params, R = ab.rand;
  const last = ab.pitches.at(-1)?.code;
  const fbShare = ab.pitcher.pitches.filter(p => FASTBALLS.has(p.code)).reduce((s, p) => s + p.share, 0);
  let pFast = fbShare;
  if (fbShare > 0 && fbShare < 1) {
    const lean = (P.lookFastball[countKey(ab)] ?? 0) + (last == null ? 0 : FASTBALLS.has(last) ? P.repeat.lean : -P.repeat.lean);
    pFast = sigmoid(Math.log(fbShare / (1 - fbShare)) + lean);
  }
  const fastball = R.chance(pFast);
  const group = ab.pitcher.pitches.filter(p => FASTBALLS.has(p.code) === fastball);
  const pool = group.length ? group : ab.pitcher.pitches;
  const sitOn = R.pick(pool, pool.map(p => p.share + (p.code === last ? P.repeat.weight : 0)));
  return { fastball, code: sitOn.code };
}

// Velocity and acceleration of a flight at time t, by finite differences.
function motion(f, t) {
  const h = 1e-3, a = f.pos(t - h), b = f.pos(t), c = f.pos(t + h);
  return { p: b, v: [(c[0] - a[0]) / (2 * h), (c[1] - a[1]) / (2 * h), (c[2] - a[2]) / (2 * h)], a: [(c[0] - 2 * b[0] + a[0]) / (h * h), (c[2] - 2 * b[2] + a[2]) / (h * h)] };
}

// Where the hitter thinks the ball will cross the plate, and when, reading it at the decision point as `t`.
function read(ab, f, t, prev) {
  const P = ab.params;
  const td = f.T - DECIDE;
  const { p, v } = motion(f, td);
  const sgn = ab.pitcher.hand === 'R' ? 1 : -1;
  // Timing: the speed he's set for, pulled toward the last pitch he saw.
  let mph = t.mph;
  if (prev) mph = mph * (1 - P.memory) + prev.mph * P.memory;
  const vNear = mph * MPH * 0.925;
  const tauH = (p[1] - PLATE_Y) / vNear;
  // Where it goes from here, if it moves like the pitch he expects (its spin plus gravity, over its own flight time).
  const Tt = (2 * (60.5 - entryOf(ab.pitcher, f.p.code).extension - PLATE_Y)) / (mph * MPH * 1.915);
  const ax = (2 * ((-sgn * t.arm) / 12)) / (Tt * Tt), az = -G + (2 * (t.rise / 12)) / (Tt * Tt);
  const px = p[0] + v[0] * tauH + 0.5 * ax * tauH * tauH;
  const pz = p[2] + v[2] * tauH + 0.5 * az * tauH * tauH;
  return { at: [px, pz], timing: DECIDE - tauH };
}

// Throw one pitch. `call` is { code, spot } (a spot from SPOTS). Returns what happened, and updates the count.
export function throwCall(ab, call) {
  if (ab.result) throw new Error('the at-bat is over');
  const P = ab.params, R = ab.rand;
  const entry = entryOf(ab.pitcher, call.code);
  if (!entry) throw new Error(`${ab.pitcher.name} doesn't throw ${call.code}`);
  const before = { balls: ab.balls, strikes: ab.strikes };
  const prev = ab.pitches.at(-1) || null;

  // Command: it misses the spot a little, more for some pitches.
  const aim = spotXZ(call.spot, ab.batter);
  const spread = P.command * (P.commandBy[call.code] ?? 1);
  const target = [aim[0] + R.normal() * spread, aim[1] + R.normal() * spread];
  const flight = throwPitch(pitchFor(ab.pitcher, entry, target), { hand: ab.pitcher.hand, rng: R });
  const plate = [flight.end[0], flight.end[2]];
  const td = flight.T - DECIDE;
  const atDecide = flight.pos(td);

  // What he was looking for, and whether he picked up what it really was.
  const sat = guess(ab);
  const tunnel = prev ? Math.hypot(atDecide[0] - prev.atDecide[0], atDecide[2] - prev.atDecide[2]) : null;
  let picked = sat.code === call.code;
  if (!picked) {
    const d = tunnel ?? P.recognize.first;
    picked = R.chance(P.recognize.base + P.recognize.gain * (1 - Math.exp(-d / P.recognize.scale)));
  }
  const expected = template(ab, picked ? call.code : sat.code);
  const r = read(ab, flight, expected, prev && { mph: prev.mph });
  const miss = [plate[0] - r.at[0], plate[1] - r.at[1]];
  const missBy = Math.hypot(miss[0], miss[1]);
  const early = r.timing; // seconds; > 0 means he's early (the ball is slower than he's set for)

  // Swing or take, judged on where he thinks it's going.
  const judged = [r.at[0] + R.normal() * P.judge, r.at[1] + R.normal() * P.judge];
  const bias = P.swingBias[`${before.balls}-${before.strikes}`] ?? 0;
  const pSwing = P.swingLo + (P.swingHi - P.swingLo) * sigmoid((margin(judged[0], judged[1]) + bias) / P.swingWidth);
  const swing = R.chance(pSwing);

  const out = {
    n: ab.pitches.length + 1, code: call.code, spot: call.spot, mph: entry.mph, before,
    aim, plate, atDecide, tunnel, sat, picked, judged, miss, missBy, early, swing, inZone: inZone(plate[0], plate[1]),
    flight: { target, T: flight.T }, path: flight, result: null, play: null,
  };

  // Hit by the pitch: well inside, at body height.
  const towardHim = ab.batter === 'R' ? -plate[0] : plate[0];
  if (!swing && plate[1] > 0.6 && plate[1] < 5.5 && R.chance(sigmoid((towardHim - P.hbp.at) / P.hbp.width))) {
    out.result = 'hbp';
  } else if (!swing) {
    out.result = R.chance(sigmoid((margin(plate[0], plate[1]) - P.ump.shift) / P.ump.width)) ? 'called' : 'ball';
  } else {
    // Contact: how far off his swing is in place and time, how far he has to reach, and the pitch's stuff:
    // what makes one kind of pitch, or one pitcher's version of it, harder to square up than its speed and
    // movement alone say (late break, a hidden release, spin he can't read). It comes from how often hitters
    // really miss it: each kind of pitch is calibrated to the league, and each real pitcher's pitches to his own.
    const reach = Math.max(0, -margin(plate[0], plate[1]));
    const stuff = (P.stuff[call.code] ?? 1) * (P.pitcherStuff[ab.pitcher.key]?.[call.code] ?? 1);
    out.stuff = stuff;
    // Even a fooled hitter gets a piece of it sometimes (the floor): hitters touch most chase pitches they swing at.
    // His approach by count: a full swing early in the count, shortened up to protect with two strikes.
    const k = stuff * (P.approach[`${before.balls}-${before.strikes}`] ?? 1);
    const read = Math.exp(-(((missBy * k) / P.contact.miss) ** 2)) * Math.exp(-(((early * k) / P.contact.timing) ** 2));
    const pContact = (P.contact.max
      * (P.contact.floor + (1 - P.contact.floor) * read)
      * Math.exp(-((reach / P.contact.reach) ** 2))
      * Math.exp(-Math.max(0, entry.mph - 93) * P.contact.velo)) ** stuff;
    if (!R.chance(pContact)) out.result = 'whiff';
    else {
      const square = Math.exp(-((missBy / P.fair.miss) ** 2) - (early / P.fair.timing) ** 2 - (reach / P.fair.reach) ** 2);
      // With two strikes he's protecting the plate: more of his contact is spoiled foul.
      const fair = (P.fair.base + (1 - P.fair.base) * square * P.fair.gain) * (before.strikes === 2 ? P.fair.twoStrike : 1);
      if (!R.chance(fair)) {
        out.result = before.strikes === 2 && R.chance(P.tip) ? 'tip' : 'foul';
      } else {
        out.result = 'inplay';
        // How hard: squared up, and how hittable the spot was (the middle of the zone is where damage happens).
        const middle = Math.hypot(plate[0] / 0.9, (plate[1] - 2.55) / 0.9);
        const q = Math.exp(-((missBy / P.quality.miss) ** 2) - (early / P.quality.timing) ** 2) * Math.exp(-((middle / P.quality.middle) ** 2));
        const s = q + R.normal() * P.quality.noise;
        const O = P.outcome;
        let play;
        if (s > O.hr) play = 'HR';
        else if (s > O.xbh) play = R.chance(O.triple) ? '3B' : '2B';
        else play = R.chance(O.single[0] + O.single[1] * Math.max(0, s)) ? '1B' : 'out';
        out.play = play;
        out.contact = s;
      }
    }
  }

  // The count.
  if (out.result === 'ball') ab.balls++;
  else if (out.result === 'called' || out.result === 'whiff' || out.result === 'tip') ab.strikes++;
  else if (out.result === 'foul' && ab.strikes < 2) ab.strikes++;
  out.after = { balls: ab.balls, strikes: ab.strikes };
  if (out.result === 'hbp') ab.result = 'HBP';
  else if (ab.balls === 4) ab.result = 'BB';
  else if (ab.strikes === 3) ab.result = out.result === 'called' ? 'KL' : 'K';
  else if (out.result === 'inplay') ab.result = out.play;
  ab.pitches.push(out);
  return out;
}

// ---------------------------------------------------------------- a pitcher who picks for himself

// Which pitch and where, the way pitchers do on average in this count: more fastballs and strikes when behind,
// more breaking balls off the plate when ahead.
export function autoCall(ab) {
  const P = ab.params, R = ab.rand, key = countKey(ab);
  const fb = P.countFastball[key];
  const weights = ab.pitcher.pitches.map(p => p.share * (FASTBALLS.has(p.code) ? fb / P.leagueFastball : (1 - fb) / (1 - P.leagueFastball)));
  const entry = R.pick(ab.pitcher.pitches, weights);
  const fam = FAMILY[entry.code] || 'fast';
  const wantZone = R.chance(Math.min(0.97, P.zoneIntent[key] * (P.typeZone[entry.code] ?? 1)));
  const table = ZONE_TABLE[fam][wantZone ? 'zone' : 'out'];
  const spot = R.pick(table.map(o => o.spot), table.map(o => o.w));
  return { code: entry.code, spot };
}

// Where each kind of pitch goes, as [column (in -2 .. away 2), row (down -2 .. up 2), weight]: in the zone, and off it.
const FAMILY = { FF: 'fast', FC: 'fast', EP: 'fast', SI: 'sink', SL: 'break', ST: 'break', CU: 'break', KC: 'break', SV: 'break', CH: 'soft', FS: 'soft', FO: 'soft', KN: 'soft' };
const S = (c, r) => SPOTS.find(s => s.c === c && s.r === r);
const ZONE_TABLE = {
  fast: { zone: [[-1, 1, 3], [0, 1, 3], [1, 1, 3], [-1, 0, 2], [0, 0, 1], [1, 0, 2], [-1, -1, 2], [0, -1, 2], [1, -1, 3]], out: [[0, 2, 4], [-1, 2, 2], [1, 2, 2], [2, 0, 3], [2, 1, 2], [-2, 0, 1], [-2, 1, 1], [0, -2, 1]] },
  sink: { zone: [[-1, -1, 4], [0, -1, 3], [1, -1, 2], [-1, 0, 3], [0, 0, 1], [1, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1]], out: [[-2, -1, 3], [-2, 0, 2], [0, -2, 3], [-1, -2, 2], [1, -2, 1], [2, -1, 1]] },
  break: { zone: [[1, -1, 3], [0, -1, 2], [-1, -1, 1], [1, 0, 2], [0, 0, 1], [1, 1, 1], [-1, 0, 1], [0, 1, 1], [-1, 1, 1]], out: [[1, -2, 4], [2, -1, 4], [2, -2, 3], [0, -2, 3], [-1, -2, 1], [2, 0, 1]] },
  soft: { zone: [[-1, -1, 3], [0, -1, 3], [1, -1, 2], [-1, 0, 1], [0, 0, 1], [1, 0, 1], [0, 1, 1], [-1, 1, 1], [1, 1, 1]], out: [[0, -2, 5], [-1, -2, 3], [1, -2, 3], [-2, -1, 1], [2, -1, 1]] },
};
for (const fam of Object.values(ZONE_TABLE)) for (const k of ['zone', 'out']) fam[k] = fam[k].map(([c, r, w]) => ({ spot: S(c, r), w }));

// Play out a whole at-bat with the pitcher choosing for himself.
export function autoAtBat(options) {
  const ab = startAtBat(options);
  while (!ab.result) throwCall(ab, autoCall(ab));
  return ab;
}

// Throw `spot` with every pitch in the arsenal `runs` times from where this at-bat stands now.
export function whatIf(ab, spot, runs = 100, seed = 1) {
  const out = {};
  for (const entry of ab.pitcher.pitches) {
    const tally = { ball: 0, called: 0, whiff: 0, foul: 0, out: 0, hit: 0, hbp: 0, runs };
    for (let i = 0; i < runs; i++) {
      const copy = startAtBat({ pitcher: ab.pitcher, batter: ab.batter, seed: (seed * 7919 + i * 104729 + entry.code.charCodeAt(0)) >>> 0, params: ab.params });
      copy.balls = ab.balls; copy.strikes = ab.strikes;
      copy.pitches = ab.pitches.length ? [ab.pitches.at(-1)] : [];
      const r = throwCall(copy, { code: entry.code, spot });
      if (r.result === 'inplay') tally[r.play === 'out' ? 'out' : 'hit']++;
      else if (r.result === 'tip') tally.whiff++;
      else tally[r.result]++;
    }
    out[entry.code] = tally;
  }
  return out;
}
