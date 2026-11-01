// Tunes the at-bat model's knobs until simulated at-bats come out like the real league:  node tools/calibrate.mjs [rounds]
// Writes js/atbat-params.js. The targets are js/league.js (tools/league.mjs makes it from Statcast).
// Each round: the pitcher's aim by count and pitch type, the hitter's swing by count, the umpire, and hit-by-pitches
// are nudged straight toward their targets; then the contact and recognition knobs are searched at random,
// keeping a change only when it lowers the total error; then the outcomes of balls in play are matched by quantile.
import { writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEAGUE, COUNTS, TYPES } from '../js/league.js';
import { measure, measurePitchers, TARGET } from '../test/lab.mjs';
import { PARAMS as START } from '../js/atbat-params.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rounds = Number(process.argv[2]) || 8;
const PA = 9000;
const logit = p => Math.log(p / (1 - p));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clone = o => JSON.parse(JSON.stringify(o));
let P = clone(START);

// Where the knobs live in PARAMS, and how far a random step may move each (as a factor).
const KNOBS = [
  ['recognize.base', 0.15], ['recognize.gain', 0.15], ['recognize.scale', 0.2], ['recognize.first', 0.2],
  ['contact.max', 0.03], ['contact.floor', 0.12], ['contact.miss', 0.12], ['contact.timing', 0.12], ['contact.reach', 0.15], ['contact.velo', 0.3],
  ['fair.base', 0.12], ['fair.gain', 0.1], ['fair.miss', 0.15], ['fair.timing', 0.15], ['fair.reach', 0.15],
  ['judge', 0.15], ['swingWidth', 0.12], ['command', 0.06],
];
const get = (o, path) => path.split('.').reduce((a, k) => a[k], o);
const set = (o, path, v) => { const ks = path.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };

// The error the random search minimises: swinging and missing, overall, in and out of the zone, by pitch type,
// and how contact splits between fouls and balls in play.
function error(m) {
  let e = 0;
  const sq = (a, b, w = 1) => { e += w * ((a - b) / Math.max(0.02, b)) ** 2; };
  sq(m.whiff, TARGET.whiff, 4); sq(m.zoneWhiff, TARGET.zoneWhiff, 3); sq(m.chaseWhiff, TARGET.chaseWhiff, 3);
  sq(m.zoneSwing, TARGET.zoneSwing, 3); sq(m.chaseSwing, TARGET.chaseSwing, 3); sq(m.foul, TARGET.foul, 3);
  sq(m.zone, TARGET.zone, 2); sq(m.k, TARGET.k, 4); sq(m.bb, TARGET.bb, 3); sq(m.ppa, TARGET.ppa, 8);
  for (const [t, v] of Object.entries(m.types)) if (TYPES[t] && v.swings > 300) sq(v.whiff, TYPES[t].whiff, 1);
  return e;
}

// Straight-line nudges for the knobs that each answer one target.
function nudge(m) {
  for (const [c, v] of Object.entries(m.counts)) {
    const t = COUNTS[c];
    P.zoneIntent[c] = Math.min(0.97, Math.max(0.05, P.zoneIntent[c] * (t.zone / Math.max(0.01, v.zone)) ** 0.8));
    P.swingBias[c] += 0.7 * P.swingWidth * (logit(t.swing) - logit(Math.min(0.99, Math.max(0.01, v.swing))));
    if (v.pitches * v.swing > 150) P.approach[c] = clamp(P.approach[c] * Math.exp(0.6 * (logit(t.whiff) - logit(Math.min(0.95, Math.max(0.02, v.whiff))))), 0.4, 2.5);
  }
  let wsum = 0, w = 0;
  for (const [t, v] of Object.entries(m.types)) {
    if (!TYPES[t] || v.pitches < 200) continue;
    P.typeZone[t] = (P.typeZone[t] ?? 1) * (TYPES[t].zone / Math.max(0.01, v.zone)) ** 0.8;
    wsum += P.typeZone[t] * v.pitches; w += v.pitches;
  }
  for (const t of Object.keys(P.typeZone)) P.typeZone[t] /= wsum / w; // keep the average where the counts put it
  // Umpire: called strikes on pitches taken in the zone, and out of it.
  // Too many strikes called off the plate means the umpire's edge is too soft: narrow it.
  P.ump.shift = clamp(P.ump.shift - 0.4 * P.ump.width * (logit(TARGET.calledZone) - logit(m.calledZone)), -0.3, 0.3);
  P.ump.width = clamp(P.ump.width * (TARGET.calledChase / Math.max(0.005, m.calledChase)) ** 0.25, 0.01, 0.3);
  // Each kind of pitch: its stuff, until hitters miss it as often as they really do.
  for (const [t, v] of Object.entries(m.types)) {
    if (!TYPES[t] || v.swings < 120) continue;
    P.stuff[t] = clamp(P.stuff[t] * Math.exp(0.8 * (logit(TYPES[t].whiff) - logit(Math.min(0.95, Math.max(0.02, v.whiff))))), 0.5, 2);
  }
  // Fouls: the chance that square-enough contact goes fair, and how much more he spoils with two strikes (which is
  // most of what makes an at-bat long).
  P.fair.gain = clamp(P.fair.gain * ((1 - TARGET.foul) / (1 - m.foul)) ** 0.8, 0.05, 1.5);
  P.fair.twoStrike = clamp(P.fair.twoStrike * (m.ppa / TARGET.ppa) ** 1.5, 0.5, 1.1);
  P.hbp.at = clamp(P.hbp.at + 0.08 * Math.log(Math.max(0.001, m.hbp) / TARGET.hbp), 1.2, 2.6);
}

// Balls in play: thresholds on the contact score at the quantiles that give the league's home runs, extra-base hits
// and singles per ball in play.
function outcomes(m) {
  const s = [...m.contactScores].sort((a, b) => a - b);
  const q = p => s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))];
  const bip = LEAGUE.bip;
  P.outcome.hr = q(1 - LEAGUE.hrs / bip);
  P.outcome.xbh = q(1 - (LEAGUE.hrs + LEAGUE.doubles + LEAGUE.triples) / bip);
  P.outcome.triple = LEAGUE.triples / (LEAGUE.doubles + LEAGUE.triples);
  // Singles come from the rest: scale the chance so their share matches.
  const below = s.filter(v => v <= P.outcome.xbh);
  const want = LEAGUE.singles / bip * s.length;
  const have = below.reduce((a, v) => a + P.outcome.single[0] + P.outcome.single[1] * Math.max(0, v), 0);
  P.outcome.single = P.outcome.single.map(v => v * want / have);
}

let seed = 1;
let best = measure(P, PA, seed);
let bestErr = error(best);
console.log('start', bestErr.toFixed(3));
for (let round = 1; round <= rounds; round++) {
  for (let i = 0; i < 3; i++) { nudge(measure(P, PA, seed)); }
  outcomes(measure(P, PA, seed));
  best = measure(P, PA, seed); bestErr = error(best);
  for (let i = 0; i < 40; i++) {
    const trial = clone(P);
    for (const [path, step] of KNOBS) if (Math.random() < 0.35) set(trial, path, get(trial, path) * Math.exp((Math.random() * 2 - 1) * step));
    const m = measure(trial, PA, seed);
    const e = error(m);
    if (e < bestErr) { P = trial; best = m; bestErr = e; }
  }
  console.log(`round ${round}: error ${bestErr.toFixed(3)} · K ${(best.k * 100).toFixed(1)}% BB ${(best.bb * 100).toFixed(1)}% swing ${(best.swing * 100).toFixed(1)}% whiff ${(best.whiff * 100).toFixed(1)}% zone ${(best.zone * 100).toFixed(1)}% chase ${(best.chaseSwing * 100).toFixed(1)}% P/PA ${best.ppa.toFixed(2)}`);
}
outcomes(measure(P, PA, seed));

// Each real pitcher's pitches: their stuff, until hitters miss each as often as they missed his in real life.
function fitPitchers(steps) {
  for (let i = 0; i < steps; i++) {
    for (const [key, rows] of Object.entries(measurePitchers(P, 1200, 11 + i))) {
      const own = P.pitcherStuff[key] ||= {};
      for (const r of rows) {
        if (r.swings < 40 || r.real == null) continue;
        own[r.code] = clamp((own[r.code] ?? 1) * Math.exp(0.7 * (logit(r.real) - logit(Math.min(0.95, Math.max(0.02, r.sim))))), 0.3, 4);
      }
    }
  }
}
fitPitchers(6);
for (let i = 0; i < 3; i++) nudge(measure(P, PA, seed));
// A last, finer pass on more at-bats, so rare counts like 3-0 have enough pitches to aim at.
for (let i = 0; i < 3; i++) nudge(measure(P, PA * 4, seed + 1 + i));
outcomes(measure(P, PA * 4, seed));

const round3 = o => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'number' ? Math.round(v * 10000) / 10000 : v)));
const js = `// Made by tools/calibrate.mjs on ${new Date().toISOString().slice(0, 10)}: the at-bat model's knobs, tuned so simulated
// at-bats match the league in js/league.js. Distances in feet, times in seconds. See js/atbat.js for what each does.
export const PARAMS = ${JSON.stringify(round3(P), null, 1)};
`;
await writeFile(join(root, 'js/atbat-params.js'), js);
console.log('wrote js/atbat-params.js');
