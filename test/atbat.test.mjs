// The at-bat model:  node --test test/atbat.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { startAtBat, throwCall, autoAtBat, whatIf, PITCHERS, SPOTS, spotById, spotName, AVERAGE, pitcherByKey } from '../js/atbat.js';
import { COUNTS, TYPES } from '../js/league.js';
import { measure, measurePitchers, TARGET } from './lab.mjs';
import { PARAMS } from '../js/atbat-params.js';
import { why, note, boxAt, calledLine } from '../js/atbat-words.js';

const RESULTS = new Set(['ball', 'called', 'whiff', 'foul', 'tip', 'inplay', 'hbp']);
const ENDS = new Set(['K', 'KL', 'BB', 'HBP', 'out', '1B', '2B', '3B', 'HR']);

test('every pitcher can throw every pitch to every spot, to either side of the plate', () => {
  let seed = 1;
  for (const pitcher of PITCHERS) for (const batter of ['R', 'L']) for (const e of pitcher.pitches) for (const spot of SPOTS) {
    const ab = startAtBat({ pitcher, batter, seed: seed++ });
    const r = throwCall(ab, { code: e.code, spot });
    const what = `${pitcher.key} ${e.code} at ${spot.id} to a ${batter}`;
    assert.ok(RESULTS.has(r.result), `${what}: ${r.result}`);
    for (const v of [...r.plate, ...r.atDecide, r.missBy, r.early]) assert.ok(Number.isFinite(v), `${what}: a number went bad`);
    assert.ok(r.plate[1] > -1 && r.plate[1] < 7, `${what}: crossed the plate at ${r.plate[1].toFixed(2)} ft`);
  }
});

test('each of the 25 spots has its own name, and the two sides read alike', () => {
  assert.equal(new Set(SPOTS.map(spotName)).size, 25);
  for (const spot of SPOTS) {
    const name = spotName(spot);
    // Past the plate's edge on either side is "off the plate inside" or "off the plate away"; in the zone it's "in" or
    // "away", so "up and in" (a strike) never sits beside an "up and inside" (a ball).
    assert.equal(/off the plate (inside|away)/.test(name), Math.abs(spot.c) === 2, `${spot.id}: ${name}`);
    assert.doesNotMatch(name.replace('off the plate inside', ''), /inside/, `${spot.id}: ${name}`);
  }
});

test('the same seed and the same calls replay the same at-bat', () => {
  const calls = [['FF', '1m1'], ['SL', 'm21'], ['CH', 'm1m1'], ['FF', '20'], ['CU', 'm20'], ['FF', '00'], ['SL', 'm22']];
  const play = () => {
    const ab = startAtBat({ pitcher: AVERAGE, batter: 'L', seed: 4242 });
    for (const [code, spot] of calls) if (!ab.result) throwCall(ab, { code, spot: spotById(spot) });
    return ab.pitches.map(p => [p.result, p.play, p.plate.map(v => v.toFixed(4)).join()]);
  };
  assert.deepEqual(play(), play());
});

test('the count works: four balls walk him, three strikes sit him down, a foul with two strikes changes nothing', () => {
  for (let seed = 1; seed <= 400; seed++) {
    const ab = autoAtBat({ pitcher: AVERAGE, seed });
    assert.ok(ENDS.has(ab.result), `seed ${seed}: ended ${ab.result}`);
    for (const p of ab.pitches) {
      const { balls, strikes } = p.before;
      if (p.result === 'ball') assert.equal(p.after.balls, balls + 1);
      if (p.result === 'foul') assert.equal(p.after.strikes, Math.min(2, strikes + 1));
      if (p.result === 'whiff' || p.result === 'called' || p.result === 'tip') assert.equal(p.after.strikes, strikes + 1);
    }
    const last = ab.pitches.at(-1).after;
    if (ab.result === 'BB') assert.equal(last.balls, 4);
    if (ab.result === 'K' || ab.result === 'KL') assert.equal(last.strikes, 3);
  }
});

// The words: what made each pitch go how it did, and the scout's note at the end. Thousands of at-bats played by the
// pitchers' own calls, every pitcher to either side, with each pitch's why and the note checked for what reads badly.
const PLAYED = [];
{
  let seed = 1;
  for (const pitcher of PITCHERS) for (const batter of ['R', 'L']) for (let i = 0; i < 200; i++) PLAYED.push(autoAtBat({ pitcher, batter, seed: seed++ }));
}
const words = ab => [['note', note(ab)], ...ab.pitches.map((p, i) => [`pitch ${p.n}`, why(p, ab.pitches[i - 1], ab.batter)])];
const READS_BADLY = [
  [/\d in\b/, 'inches as "in"'],
  [/\d (ms|mph)\b/, 'a unit that can start a line on its own'],
  [/\b(chased|missed|swung at|chasing) [01]\b/, 'a count of 0 or 1 as a digit', 'note'],
  [/(\d+) of the \1 pitches/, '"4 of the 4"', 'note'],
  [/'/, 'a straight apostrophe', 'note'],
];
test('the at-bat’s words read cleanly over thousands of at-bats', () => {
  for (const ab of PLAYED) for (const [what, text] of words(ab)) for (const [re, why, only] of READS_BADLY) {
    if (only && !what.startsWith(only)) continue;
    assert.doesNotMatch(text, re, `${ab.pitcher.key} to a ${ab.batter}, seed ${ab.seed}, ${what}: ${why}: ${text}`);
  }
});

test('the scout’s note says what decided the at-bat', () => {
  for (const ab of PLAYED) {
    const text = note(ab), last = ab.pitches.at(-1), prev = ab.pitches.at(-2), at = `${ab.pitcher.key} to a ${ab.batter}, seed ${ab.seed}: ${text}`;
    // The walk's lead counts the pitches and the chases, so the rest doesn't count them again.
    if (ab.result === 'BB') assert.equal((text.match(/chase/g) || []).length, 1, at);
    // A foul tip is contact: the tally counts it apart, not as a miss.
    if (last.result === 'tip') {
      assert.match(text, /tipped/, at);
      if (!ab.pitches.some(p => p.result === 'whiff')) assert.doesNotMatch(text, /missed/, at);
    }
    // Hit by a pitch: the count and the call, not the last pitch's own "It got away inside" again.
    if (ab.result === 'HBP') assert.match(text, /^The (first-pitch|[0-3]-[0-2]) [a-z -]+, meant to be [a-z, ]+, got away and hit him\./, at);
    // Strike three looking off the plate was the umpire's call.
    assert.equal(/the umpire gave the pitcher the edge/.test(text), ab.result === 'KL' && !last.inZone, at);
    // Two pitches look alike only if they finished well apart: twice as far as at the decision point, and 8 inches.
    if (/looked just like/.test(text)) {
      const apart = Math.hypot(last.plate[0] - prev.plate[0], last.plate[1] - prev.plate[1]);
      assert.ok(apart >= Math.max(2 * last.tunnel, 8 / 12), at);
    }
    // Weak contact by when he swung: rolled over when early, jammed when late.
    if (/rolled it over/.test(text)) assert.ok(last.early > 0.008, at);
    if (/got in on him/.test(text)) assert.ok(last.early < -0.008, at);
  }
  // A four-pitch walk, every one high and inside.
  assert.equal(note(replay('#ab.average.R.1.FF0.FF0.FF0.FF0')), 'All four missed the zone, and he didn’t chase any.');
  // Misiorowski's curve was meant for the dirt and hung in the zone.
  assert.match(note(replay('#ab.misiorowski.R.m.FF13.SL19.CU22')), /^The curveball was meant to be in the dirt but crossed down in the zone, and he didn’t miss it\./);
  // The README's strikeout: six pitches, ending on a curve 6 mph slower than the slider before it.
  const k = replay('#ab.average.R.1p.FF6.SL23.CH16.FF3.SL24.CU22');
  assert.equal(k.result, 'K');
  assert.equal(k.pitches.length, 6);
  assert.equal(note(k), 'The curveball was 6\u00a0mph slower than the slider before it, and his timing was set for the faster one. 6 pitches: he swung at 3 and missed 2, chasing one out of the zone.');
});

// An at-bat link (#ab.<pitcher>.<R|L>.<seed>.<pitch><spot>...), played the way the page plays it.
function replay(link) {
  const [, key, batter, seed, ...calls] = link.replace(/^#/, '').split('.');
  const ab = startAtBat({ pitcher: pitcherByKey(key), batter, seed: parseInt(seed, 36) >>> 0 });
  for (const c of calls) if (!ab.result) throwCall(ab, { code: c.slice(0, 2), spot: SPOTS[Number(c.slice(2))] });
  return ab;
}

test('the log says where a pitch crossed when it went to another box than the one called', () => {
  for (const ab of PLAYED) for (const p of ab.pitches) {
    const box = boxAt(p.plate, ab.batter), line = calledLine(p, ab.batter);
    assert.equal(box.zone, p.inZone, `seed ${ab.seed}, pitch ${p.n}: crossed in ${box.id}, in the zone ${p.inZone}`);
    assert.equal(line.startsWith('called '), box.id !== p.spot.id, `seed ${ab.seed}, pitch ${p.n}: ${line}`);
  }
  // Misiorowski's curve, called in the dirt, hung in the zone and went out.
  assert.equal(calledLine(replay('#ab.misiorowski.R.m.FF13.SL19.CU22').pitches[2], 'R'), 'called in the dirt, crossed down in the zone');
  // The README's strikeout: the curve to the dirt box crossed in it, so the log names the call alone.
  assert.equal(calledLine(replay('#ab.average.R.1p.FF6.SL23.CH16.FF3.SL24.CU22').pitches[5], 'R'), 'in the dirt');
});

// The lab: 8,000 at-bats with the pitcher choosing for himself, measured the way Statcast measures the league.
const lab = measure(PARAMS, 8000, 21);
test('over thousands of at-bats it comes out near the real league', () => {
  const near = (key, by) => assert.ok(Math.abs(lab[key] - TARGET[key]) <= by, `${key}: ${lab[key].toFixed(3)} against the league's ${TARGET[key].toFixed(3)}`);
  near('k', 0.03); near('bb', 0.015); near('hbp', 0.006); near('ppa', 0.2);
  near('swing', 0.025); near('whiff', 0.025); near('zone', 0.025);
  near('zoneSwing', 0.025); near('zoneWhiff', 0.025); near('chaseSwing', 0.03); near('chaseWhiff', 0.03);
  near('calledZone', 0.025); near('calledChase', 0.015); near('foul', 0.03);
  near('hitsPerBip', 0.025); near('hrPerBip', 0.012);
});

test('in every count, hitters swing and miss about as often as they really do', () => {
  for (const [c, v] of Object.entries(lab.counts)) {
    assert.ok(Math.abs(v.swing - COUNTS[c].swing) <= 0.045, `${c}: swings at ${v.swing.toFixed(3)} against ${COUNTS[c].swing}`);
    if (v.pitches * v.swing > 300) assert.ok(Math.abs(v.whiff - COUNTS[c].whiff) <= 0.04, `${c}: misses ${v.whiff.toFixed(3)} against ${COUNTS[c].whiff}`);
  }
});

test('each kind of pitch gets missed about as often as it really does', () => {
  for (const [t, v] of Object.entries(lab.types)) {
    if (!TYPES[t] || v.swings < 150) continue;
    assert.ok(Math.abs(v.whiff - TYPES[t].whiff) <= 0.05, `${t}: missed on ${(v.whiff * 100).toFixed(1)}% of swings against ${(TYPES[t].whiff * 100).toFixed(1)}%`);
    assert.ok(Math.abs(v.zone - TYPES[t].zone) <= 0.05, `${t}: in the zone ${(v.zone * 100).toFixed(1)}% against ${(TYPES[t].zone * 100).toFixed(1)}%`);
  }
});

test('each real pitcher’s pitches get missed about as often as his really did', () => {
  for (const [key, rows] of Object.entries(measurePitchers(PARAMS, 1200, 33))) {
    for (const r of rows) {
      if (r.swings < 60) continue;
      assert.ok(Math.abs(r.sim - r.real) <= 0.09, `${pitcherByKey(key).name}'s ${r.code}: ${(r.sim * 100).toFixed(0)}% against ${(r.real * 100).toFixed(0)}%`);
    }
  }
});

test('changing speeds works: a changeup after a fastball fools him more than one after a changeup', () => {
  const after = prevCode => {
    let swings = 0, whiffs = 0;
    for (let i = 0; i < 600; i++) {
      const ab = startAtBat({ pitcher: AVERAGE, seed: 900 + i });
      throwCall(ab, { code: prevCode, spot: spotById('00') });
      if (ab.result) continue;
      ab.balls = 0; ab.strikes = 1;
      const r = throwCall(ab, { code: 'CH', spot: spotById('m10') });
      if (r.swing) { swings++; if (r.result === 'whiff') whiffs++; }
    }
    return whiffs / swings;
  };
  const afterFastball = after('FF'), afterChangeup = after('CH');
  assert.ok(afterFastball > afterChangeup + 0.03, `after a fastball ${afterFastball.toFixed(3)}, after a changeup ${afterChangeup.toFixed(3)}`);
});

test('a hundred of each from here: every pitch in the arsenal, every outcome counted', () => {
  const ab = startAtBat({ pitcher: pitcherByKey('gausman'), seed: 5 });
  throwCall(ab, { code: 'FF', spot: spotById('10') });
  const t = whatIf(ab, spotById('m20'), 100, 3);
  assert.deepEqual(Object.keys(t), pitcherByKey('gausman').pitches.map(p => p.code));
  for (const v of Object.values(t)) assert.equal(v.ball + v.called + v.whiff + v.foul + v.out + v.hit + v.hbp, 100);
  // A splitter in the dirt is missed far more often than a four-seamer there.
  assert.ok(t.FS.whiff > t.FF.whiff, `splitter ${t.FS.whiff} misses, four-seamer ${t.FF.whiff}`);
});
