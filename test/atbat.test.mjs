// The at-bat model:  node --test test/atbat.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { startAtBat, throwCall, autoAtBat, whatIf, PITCHERS, SPOTS, spotById, spotName, AVERAGE, pitcherByKey, ZONE, linkFor, parseLink } from '../js/atbat.js';
import { COUNTS, TYPES, PITCHERS as REAL } from '../js/league.js';
import { readFile } from 'node:fs/promises';
import { measure, measurePitchers, TARGET } from './lab.mjs';
import { PARAMS } from '../js/atbat-params.js';
import { why, note, boxAt, calledLine, bounced, NAME, resultWord, ENDING } from '../js/atbat-words.js';
import { rng } from '../js/rng.js';

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

// js/league.js is written by tools/league.mjs, so a line or a tag changed by hand in one has to match the other, or the
// next refresh puts the old one back.
test('each real pitcher’s line and tag are the ones tools/league.mjs writes', async () => {
  const tool = await readFile(new URL('../tools/league.mjs', import.meta.url), 'utf8');
  const rows = Object.fromEntries([...tool.matchAll(/\[\d+, '(\w+)', '([^']*)', '([^']*)'\]/g)].map(m => [m[1], [m[2], m[3]]]));
  assert.deepEqual(REAL.map(p => [p.key, p.line, p.tag]), REAL.map(p => [p.key, ...(rows[p.key] || [])]));
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

// About 2,000 at-bats called at random, the way someone trying things out might call them: every pitcher to either
// side, each pitch any of his, to any of the 25 spots.
const RANDOM = [];
{
  const R = rng(77);
  for (const pitcher of PITCHERS) for (const batter of ['R', 'L']) for (let i = 0; i < 100; i++) {
    const ab = startAtBat({ pitcher, batter, seed: (R() * 2 ** 32) >>> 0 });
    while (!ab.result) throwCall(ab, { code: pitcher.pitches[Math.floor(R() * pitcher.pitches.length)].code, spot: SPOTS[Math.floor(R() * SPOTS.length)] });
    RANDOM.push(ab);
  }
}
// The words: what made each pitch go how it did, and the scout's note at the end. Thousands of at-bats, every pitcher to
// either side, with each pitch's why and the note checked for what reads badly: 4,000 played by the pitchers' own calls,
// and the 2,000 called at random, with the calls the pitchers never make (a curve high and inside, a sinker up and away).
const PLAYED = [];
{
  let seed = 1;
  for (const pitcher of PITCHERS) for (const batter of ['R', 'L']) for (let i = 0; i < 200; i++) PLAYED.push(autoAtBat({ pitcher, batter, seed: seed++ }));
  PLAYED.push(...RANDOM);
}
const words = ab => [['note', note(ab)], ...ab.pitches.map((p, i) => [`pitch ${p.n}`, why(p, ab.pitches[i - 1], ab.batter)])];
const READS_BADLY = [
  [/\d in\b/, 'inches as "in"'],
  [/\d (ms|mph)\b/, 'a unit that can start a line on its own'],
  [/\b(chased|missed|swung at|chasing) [01]\b/, 'a count of 0 or 1 as a digit', 'note'],
  [/(\d+) of the \1 pitches/, '"4 of the 4"', 'note'],
  [/'/, 'a straight apostrophe'],
  [/sitting on|pick(ed)? it up/, 'jargon the page doesn’t explain'],
  [/laid off|fought it off|squared it up|found a hole|into the gap/, 'a baseball idiom the page doesn’t explain'],
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

test('a ball in play is named the same in the log as on the end card', () => {
  for (const ab of PLAYED) {
    const last = ab.pitches.at(-1);
    if (last.result === 'inplay') assert.equal(resultWord(last), ENDING[ab.result], `seed ${ab.seed}`);
  }
});

test('each pitch’s why says where it went, what he was looking for, and what he did', () => {
  for (const ab of PLAYED) ab.pitches.forEach((p, i) => {
    const text = why(p, ab.pitches[i - 1], ab.batter), at = `${ab.pitcher.key} to a ${ab.batter}, seed ${ab.seed}, pitch ${p.n}: ${text}`;
    const by = Math.hypot(p.plate[0] - p.aim[0], p.plate[1] - p.aim[1]);
    // Where it went against the call comes first: called off the plate and caught the zone, or a miss over 8 inches.
    if (p.result !== 'hbp' && !p.spot.zone && p.inZone) assert.match(text, /^It was meant to be (off the plate|high|in the dirt) and caught the zone\. /, at);
    else if (p.result !== 'hbp' && Math.round(by * 12) > 8) assert.match(text, /^It missed the spot by \d+ inches, (up|down|inside|away|(up|down) and (in|away))\. /, at);
    else assert.match(text, /^He was looking for/, at);
    // Always what he was looking for, and "got it" when he guessed right.
    assert.ok(text.includes(`He was looking for the ${NAME[p.sat.code]}${p.sat.code === p.code ? ', and got it.' : '.'}`), at);
    // A foul tip is contact: a piece of it, held by the catcher, never a swing over or under it.
    if (p.result === 'tip') {
      assert.match(text, /He got a piece of it, and the catcher held on\.$/, at);
      assert.doesNotMatch(text, /He swung|beat him|out in front|late\./, at);
    }
    // Under a ball's height at the plate, it bounced: not "so many inches below the zone".
    if (bounced(p)) assert.match(text, /bounced in front of the plate/, at);
    if (bounced(p)) assert.doesNotMatch(text, /below the zone/, at);
    // He swung at it knowing what it was only when he recognised it.
    if (/swung at it anyway/.test(text)) assert.ok(p.picked && !p.inZone && p.result === 'whiff', at);
  });
});

// The decision point is where two different pitches can look alike. So the why gives the distance there only when the
// last pitch was another kind and close to it, within 8 inches: a pitch a foot off the last one's line still goes
// unrecognised 42% of the time (js/atbat-params.js, recognize), so a big distance isn't why he missed it. After the same
// kind of pitch it says nothing about lines at all.
test('the why talks about the decision point and lines only after another kind of pitch', () => {
  let close = 0, line = 0;
  for (const ab of PLAYED) ab.pitches.forEach((p, i) => {
    const prev = ab.pitches[i - 1], text = why(p, prev, ab.batter), at = `${ab.pitcher.key} to a ${ab.batter}, seed ${ab.seed}, pitch ${p.n}: ${text}`;
    assert.doesNotMatch(text, /from where the last pitch/, at);
    const looked = /At the decision point it looked like the ([a-z -]+) before it, (an inch|(\d+) inches) apart, and he didn’t recognise it in time\./.exec(text);
    if (looked) {
      close++;
      assert.ok(prev && prev.code !== p.code && looked[1] === NAME[prev.code], at);
      assert.ok(!looked[3] || Number(looked[3]) <= 8, at);
    }
    if (/different line/.test(text)) { line++; assert.ok(prev && prev.code !== p.code, at); }
    // Not recognised, and not close to a different pitch before it: just that.
    if (!p.picked && !looked) assert.ok(text.includes(`He didn’t recognise the ${NAME[p.code]} in time.`), at);
    // A single on a pitch he didn't recognise: fooled, and he still got enough of it.
    if (p.play === '1B' && p.contact <= 0.6) assert.ok(text.includes(p.picked ? 'He hit it between the fielders.' : 'He was fooled and still got enough of it.'), at);
  });
  assert.ok(close > 100 && line > 100, `${close} close at the decision point, ${line} on a different line`);
});

test('a pitch under half an inch off the zone was just off the edge, and ball four in the zone caught it', () => {
  // Misiorowski's first pitch crossed 0.04 inches past the zone's edge, and was called a strike.
  const first = replay('#ab.misiorowski.R.6cywx9.FF8.CU23.FF9.FC18.FF8').pitches[0];
  assert.ok(!first.inZone && ZONE.half - Math.abs(first.plate[0]) > -0.5 / 12, 'the pitch isn’t just off the edge');
  assert.match(why(first, null, 'R'), /It was just off the edge, but the umpire gave the pitcher the strike\./);
  // Nola's walk ended on a pitch in the zone, called a ball.
  const walk = replay('#ab.nola.R.1vegxhd.KC18.FF23.FF6.CH22.FF3');
  assert.equal(walk.result, 'BB');
  assert.ok(walk.pitches.at(-1).inZone);
  assert.match(note(walk), /^Ball four caught the edge, but the umpire called it a ball\. /);
  for (const ab of PLAYED) if (ab.result === 'BB') assert.equal(/^Ball four caught the edge/.test(note(ab)), ab.pitches.at(-1).inZone, `seed ${ab.seed}: ${note(ab)}`);
});

// An at-bat link (#ab.<pitcher>.<R|L>.<seed>.<pitch><spot>...), read by the page's own parseLink and played call by
// call. (The page stops at a call it can't throw and says why; here that call throws, and fails the test.)
function replay(link) {
  const { pitcherKey, batter, seed, calls } = parseLink(link);
  const ab = startAtBat({ pitcher: pitcherByKey(pitcherKey), batter, seed });
  for (const c of calls) if (!ab.result) throwCall(ab, c);
  return ab;
}

// What a pitch was and what happened to it, all of it, to tell whether two at-bats went exactly alike.
const played = p => [p.code, p.spot.id, p.result, p.play, ...p.plate, ...p.atDecide, p.early, p.sat.code, p.picked, p.swing, p.contact];
test('an at-bat link replays the at-bat it was made from, pitch for pitch, and so does the link at every pitch of it', () => {
  for (const ab of RANDOM) {
    const calls = ab.pitches.map(p => ({ code: p.code, spot: p.spot }));
    for (let k = 0; k <= calls.length; k++) {
      const link = linkFor({ ...ab, calls: calls.slice(0, k) }), read = parseLink(`#${link}`);
      assert.deepEqual([read.pitcherKey, read.batter, read.seed, read.rest], [ab.pitcher.key, ab.batter, ab.seed, ''], link);
      assert.deepEqual(read.calls, calls.slice(0, k), link);
      assert.deepEqual(replay(link).pitches.map(played), ab.pitches.slice(0, k).map(played), link);
    }
  }
  // The seed's whole range.
  for (const seed of [0, 2 ** 32 - 1]) assert.equal(parseLink(linkFor({ pitcher: AVERAGE, batter: 'R', seed, calls: [] })).seed, seed);
});

// A link pasted into a message can come back with a full stop, a bracket or a quote on the end (a closing quote as the
// address has it, %E2%80%9D), or cut off anywhere. What can be read is read, and what can't is never a crash.
test('a link with something stuck on the end reads the same, and one cut off reads as far as it goes', () => {
  for (const ab of RANDOM.filter((_, i) => i % 4 === 0)) {
    const calls = ab.pitches.map(p => ({ code: p.code, spot: p.spot })), link = linkFor({ ...ab, calls }), whole = parseLink(link);
    for (const end of ['.', ')', ').', ',', '!', '%E2%80%9D', '%22', '%20']) assert.deepEqual(parseLink(link + end), whole, link + end);
    // In lower case it's the same at-bat, but for the seed, which is read either way.
    assert.deepEqual(parseLink(link.toLowerCase()), whole, link.toLowerCase());
    for (let n = 0; n < link.length; n++) {
      const cut = link.slice(0, n), read = parseLink(cut);
      if (!read) continue;
      // Every call but the last read is the link's own: the last can be cut short in its spot's number.
      assert.ok(read.calls.length <= calls.length, cut);
      assert.deepEqual(read.calls.slice(0, -1), calls.slice(0, Math.max(0, read.calls.length - 1)), cut);
    }
  }
  assert.equal(parseLink('#ab.skenes.L'), null);
  assert.equal(parseLink('#ab.skenes'), null);
  assert.equal(parseLink('#sweeper'), null);
  assert.deepEqual(parseLink('#ab.skenes.L.k3x9a.FF6.S'), { pitcherKey: 'skenes', batter: 'L', seed: parseInt('k3x9a', 36), calls: [{ code: 'FF', spot: SPOTS[6] }], rest: 'S' });
  // A spot off the grid is read as no spot, for the page to say so.
  assert.deepEqual(parseLink('#ab.average.R.9.FF6.SL40').calls, [{ code: 'FF', spot: SPOTS[6] }, { code: 'SL', spot: undefined }]);
});

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

// The page throws each pitch 400 times, a slice of 100 at a time, and shows it per 100: at 100 throws a pitch's misses
// per 100 wander by about 8 either way from chart to chart, enough to put the wrong pitch on top. Paul Skenes to a
// right-handed batter, 1-2 after a four-seamer up and in, down and off the plate away: over 20,000 throws the slider is
// missed most, 30 times in 100 to the sweeper's 24.
test('four hundred throws of each put the same pitch on top whatever the seed', () => {
  const ab = startAtBat({ pitcher: pitcherByKey('skenes'), batter: 'R', seed: 12345 });
  throwCall(ab, { code: 'FF', spot: spotById('1m1') });
  ab.balls = 1; ab.strikes = 2;
  const spot = spotById('m12'), top = t => Object.keys(t).sort((a, b) => t[b].whiff - t[a].whiff)[0];
  assert.equal(top(whatIf(ab, spot, 20000, 99)), 'SL');
  const tops = [1, 2, 3, 4, 5, 6, 7, 8].map(seed => top(whatIf(ab, spot, 400, seed)));
  assert.deepEqual(tops, Array(8).fill('SL'), 'the pitch missed most in eight charts');
  // Thrown in four slices of 100, as the page does it, it comes out the same as 400 at once.
  const whole = whatIf(ab, spot, 400, 9), slices = [0, 100, 200, 300].map(from => whatIf(ab, spot, 100, 9, from));
  for (const [code, v] of Object.entries(whole)) for (const k of ['ball', 'called', 'whiff', 'foul', 'out', 'hit', 'hbp']) {
    assert.equal(slices.reduce((s, t) => s + t[code][k], 0), v[k], `${code} ${k}`);
  }
});
