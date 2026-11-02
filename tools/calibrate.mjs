// Tunes the at-bat model's knobs until simulated at-bats come out like the real league:
//   node tools/calibrate.mjs [rounds] [--seed=N] [--out=PATH]
// Writes js/atbat-params.js (or PATH). The targets are js/league.js (tools/league.mjs makes it from Statcast).
// Each round: the pitcher's aim by count and pitch type, the hitter's swing by count, the umpire, and hit-by-pitches
// are nudged straight toward their targets; then the contact and recognition knobs are searched at random,
// keeping a change only when it lowers the total error; then the outcomes of balls in play are matched by quantile.
// The round with the lowest error is kept and finished with finer nudges, and each real pitcher's pitches are fitted
// last, so nothing after undoes them. Then the knobs are put to the lab's checks (test/lab.mjs, the same as
// test/atbat.test.mjs's, on three other seeds pooled); if any fails, it says which and writes nothing.
// The random search is seeded (js/rng.js, seed 1 unless --seed says otherwise) and the file's date is js/league.js's,
// so the same league numbers and the same starting knobs write the same file, byte for byte. It starts from the knobs
// in js/atbat-params.js, so a second run into that file moves them again, and new knobs change how old at-bat links
// replay: raise VERSION in js/atbat.js with them.
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEAGUE, COUNTS, TYPES } from '../js/league.js';
import { measure, measurePitchers, TARGET, checks, SEEDS, GROUPS } from '../test/lab.mjs';
import { PARAMS as START } from '../js/atbat-params.js';
import { rng } from '../js/rng.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), flag = name => args.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const rounds = Number(args.find(a => !a.startsWith('--'))) || 8;
const seed0 = Number(flag('seed') ?? 1);
if (!Number.isInteger(seed0)) throw new Error('--seed takes a whole number, like --seed=2');
const random = rng(seed0);
const out = flag('out') ? resolve(flag('out')) : join(root, 'js/atbat-params.js');
// The day the league numbers were gathered, from js/league.js's first line.
const made = (await readFile(join(root, 'js/league.js'), 'utf8')).match(/^\/\/ Made by .* on (\d{4}-\d{2}-\d{2})/)?.[1];
if (!made) throw new Error('js/league.js has no "Made by ... on YYYY-MM-DD" line to date the knobs by');
const PA = 9000;
const logit = p => Math.log(p / (1 - p));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clone = o => JSON.parse(JSON.stringify(o));
let P = clone(START);
// Each real pitcher's command and contact factor, from nothing when the knobs have none yet.
P.pitcherCommand ||= {};
P.pitcherContact ||= {};

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
  // How each kind of pitch looks to him: his swings at it in the zone and his chases, until each is 2026's for that kind.
  // Each averages out to nothing over the pitches it's for, so the counts' swings stay the counts' knobs.
  const mean = { zone: [0, 0], chase: [0, 0] };
  for (const [t, v] of Object.entries(m.types)) {
    const look = P.typeSwing[t];
    if (!TYPES[t] || !look || v.pitches < 300) continue;
    const out = v.pitches - v.zonePitches;
    look.zone = clamp(look.zone + 0.7 * P.swingWidth * (logit(TYPES[t].zoneSwing) - logit(clamp(v.zoneSwing, 0.02, 0.98))), -0.5, 0.5);
    look.chase = clamp(look.chase + 0.7 * P.swingWidth * (logit(TYPES[t].chaseSwing) - logit(clamp(v.chaseSwing, 0.02, 0.98))), -0.5, 0.5);
    mean.zone[0] += look.zone * v.zonePitches; mean.zone[1] += v.zonePitches;
    mean.chase[0] += look.chase * out; mean.chase[1] += out;
  }
  for (const look of Object.values(P.typeSwing)) { look.zone -= mean.zone[0] / mean.zone[1]; look.chase -= mean.chase[0] / mean.chase[1]; }
  // Umpire: called strikes on pitches taken in the zone, and out of it.
  // Too many strikes called off the plate means the umpire's edge is too soft: narrow it.
  P.ump.shift = clamp(P.ump.shift - 0.4 * P.ump.width * (logit(TARGET.calledZone) - logit(m.calledZone)), -0.3, 0.3);
  P.ump.width = clamp(P.ump.width * (TARGET.calledChase / Math.max(0.005, m.calledChase)) ** 0.25, 0.01, 0.3);
  // And in each count, his zone's edge in or out from there, until taken pitches in and out of the zone are called
  // strikes as often as in 2026's count; the shifts average out to nothing over pitches taken, so the league's level
  // stays the shift's above.
  const lo = v => logit(clamp(v, 0.002, 0.998));
  let shifted = 0, takes = 0;
  for (const [c, v] of Object.entries(m.counts)) {
    if (v.zoneTake < 100 || v.chaseTake < 100) continue;
    P.umpBy[c] = clamp(P.umpBy[c] - 0.2 * P.ump.width * ((lo(COUNTS[c].calledZone) - lo(v.calledZone)) + (lo(COUNTS[c].calledOut) - lo(v.calledOut))), -0.3, 0.3);
    shifted += P.umpBy[c] * (v.zoneTake + v.chaseTake); takes += v.zoneTake + v.chaseTake;
  }
  for (const c of Object.keys(P.umpBy)) P.umpBy[c] -= shifted / takes;
  // Each kind of pitch: its stuff, until hitters miss it as often as they really do.
  for (const [t, v] of Object.entries(m.types)) {
    if (!TYPES[t] || v.swings < 120) continue;
    P.stuff[t] = clamp(P.stuff[t] * Math.exp(0.8 * (logit(TYPES[t].whiff) - logit(Math.min(0.95, Math.max(0.02, v.whiff))))), 0.5, 2);
  }
  // Fouls: the chance that square-enough contact goes fair, in each count, until as much of it is fouled off as in
  // 2026 (about half, in every count).
  for (const [c, v] of Object.entries(m.counts)) {
    if (v.pitches * v.swing * (1 - v.whiff) > 150) P.fairBy[c] = clamp(P.fairBy[c] * ((1 - COUNTS[c].foul) / Math.max(0.05, 1 - v.foul)) ** 0.8, 0.3, 2);
  }
  P.hbp.at = clamp(P.hbp.at + 0.08 * Math.log(Math.max(0.001, m.hbp) / TARGET.hbp), 1.2, 2.6);
  // His timing pulled toward the last pitch's speed (memory) and his lean toward expecting the last pitch again (repeat):
  // both shrink or grow together until a pitch right after one 6 mph apart is missed as much more or less often than one
  // right after the same pitch as in 2026 (LEAGUE.after, the log of the odds ratio).
  if (m.after.apart > 500 && m.after.same > 500) timing(Math.exp(0.5 * (LEAGUE.after.lor - m.after.lor)));
  // Where it crossed: how much more he misses on the corners than over the middle, and how much harder he hits one
  // over the middle than one off the plate, each until it's 2026's (the level of both is the other knobs').
  const g = m.groups;
  if (g.middle?.swings > 300 && g.corner?.swings > 300) {
    const gap = x => logit(x.corner.whiff) - logit(x.middle.whiff);
    P.contact.edge = clamp(P.contact.edge + 0.3 * (gap(GROUPS) - gap(g)), 0, 2);
  }
  if (g.middle?.bip > 300 && g.out?.bip > 300) {
    P.quality.middle = clamp(P.quality.middle * ((g.middle.wobacon / g.out.wobacon) / (GROUPS.middle.wobacon / GROUPS.out.wobacon)) ** 0.5, 0.5, 6);
  }
}

// The timing pull and the lean toward repeating, scaled together by f; under a hundredth, nothing.
function timing(f) {
  const to = (v, hi) => { const x = clamp(v * f, 0, hi); return x < 0.01 ? 0 : x; };
  P.memory = to(P.memory, 0.6); P.repeat.lean = to(P.repeat.lean, 2); P.repeat.weight = to(P.repeat.weight, 1);
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
// The best round so far, its knobs and its error.
let kept = { P: clone(P), err: bestErr, round: 0 };
for (let round = 1; round <= rounds; round++) {
  for (let i = 0; i < 3; i++) { nudge(measure(P, PA, seed)); }
  outcomes(measure(P, PA, seed));
  best = measure(P, PA, seed); bestErr = error(best);
  for (let i = 0; i < 40; i++) {
    const trial = clone(P);
    for (const [path, step] of KNOBS) if (random() < 0.35) set(trial, path, get(trial, path) * Math.exp((random() * 2 - 1) * step));
    const m = measure(trial, PA, seed);
    const e = error(m);
    if (e < bestErr) { P = trial; best = m; bestErr = e; }
  }
  console.log(`round ${round}: error ${bestErr.toFixed(3)} · K ${(best.k * 100).toFixed(1)}% BB ${(best.bb * 100).toFixed(1)}% swing ${(best.swing * 100).toFixed(1)}% whiff ${(best.whiff * 100).toFixed(1)}% zone ${(best.zone * 100).toFixed(1)}% chase ${(best.chaseSwing * 100).toFixed(1)}% P/PA ${best.ppa.toFixed(2)}`);
  if (bestErr < kept.err) kept = { P: clone(P), err: bestErr, round };
}
P = kept.P;
console.log(`keeping round ${kept.round}, error ${kept.err.toFixed(3)}`);

// Each real pitcher's pitches: their stuff, until hitters miss each as often as they missed his in real life; his stuff
// with two strikes (pitcherPutaway), until he strikes out as many as he did; his command (pitcherCommand), until he walks
// as many; and his hits on balls in play (pitcherContact), until his wOBA on contact is his own. And the knuckleball's wildness
// (commandBy.KN), until as many of Waldron's cross in the zone as did.
function fitPitchers(steps) {
  for (let i = 0; i < steps; i++) {
    for (const [key, { rows, k, bb, wobacon }] of Object.entries(measurePitchers(P, 1500, [11 + 2 * i, 12 + 2 * i]))) {
      const own = P.pitcherStuff[key] ||= {};
      for (const r of rows) {
        if (r.swings < 40 || r.real == null) continue;
        own[r.code] = clamp((own[r.code] ?? 1) * Math.exp(0.7 * (logit(r.real) - logit(Math.min(0.95, Math.max(0.02, r.sim))))), 0.3, 4);
      }
      P.pitcherPutaway[key] = clamp((P.pitcherPutaway[key] ?? 1) * Math.exp(0.5 * (logit(k.real) - logit(clamp(k.sim, 0.02, 0.9)))), 0.5, 4);
      // Walks go about as the spread's square and a half: a fifth wider, half again as many.
      P.pitcherCommand[key] = clamp((P.pitcherCommand[key] ?? 1) * Math.exp(0.3 * (logit(bb.real) - logit(clamp(bb.sim, 0.01, 0.5)))), 0.4, 2.5);
      P.pitcherContact[key] = clamp((P.pitcherContact[key] ?? 1) * (wobacon.real / Math.max(0.05, wobacon.sim)) ** 0.9, 0.3, 2.5);
      const kn = rows.find(r => r.code === 'KN');
      if (kn?.pitches > 300) P.commandBy.KN = clamp(P.commandBy.KN * Math.exp(0.4 * (logit(clamp(kn.zone, 0.05, 0.95)) - logit(kn.zoneReal))), 0.8, 3);
    }
  }
}
for (let i = 0; i < 3; i++) nudge(measure(P, PA, seed));
// A last, finer pass on more at-bats, so rare counts like 3-0 have enough pitches to aim at.
for (let i = 0; i < 3; i++) nudge(measure(P, PA * 4, seed + 1 + i));
outcomes(measure(P, PA * 4, seed));
console.log(`timing pull ${P.memory.toFixed(3)}, lean toward repeating ${P.repeat.lean.toFixed(3)} and ${P.repeat.weight.toFixed(3)}`);
// Last, each real pitcher: his own knobs only, on top of the league's, so nothing after this moves them.
fitPitchers(8);

// The checks the test holds the hitter to. Knobs that miss any aren't written.
const failed = checks(P).filter(c => !c.ok);
if (failed.length) {
  console.log(`not written: ${failed.length} of the lab's checks fail on seeds ${SEEDS.join(', ')}:`);
  for (const c of failed) console.log(`  ${c.group}: ${c.said}`);
  process.exit(1);
}

const round3 = o => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'number' ? Math.round(v * 10000) / 10000 : v)));
const js = `// Made by tools/calibrate.mjs on ${made}: the at-bat model's knobs, tuned so simulated
// at-bats match the league in js/league.js. Distances in feet, times in seconds. See js/atbat.js for what each does.
export const PARAMS = ${JSON.stringify(round3(P), null, 1)};
`;
await writeFile(out, js);
console.log(`wrote ${out}`);
