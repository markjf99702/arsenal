// The at-bat model:  node --test test/atbat.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { startAtBat, throwCall, autoAtBat, whatIf, PITCHERS, SPOTS, spotById, AVERAGE, pitcherByKey } from '../js/atbat.js';
import { COUNTS, TYPES } from '../js/league.js';
import { measure, measurePitchers, TARGET } from './lab.mjs';
import { PARAMS } from '../js/atbat-params.js';

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
