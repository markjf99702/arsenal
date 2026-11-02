// The at-bat: you call each pitch and a spot, and a hitter tries to hit it.
// A coaching model, not physics. The pitch flies on the same flight model as the rest of Arsenal; the hitter
// guesses what's coming, reads the ball until the decision point (0.175 s from the plate), then commits.
// If it isn't what he guessed and he didn't pick it up, he swings where that pitch would have gone, when it
// would have got there. Its knobs are calibrated (tools/calibrate.mjs) so that, pitch after pitch, it comes out
// near the real league: how often hitters swing, chase and miss, in each count, and what happens on contact.
import { BY_CODE } from './pitches.js';
import { NUMBERS } from './numbers.js';
import { PITCHERS as REAL, TYPES, LEAGUE } from './league.js';
import { throwPitch, PLATE_Y, DECIDE, MPH, G } from './flight.js';
import { rng as makeRng } from './rng.js';
import { PARAMS as DEFAULTS } from './atbat-params.js';

export const FASTBALLS = new Set(['FF', 'SI', 'FC']);
// The strike zone, where the middle of a ball can cross and still be a strike: any part of the ball over any part of
// the plate, between 2026's average top and bottom of the zone (Statcast's, set from each batter's height for the ABS
// challenges), so a ball's width past each edge, in feet.
const BALL = 1.45 / 12;
export const ZONE = { half: 17 / 24 + BALL, bottom: LEAGUE.sz.bottom - BALL, top: LEAGUE.sz.top + BALL };

// Spots you can call: a 5 x 5 grid. Columns from inside (-2) to away (2), rows from up (2) to down (-2); the middle
// 3 x 3 is the strike zone, each spot in the middle of its third of the plate and of the zone, and the ring around it
// is off the plate, high above the zone and down in the dirt.
const COLS = { '-2': -1.2, '-1': -0.47, 0: 0, 1: 0.47, 2: 1.2 };
const MID = (LEAGUE.sz.top + LEAGUE.sz.bottom) / 2, THIRD = (LEAGUE.sz.top - LEAGUE.sz.bottom) / 3;
const ROWS = { 2: ZONE.top + 0.45, 1: MID + THIRD, 0: MID, '-1': MID - THIRD, '-2': ZONE.bottom - 0.48 };
export const SPOTS = [];
for (const r of [2, 1, 0, -1, -2]) for (const c of [-2, -1, 0, 1, 2]) SPOTS.push({ c, r, id: `${r}${c}`.replace(/-/g, 'm'), zone: Math.abs(c) < 2 && Math.abs(r) < 2 });
export const spotById = id => SPOTS.find(s => s.id === id);

// The hitter's version. A link carries it, so one made against another version still opens and replays, saying the
// same calls may play out differently. Raise it with anything that changes how an at-bat plays: the model, its knobs
// (js/atbat-params.js), or the league numbers and arsenals (js/league.js). Links pinned in test/atbat.test.mjs fail
// until it goes up.
export const VERSION = 3;

// An at-bat as a link: ab.v<version>.<pitcher>.<R|L>.<seed in base 36>, then each call as its pitch and its spot's place
// in SPOTS, like ab.v1.skenes.L.k3x9a.FF6.ST23. A hitter of a kind other than the average one goes on his side with a
// hyphen, like L-patient (HITTER_TYPES). The seed brings back the same hitter and the same luck, so the calls replay the
// same at-bat on the same version of the hitter. One made before links had a version (ab.skenes.L.k3x9a...) was made
// against version 1. It takes anything with a pitcher, a batter, a seed and the calls so far, like the page's own state
// (and a hitter, the average one when it has none).
// A link without what a message stuck on its end: anything after its last letter or digit, like a full stop, a bracket
// or a quote. One step back at a time from the end, since /[^0-9a-z]+$/ takes time growing with the square of a long
// run of them with a letter after it, and a link can be made to freeze the page that way.
export function trimmed(h) {
  let n = h.length;
  while (n && !/[0-9a-z]/i.test(h[n - 1])) n--;
  return h.slice(0, n);
}
// A call whose ball was challenged has a c after its spot, like SL23c (challenge, below): one without is played as it
// always was. An inning's link is the same with inning for ab, its seed the inning's and its calls every pitch of the
// inning in turn: each batter's at-bat ends where the model says it does, and the next call is to the next batter
// (playInning).
export const linkFor = ({ inning = false, pitcher, batter, hitter = 'average', seed, calls }) => [inning ? 'inning' : 'ab', `v${VERSION}`, pitcher.key, hitter === 'average' ? batter : `${batter}-${hitter}`, (seed >>> 0).toString(36), ...calls.map(c => `${c.code}${SPOTS.indexOf(c.spot)}${c.challenge ? 'c' : ''}`)].join('.');
// Reads a link like that, with or without its #, or gives null when even its pitcher, batter and seed can't be read. It
// reads what it can, the way a link arrives from a message: a full stop, bracket or quote stuck on the end is dropped,
// a pitch's letters can be in lower case, and the calls are read up to the first that can't be (`rest` is what's left
// from there, '' when nothing is). A call's spot is undefined when its number is off the grid, and its pitch can be one
// the pitcher doesn't throw: what to do then is the page's to say. `version` is the hitter's the link was made against,
// and `hitter` his kind, in lower case: 'average' when the link has none, and as the link has it when it isn't one of
// HITTER_TYPES, for the page to say so too. `inning` is whether it's an inning's link, and a call's `challenge` whether
// its ball was challenged.
export function parseLink(hash) {
  let h = String(hash).replace(/^#/, '');
  try { h = decodeURIComponent(h); } catch {}
  const parts = trimmed(h).split('.');
  const v = /^v(\d{1,6})$/i.exec(parts[1] || '');
  if (v) parts.splice(1, 1);
  const [ab, key = '', side = '', seed = '', ...tokens] = parts;
  const [, batter, hitter = 'average'] = /^([RL])(?:-(\w+))?$/i.exec(side) || [];
  if (!/^(ab|inning)$/i.test(ab) || !/^\w+$/.test(key) || !batter || !/^[0-9a-z]+$/i.test(seed)) return null;
  const calls = [];
  for (const t of tokens) {
    const m = /^([A-Za-z]{2})(\d{1,2})([cC]?)$/.exec(t);
    if (!m) break;
    calls.push({ code: m[1].toUpperCase(), spot: SPOTS[Number(m[2])], ...(m[3] ? { challenge: true } : {}) });
  }
  return { inning: /^inning$/i.test(ab), version: v ? Number(v[1]) : 1, pitcherKey: key.toLowerCase(), batter: batter.toUpperCase(), hitter: hitter.toLowerCase(), seed: parseInt(seed, 36) >>> 0, calls, rest: tokens.slice(calls.length).join('.') };
}

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

// A league-average righty: a four-seamer, sinker, slider, changeup and curve at their league averages, each with the
// league's spread of speed pitch to pitch (sd). (Not the five most thrown: the sweeper and the cutter are both thrown
// more often than the curve.) Each is thrown as often as right-handers threw it in 2026, to each side of the plate (mix),
// among the set.
const AVERAGE_SET = ['FF', 'SI', 'SL', 'CH', 'CU'];
const fromLeague = (code, set) => {
  const n = NUMBERS[code], of = key => NUMBERS[code][key] / set.reduce((s, c) => s + NUMBERS[c][key], 0);
  const mix = Object.fromEntries(['R', 'L'].map(b => [b, TYPES[code].mix[b] / set.reduce((s, c) => s + TYPES[c].mix[b], 0)]));
  return { code, share: of('share'), mix, mph: n.mph, sd: TYPES[code]?.sd ?? 0, rpm: n.rpm, rise: n.rise, arm: n.arm, spin: n.spin, height: n.height, side: 1.85, extension: n.extension, whiff: n.whiff / 100 };
};
export const AVERAGE = {
  key: 'average', name: 'League-average righty', hand: 'R', line: 'A four-seamer, sinker, slider, changeup and curve, each at the league average.',
  pitches: AVERAGE_SET.map(c => fromLeague(c, AVERAGE_SET)),
};
// For calibration: every common pitch, thrown as often as the league's right-handers threw it.
const COMMON = ['FF', 'SI', 'FC', 'SL', 'ST', 'CU', 'KC', 'CH', 'FS'];
export const LEAGUE_ARM = { key: 'league', name: 'The whole league', hand: 'R', pitches: COMMON.map(c => fromLeague(c, COMMON)) };

export const PITCHERS = [AVERAGE, ...REAL];
export const pitcherByKey = key => PITCHERS.find(p => p.key === key) || AVERAGE;

// How much of what he throws to this batter each of his pitches is: his own mix to that side of the plate in 2026, among
// the pitches he's here with. Sale threw his sinker to left-handed batters a third of the time and almost never to
// right-handed ones; right-handers threw changeups three times as often to left-handed batters as to right-handed ones.
export function mixFor(pitcher, batter) {
  const raw = pitcher.pitches.map(p => p.mix?.[batter] ?? p.share), all = raw.reduce((s, v) => s + v, 0);
  return raw.map(v => v / all);
}
// The same side of the plate as the pitcher's arm (1), or the other (-1).
const sideOf = ab => (ab.pitcher.hand === ab.batter ? 1 : -1);
// The average hitter's kind: no change to his knobs.
const NO_TYPE = { zone: 0, chase: 0, miss: 1, damage: 0 };

// The pitch as the flight model wants it, aimed at a spot on the plate (catcher's view, feet). The ball turns on his own
// spin direction where there is one (spin), and otherwise the way his pitch moves, not on the league's, with his own
// share of spin doing the pushing (active).
export function pitchFor(pitcher, entry, plate) {
  const base = BY_CODE[entry.code];
  const sgn = pitcher.hand === 'R' ? 1 : -1;
  return {
    ...base, side: -entry.side, target: [plate[0] * sgn, plate[1]],
    n: { ...base.n, mph: entry.mph, rpm: entry.rpm || base.n.rpm, rise: entry.rise, arm: entry.arm, height: entry.height, extension: entry.extension, spin: entry.spin ?? null, active: entry.active ?? base.n.active },
  };
}

// ---------------------------------------------------------------- the zone

// How far toward a corner of the zone a point is: 0 at its middle, 1 at the middle of an edge, 2 at a corner, and
// no more past them.
export function toCorner([x, z]) {
  const dx = Math.min(1, Math.abs(x) / ZONE.half), dz = Math.min(1, Math.abs(z - (ZONE.top + ZONE.bottom) / 2) / ((ZONE.top - ZONE.bottom) / 2));
  return dx * dx + dz * dz;
}

// How far inside the zone a point is (feet): positive inside, negative outside.
export function margin(x, z) {
  const dx = ZONE.half - Math.abs(x), dz = Math.min(z - ZONE.bottom, ZONE.top - z);
  if (dx >= 0 && dz >= 0) return Math.min(dx, dz);
  return -Math.hypot(Math.min(0, dx), Math.min(0, dz));
}
export const inZone = (x, z) => margin(x, z) >= 0;

// ---------------------------------------------------------------- an at-bat

// The hitters you can pitch to: the league's average one, or one of four kinds, each tuned to a quarter of 2026's
// qualified hitters (js/league.js, HITTERS): the free swingers, who chased most out of the zone; the patient, who chased
// least; the contact hitters, who missed least per swing; and the power hitters, with the most extra bases per at-bat.
// Each is a small change to the average hitter's knobs (hitters, in js/atbat-params.js): how much more or less he swings
// at pitches he reads in the zone (zone) and out of it (chase), how much more he misses (miss, on a pitch's stuff), and
// how much harder he hits it (damage, on his contact).
export const HITTER_TYPES = [
  { key: 'average', name: 'Average' }, { key: 'free', name: 'Free swinger' }, { key: 'patient', name: 'Patient' },
  { key: 'contact', name: 'Contact' }, { key: 'power', name: 'Power' },
];
export const hitterByKey = key => HITTER_TYPES.find(h => h.key === key) || HITTER_TYPES[0];

export function startAtBat({ pitcher = AVERAGE, batter = 'R', hitter = 'average', seed = 1, params = DEFAULTS } = {}) {
  return { pitcher, batter, hitter, seed, params, rand: makeRng(seed), balls: 0, strikes: 0, pitches: [], result: null };
}

const countKey = ab => `${ab.balls}-${ab.strikes}`;
// Of Statcast's whiffs in 2026, the share that were foul tips.
const TIPS = LEAGUE.tips / LEAGUE.whiffs;
// Hits per out on balls in play in 2026: an out falls for a single this much of a pitcher's contact factor over 1, so his
// hits per ball in play go up by that factor.
const TARGET_HITS = LEAGUE.hits / (LEAGUE.bip - LEAGUE.hits);
const sigmoid = v => 1 / (1 + Math.exp(-v));
const entryOf = (pitcher, code) => pitcher.pitches.find(p => p.code === code);

// What the hitter thinks a pitch of this type will do: mostly this pitcher's version, partly the league's.
function template(ab, code) {
  const own = entryOf(ab.pitcher, code), lg = NUMBERS[code] || own;
  const k = ab.params.own;
  const mix = key => own[key] * k + (lg[key] ?? own[key]) * (1 - k);
  return { code, mph: mix('mph'), rise: mix('rise'), arm: mix('arm') };
}

// What the hitter expects from this pitcher, a share for each of his pitches: the season's mix to his side of the plate
// (mixFor), and what he has thrown this at-bat. Each pitch he's seen counts as notice.at of a whole season's mix, and,
// after the pitch just thrown, each pitch that followed the same pitch earlier in the at-bat counts notice.next more. So
// one pitch every time, or the same two in turn, gets figured out, and a changeup after a four-seamer fools him more
// than one after a changeup.
function expected(ab) {
  const N = ab.params.notice, ps = ab.pitches, last = ps.at(-1)?.code, seen = {}, mix = mixFor(ab.pitcher, ab.batter);
  let n = 0;
  for (const p of ps) { seen[p.code] = (seen[p.code] || 0) + N.at; n += N.at; }
  for (let i = 1; i < ps.length; i++) if (ps[i - 1].code === last) { seen[ps[i].code] = (seen[ps[i].code] || 0) + N.next; n += N.next; }
  return ab.pitcher.pitches.map((p, i) => (mix[i] + (seen[p.code] || 0)) / (1 + n));
}

// The hitter's guess before the pitch: a fastball or not, from the count and what he expects of this pitcher, leaning
// toward whatever he just saw; then which pitch of that kind he's sitting on, again leaning toward the last one.
function guess(ab) {
  const P = ab.params, R = ab.rand;
  const last = ab.pitches.at(-1)?.code;
  const mix = expected(ab), own = ab.pitcher.pitches.map((p, i) => ({ code: p.code, share: mix[i] }));
  const fbShare = own.filter(p => FASTBALLS.has(p.code)).reduce((s, p) => s + p.share, 0);
  let pFast = fbShare;
  if (fbShare > 0 && fbShare < 1) {
    const lean = (P.lookFastball[countKey(ab)] ?? 0) + (last == null ? 0 : FASTBALLS.has(last) ? P.repeat.lean : -P.repeat.lean);
    pFast = sigmoid(Math.log(fbShare / (1 - fbShare)) + lean);
  }
  const fastball = R.chance(pFast);
  const group = own.filter(p => FASTBALLS.has(p.code) === fastball);
  const pool = group.length ? group : own;
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
// The pitch on its way, whoever is hitting: where it's aimed, how far it misses the spot, how fast it comes and its
// flight, drawn from the at-bat's luck in the same order every time.
function deliver(ab, call) {
  if (ab.result) throw new Error('the at-bat is over');
  const P = ab.params, R = ab.rand;
  const entry = entryOf(ab.pitcher, call.code);
  if (!entry) throw new Error(`${ab.pitcher.name} doesn't throw ${call.code}`);
  // Command: it misses the spot a little, more for some pitches (the knuckleball most, as wild as Waldron's was: as many
  // of his in the zone), and more or less for each real pitcher (pitcherCommand), so he walks as many as he did.
  const aim = spotXZ(call.spot, ab.batter);
  const spread = P.command * (P.commandBy[call.code] ?? 1) * (P.pitcherCommand[ab.pitcher.key] ?? 1);
  const target = [aim[0] + R.normal() * spread, aim[1] + R.normal() * spread];
  // Speed: no two of a pitcher's pitches come in at quite the same speed. Each is drawn from his spread for that pitch
  // in 2026 (sd, the league's for the league-average righty), times speedSpread, and never more than 2.5 of it away.
  const sd = (entry.sd ?? 0) * P.speedSpread;
  const mph = sd ? entry.mph + sd * Math.max(-2.5, Math.min(2.5, R.normal())) : entry.mph;
  const flight = throwPitch(pitchFor(ab.pitcher, { ...entry, mph }, target), { hand: ab.pitcher.hand, rng: R });
  return { call, entry, aim, target, mph, flight, plate: [flight.end[0], flight.end[2]], atDecide: flight.pos(flight.T - DECIDE), before: { balls: ab.balls, strikes: ab.strikes } };
}

// A pitch taken: it hits him, well inside at body height, or the umpire calls it, his zone shifting with the count: in
// 2026 they called more strikes at 3-0 and fewer at 0-2.
function taken(ab, plate, before) {
  const P = ab.params, R = ab.rand;
  const towardHim = ab.batter === 'R' ? -plate[0] : plate[0];
  if (plate[1] > 0.6 && plate[1] < 5.5 && R.chance(sigmoid((towardHim - P.hbp.at) / P.hbp.width))) return 'hbp';
  return R.chance(sigmoid((margin(plate[0], plate[1]) - P.ump.shift - P.umpBy[`${before.balls}-${before.strikes}`]) / P.ump.width)) ? 'called' : 'ball';
}

// A swing that has been made: whether it touches the ball (pContact), and if it does, foul or fair and how hard, from how
// far off it was in place (missBy, feet) and time (early, seconds), how far the pitch was off the plate (reach), and
// where the hitter reckoned it was crossing (at). `side` is the matchup (sideOf) and H his kind (hitters).
function swung(ab, out, { pContact, missBy, early, reach, at, side, H }) {
  const P = ab.params, R = ab.rand, plate = out.plate, before = out.before;
  // A miss now and then nicks the ball straight into the catcher's glove: a foul tip, a strike in any count (strike
  // three with two strikes), and one of Statcast's whiffs, so it comes as often among misses as it did in 2026.
  if (!R.chance(pContact)) out.result = R.chance(TIPS) ? 'tip' : 'whiff';
  else {
    const square = Math.exp(-((missBy / P.fair.miss) ** 2) - (early / P.fair.timing) ** 2 - (reach / P.fair.reach) ** 2);
    // How much of his contact goes foul, count by count, as it did in 2026.
    const fair = (P.fair.base + (1 - P.fair.base) * square * P.fair.gain) * P.fairBy[`${before.balls}-${before.strikes}`];
    if (!R.chance(fair)) out.result = 'foul';
    else {
      out.result = 'inplay';
      // How hard: squared up, and how hittable the spot was (the middle of the zone is where damage happens).
      const middle = Math.hypot(plate[0] / 0.9, (plate[1] - MID) / 0.9);
      const q = Math.exp(-((missBy / P.quality.miss) ** 2) - (early / P.quality.timing) ** 2) * Math.exp(-((middle / P.quality.middle) ** 2));
      // And where pitches have been crossing this at-bat, he's ready for one there: each earlier pitch that crossed
      // within about 7 inches of where he reads this one crossing adds to how hard he hits it (notice.where).
      const ready = ab.pitches.reduce((a, e) => a + Math.exp(-((e.plate[0] - at[0]) ** 2 + (e.plate[1] - at[1]) ** 2) / 0.36), 0);
      // A hitter on the pitcher's side of the plate hits him softer, one on the other side harder (platoon); a power
      // hitter harder still (hitters).
      const sc = q + P.notice.where * ready - side * P.platoon.damage + H.damage + R.normal() * P.quality.noise;
      const O = P.outcome;
      let play;
      if (sc > O.hr) play = 'HR';
      else if (sc > O.xbh) play = R.chance(O.triple) ? '3B' : '2B';
      else play = R.chance(O.single[0] + O.single[1] * Math.max(0, sc)) ? '1B' : 'out';
      // A real pitcher gives up more or fewer hits on balls in play than the league (pitcherContact, a factor on them),
      // wherever they crossed, so his damage on contact comes to his own: fewer, and a hit is caught now and then;
      // more, and a ball that would have been caught falls for a single.
      const f = P.pitcherContact[ab.pitcher.key] ?? 1;
      if (f < 1 && play !== 'out' && !R.chance(f)) play = 'out';
      else if (f > 1 && play === 'out' && R.chance((f - 1) * TARGET_HITS)) play = '1B';
      out.play = play;
      out.contact = sc;
    }
  }
}

// The count after a pitch, and how the at-bat ended, if it did.
function counted(ab, out) {
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

export function throwCall(ab, call) {
  const P = ab.params, R = ab.rand;
  const prev = ab.pitches.at(-1) || null;
  const { entry, aim, target, mph, flight, plate, atDecide, before } = deliver(ab, call);

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

  // Swing or take, judged on where he thinks it's going, and on how the pitch looks: in 2026 hitters chased changeups and
  // splitters off the plate more than other pitches, and took more curves in the zone. Each kind of pitch moves his edge
  // (typeSwing, feet), one way for a pitch he thinks is a strike and another for one he thinks is a ball.
  const judged = [r.at[0] + R.normal() * P.judge, r.at[1] + R.normal() * P.judge];
  const bias = P.swingBias[`${before.balls}-${before.strikes}`] ?? 0;
  const seen = margin(judged[0], judged[1]), look = P.typeSwing[call.code];
  // And by the matchup: in 2026 hitters chased a little more against a pitcher throwing from their own side (platoon).
  // And by the kind of hitter he is: a free swinger swings more, in the zone and out of it (hitters).
  const side = sideOf(ab), off = 1 - sigmoid(seen / P.swingWidth), H = P.hitters[ab.hitter] || NO_TYPE;
  const lean = (look ? look.zone * (1 - off) + look.chase * off : 0) + side * P.platoon.chase * off + H.zone * (1 - off) + H.chase * off;
  const pSwing = P.swingLo + (P.swingHi - P.swingLo) * sigmoid((seen + bias + lean) / P.swingWidth);
  const swing = R.chance(pSwing);

  const out = {
    n: ab.pitches.length + 1, code: call.code, spot: call.spot, mph, before,
    aim, plate, atDecide, tunnel, sat, picked, judged, miss, missBy, early, swing, inZone: inZone(plate[0], plate[1]),
    flight: { target, T: flight.T }, path: flight, result: null, play: null,
  };

  if (!swing) out.result = taken(ab, plate, before);
  else {
    // Contact: how far off his swing is in place and time, how far he has to reach, and the pitch's stuff:
    // what makes one kind of pitch, or one pitcher's version of it, harder to square up than its speed and
    // movement alone say (late break, a hidden release, spin he can't read). It comes from how often hitters
    // really miss it: each kind of pitch is calibrated to the league, and each real pitcher's pitches to his own.
    const reach = Math.max(0, -margin(plate[0], plate[1]));
    // A real pitcher's stuff with two strikes (pitcherPutaway) brings his strikeouts to his own. And against a hitter on
    // his own side of the plate any pitcher's stuff is harder to hit, on the other side easier (platoon), as in 2026.
    // A power hitter misses more, a contact hitter less (hitters).
    const stuff = (P.stuff[call.code] ?? 1) * (P.pitcherStuff[ab.pitcher.key]?.[call.code] ?? 1) * (before.strikes === 2 ? P.pitcherPutaway[ab.pitcher.key] ?? 1 : 1)
      * Math.exp(side * P.platoon.stuff) * H.miss;
    out.stuff = stuff;
    // Even a fooled hitter gets a piece of it sometimes (the floor): hitters touch most chase pitches they swing at.
    // His approach by count: a full swing early in the count, shortened up to protect with two strikes.
    const k = stuff * (P.approach[`${before.balls}-${before.strikes}`] ?? 1);
    const read = Math.exp(-(((missBy * k) / P.contact.miss) ** 2)) * Math.exp(-(((early * k) / P.contact.timing) ** 2));
    // And where it crosses: in 2026 hitters missed a pitch on the corners of the zone almost twice as often as one over
    // the middle (edge, by how far toward a corner it is, 0 at the middle and 2 at a corner or past it).
    const pContact = (P.contact.max
      * (P.contact.floor + (1 - P.contact.floor) * read)
      * Math.exp(-((reach / P.contact.reach) ** 2))
      * Math.exp(-Math.max(0, entry.mph - 93) * P.contact.velo)
      * Math.exp(-P.contact.edge * toCorner(plate))) ** stuff;
    swung(ab, out, { pContact, missBy, early, reach, at: r.at, side, H });
  }

  return counted(ab, out);
}

// ---------------------------------------------------------------- the hitter's side

// You at the plate: the pitcher calls (autoCall) and throws (pitchTo), and you swing or take (swingAt, once for each
// pitch). The pitch, the umpire and what a swing does once it's made are the model's. Your swing is where you tapped
// (`at`, [x, z] on the plate in feet) and when (`early`, seconds: more than 0 before the ball got there, less after),
// in place of the model hitter's read, with his contact: the pitch's stuff, the count, how far it was off the plate,
// its speed and the corners all count as they do for him, and the platoon split holds. Not his floor, though: a swing
// nowhere near the ball misses it. And a miss across the plate counts for ACROSS of one up or down, the bat being long
// that way. You're no kind of hitter but yourself, so none of the kinds' changes apply.
export const ACROSS = 0.5;
export const pitchTo = (ab, call) => ({ ...deliver(ab, call), n: ab.pitches.length + 1 });
export function swingAt(ab, pitch, swing) {
  if (ab.result || pitch.n !== ab.pitches.length + 1) throw new Error('that pitch has been swung at');
  const P = ab.params, { call, entry, aim, target, mph, flight, plate, atDecide, before } = pitch;
  const at = swing?.at ?? null, early = swing ? swing.early : 0;
  const miss = at ? [plate[0] - at[0], plate[1] - at[1]] : [0, 0], missBy = Math.hypot(miss[0] * ACROSS, miss[1]);
  const out = {
    n: pitch.n, code: call.code, spot: call.spot, mph, before, aim, plate, atDecide, miss, missBy, early, swing: !!swing, swungAt: at,
    inZone: inZone(plate[0], plate[1]), flight: { target, T: flight.T }, path: flight, result: null, play: null, you: true,
  };
  if (!swing) out.result = taken(ab, plate, before);
  else {
    const side = sideOf(ab), reach = Math.max(0, -margin(plate[0], plate[1]));
    const stuff = (P.stuff[call.code] ?? 1) * (P.pitcherStuff[ab.pitcher.key]?.[call.code] ?? 1) * (before.strikes === 2 ? P.pitcherPutaway[ab.pitcher.key] ?? 1 : 1) * Math.exp(side * P.platoon.stuff);
    const k = stuff * (P.approach[`${before.balls}-${before.strikes}`] ?? 1);
    const read = Math.exp(-(((missBy * k) / P.contact.miss) ** 2)) * Math.exp(-(((early * k) / P.contact.timing) ** 2));
    const pContact = (P.contact.max * read * Math.exp(-((reach / P.contact.reach) ** 2)) * Math.exp(-Math.max(0, entry.mph - 93) * P.contact.velo) * Math.exp(-P.contact.edge * toCorner(plate))) ** stuff;
    out.stuff = stuff;
    swung(ab, out, { pContact, missBy, early, reach, at, side, H: NO_TYPE });
  }
  return counted(ab, out);
}

// ---------------------------------------------------------------- the ABS challenge

// In 2026 the pitcher, the catcher or the batter could challenge the umpire's call of ball or strike, and the Automated
// Ball-Strike system settled it: a strike if any part of the ball touched any part of the zone. Each club started a
// game with two challenges and kept every one that succeeded (MLB, "MLB announces ABS Challenge System coming to the
// Major Leagues beginning in the 2026 season", September 23, 2025). Here you're the pitcher's side, so you can challenge
// a ball called on a pitch that crossed within CLOSE of the zone, right after it's called, with two challenges to an
// at-bat or an inning, keeping the ones that succeed. It's settled by the zone every pitch is judged by (ZONE: 2026's,
// a ball's width past each edge, so a ball touching it is in). The hitter doesn't challenge: he and his umpire play as
// they were tuned, to 2026's balls and strikes as Statcast has them.
export const CHALLENGES = 2;
export const CLOSE = 3 / 12; // feet between the ball and the zone
export const challengeable = p => !!p && p.result === 'ball' && !p.challenge && margin(p.plate[0], p.plate[1]) > -CLOSE;
// Challenges left, of the at-bats `abs` (one, or an inning's so far): two, less those that failed.
export const challengesLeft = abs => CHALLENGES - abs.reduce((n, ab) => n + ab.pitches.filter(p => p.challenge === 'upheld').length, 0);
// Challenge the ball just called (it must be challengeable): in the zone, it's overturned to a called strike, and the
// count changes with it, so ball four can become a ball three count again, or strike three looking; out of it, the call
// stands. Gives 'overturned' or 'upheld', which the pitch keeps as `challenge`.
export function challenge(ab) {
  const p = ab.pitches.at(-1);
  if (!challengeable(p)) throw new Error('there is no ball to challenge');
  p.challenge = p.inZone ? 'overturned' : 'upheld';
  if (p.challenge === 'overturned') {
    p.result = 'called';
    ab.balls--;
    ab.strikes++;
    p.after = { balls: ab.balls, strikes: ab.strikes };
    ab.result = ab.strikes === 3 ? 'KL' : null;
  }
  return p.challenge;
}
// A call read from a link: thrown, and if the link marks it challenged, challenged, when it can be with one left among
// `abs`. Gives false for a challenge that couldn't be made, which is left out.
export function throwLinked(ab, call, abs = [ab]) {
  const p = throwCall(ab, call);
  if (!call.challenge) return true;
  if (!challengeable(p) || challengesLeft(abs) < 1) return false;
  challenge(ab);
  return true;
}

// ---------------------------------------------------------------- an inning

// An inning: one pitcher to batter after batter, all on one side of the plate and of one kind, until three are out (a
// strikeout, swinging or looking, or an out in play). Each batter is a hitter of his own, with luck of his own: the
// first faces the inning's seed, and each after him a seed drawn from it, so a link brings back the same batters.
export const OUTS = new Set(['K', 'KL', 'out']);
export const batterSeed = (seed, i) => (i ? (Math.imul((seed ^ 0x9e3779b9) >>> 0, 2 * i + 1) + Math.imul(i, 0x85ebca6b)) >>> 0 : seed >>> 0);
export const outsIn = abs => abs.filter(ab => OUTS.has(ab.result)).length;
// Every call of an inning in turn, each to the batter who's up, a new one once an at-bat ends. `abs` are the at-bats,
// and `thrown` how many calls were thrown: none after the third out.
export function playInning({ pitcher = AVERAGE, batter = 'R', hitter = 'average', seed = 1, calls, params = DEFAULTS }) {
  const abs = [];
  let thrown = 0;
  for (const call of calls) {
    if (outsIn(abs) >= 3) break;
    if (!abs.length || abs.at(-1).result) abs.push(startAtBat({ pitcher, batter, hitter, seed: batterSeed(seed, abs.length), params }));
    throwLinked(abs.at(-1), call, abs);
    thrown++;
  }
  return { abs, outs: outsIn(abs), thrown };
}

// ---------------------------------------------------------------- a pitcher who picks for himself

// Which pitch and where, the way pitchers do on average in this count: more fastballs and strikes when behind,
// more breaking balls off the plate when ahead. The pitch from his mix to this batter's side of the plate (mixFor); the
// spot by the side it breaks to (OTHER_SIDE).
export function autoCall(ab) {
  const P = ab.params, R = ab.rand, key = countKey(ab);
  const fb = P.countFastball[key], mix = mixFor(ab.pitcher, ab.batter);
  const weights = ab.pitcher.pitches.map((p, i) => mix[i] * (FASTBALLS.has(p.code) ? fb / P.leagueFastball : (1 - fb) / (1 - P.leagueFastball)));
  const entry = R.pick(ab.pitcher.pitches, weights);
  const other = sideOf(ab) < 0 ? OTHER_SIDE[entry.code] : null;
  const fam = other?.table || FAMILY[entry.code] || 'fast';
  const wantZone = R.chance(Math.min(0.97, P.zoneIntent[key] * (P.typeZone[entry.code] ?? 1)));
  const table = ZONE_TABLE[fam][wantZone ? 'zone' : 'out'];
  const spot = R.pick(table.map(o => o.spot), table.map(o => o.w));
  const turn = other?.turn >= 1 || (other?.turn > 0 && R.chance(other.turn));
  return { code: entry.code, spot: turn ? S(-spot.c, spot.r) : spot };
}

// Where each kind of pitch goes, as [column (in -2 .. away 2), row (down -2 .. up 2), weight]: in the zone, and off it,
// to a batter on the pitcher's own side of the plate. A pitch that breaks toward his glove side (a slider, sweeper,
// curve or cutter) goes away from him; one that runs to the arm side (a sinker, changeup or splitter) goes in.
// To a batter on the other side (OTHER_SIDE) a sinker's table is turned round, in for away, so it runs away from him;
// a changeup or splitter goes where a slider goes to one on the pitcher's own side, down and away; and a glove-side
// pitch's table is turned round half the time, so it goes in or away about equally. So they did in 2026: right-handers'
// sinkers crossed two inches inside right-handed batters on average and two outside left-handed ones, their changeups
// an inch inside right-handed batters and five outside left-handed ones, their sliders half a foot outside right-handed
// batters and an inch and a half inside left-handed ones, their curves four inches outside right-handed batters and
// half an inch outside left-handed ones. The four-seamer, eephus and knuckleball keep to their tables.
const FAMILY = { FF: 'fast', FC: 'fast', EP: 'fast', SI: 'sink', SL: 'break', ST: 'break', CU: 'break', KC: 'break', SV: 'break', CH: 'soft', FS: 'soft', FO: 'soft', KN: 'soft' };
const S = (c, r) => SPOTS.find(s => s.c === c && s.r === r);
const OTHER_SIDE = {
  SI: { turn: 1 }, CH: { table: 'break' }, FS: { table: 'break' }, FO: { table: 'break' },
  SL: { turn: 0.5 }, ST: { turn: 0.5 }, CU: { turn: 0.5 }, KC: { turn: 0.5 }, SV: { turn: 0.5 }, FC: { turn: 0.5 },
};
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

// Throw `spot` with every pitch in the arsenal `runs` times from where this at-bat stands now: throws `from` to
// `from + runs` of them, so a chart can be thrown a slice at a time and come out the same as all at once. Every pitch's
// i-th throw starts from the same random draws (for how far it misses the spot, what the hitter guesses, and the rest),
// so what tells two pitches apart is the pitches more than their luck. Each faces the hitter as he stands, with every
// pitch of the at-bat so far: what he looks for, and where he's ready to hit one, come from all of them. `codes` throws
// only those of his pitches, the same throws as with all of them.
export function whatIf(ab, spot, runs = 100, seed = 1, from = 0, codes = null) {
  const out = {};
  for (const entry of ab.pitcher.pitches) {
    if (codes && !codes.includes(entry.code)) continue;
    const tally = { ball: 0, called: 0, whiff: 0, foul: 0, out: 0, hit: 0, hbp: 0, runs };
    for (let i = from; i < from + runs; i++) {
      const copy = startAtBat({ pitcher: ab.pitcher, batter: ab.batter, hitter: ab.hitter, seed: (seed * 7919 + i * 104729) >>> 0, params: ab.params });
      copy.balls = ab.balls; copy.strikes = ab.strikes;
      copy.pitches = ab.pitches.slice();
      const r = throwCall(copy, { code: entry.code, spot });
      if (r.result === 'inplay') tally[r.play === 'out' ? 'out' : 'hit']++;
      else if (r.result === 'tip') tally.whiff++;
      else tally[r.result]++;
    }
    out[entry.code] = tally;
  }
  return out;
}
