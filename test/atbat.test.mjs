// The at-bat model:  node --test test/atbat.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { startAtBat, throwCall, autoAtBat, autoCall, whatIf, PITCHERS, SPOTS, spotById, spotName, spotXZ, AVERAGE, pitcherByKey, ZONE, linkFor, parseLink, VERSION } from '../js/atbat.js';
import { COUNTS, TYPES, PITCHERS as REAL, LEAGUE } from '../js/league.js';
import { readFile } from 'node:fs/promises';
import { TARGET, run, checks, SEEDS, measure, measurePitchers } from './lab.mjs';
import { PARAMS } from '../js/atbat-params.js';
import { why, note, boxAt, calledLine, bounced, NAME, resultWord, ENDING } from '../js/atbat-words.js';
import { rng } from '../js/rng.js';
import { TOTAL } from '../js/numbers.js';

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

// A line is typed in tools/league.mjs, but the speeds come from Statcast, so a refresh can move one away from what the
// line says. Every number in a line is one of his pitches' speeds, as the chips under it round it.
test('every speed a real pitcher’s line gives is one of his pitches’ speeds', () => {
  for (const p of REAL) for (const [n] of p.line.matchAll(/\d+(\.\d+)?/g)) {
    assert.ok(p.pitches.some(e => Math.round(e.mph) === Number(n)), `${p.name}: “${p.line}” gives ${n}, and his pitches are ${p.pitches.map(e => `${e.code} ${e.mph}`).join(', ')}`);
  }
});

// The zone is 2026's (js/league.js, sz): the plate's width, between the season's average top and bottom, with a ball's
// width past each edge for where the middle of a ball can cross and be a strike (Official Baseball Rules, Definitions
// of Terms, "Strike Zone" and "Strike": any part of the ball through any part of the zone). The spots in it sit in the
// middle of its thirds, and the ring's are outside it.
test('the strike zone is 2026’s, a ball’s width past every edge, and the spots are centred on it', () => {
  const ball = 1.45 / 12;
  assert.deepEqual([ZONE.half, ZONE.bottom, ZONE.top].map(v => v.toFixed(4)), [17 / 24 + ball, LEAGUE.sz.bottom - ball, LEAGUE.sz.top + ball].map(v => v.toFixed(4)));
  const third = (LEAGUE.sz.top - LEAGUE.sz.bottom) / 3, mid = (LEAGUE.sz.top + LEAGUE.sz.bottom) / 2;
  for (const spot of SPOTS) {
    const [, z] = spotXZ(spot, 'R');
    if (spot.zone) assert.ok(Math.abs(z - (mid + spot.r * third)) < 1e-9, `${spot.id} at ${z.toFixed(3)} ft`);
    else if (Math.abs(spot.r) === 2) assert.ok(z > ZONE.top || z < ZONE.bottom, `${spot.id} at ${z.toFixed(3)} ft is in the zone`);
  }
});

// A foul tip is a miss that nicks the ball into the catcher's glove: a strike in any count, strike three with two, and
// one of Statcast's whiffs, as often among them as in 2026 (js/league.js, tips).
test('a foul tip comes in any count, as often among misses as in 2026', () => {
  const ps = PLAYED.flatMap(ab => ab.pitches), tips = ps.filter(p => p.result === 'tip'), misses = ps.filter(p => p.result === 'tip' || p.result === 'whiff');
  assert.ok(tips.some(p => p.before.strikes < 2) && tips.some(p => p.before.strikes === 2), 'foul tips only in some counts');
  for (const p of tips) assert.equal(p.after.strikes, p.before.strikes + 1);
  assert.ok(Math.abs(tips.length / misses.length - LEAGUE.tips / LEAGUE.whiffs) < 0.02, `${tips.length} tips in ${misses.length} misses, against ${(LEAGUE.tips / LEAGUE.whiffs * 100).toFixed(1)}% in 2026`);
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
  [/\b(defense|recogniz\w*|center|color)\b/i, 'an American spelling: the page’s are British (recognise, centre)'],
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
    // The walk's lead counts the pitches and the chases, so the rest doesn't count them again. If he never swung, and
    // not every pitch missed the zone, that leads, and there's no tally to come.
    if (ab.result === 'BB') {
      const swung = ab.pitches.some(p => p.swing), allOut = ab.pitches.every(p => !p.inZone);
      if (!swung && !allOut) assert.match(text, /^(Ball four caught the edge, but the umpire called it a ball\. )?He never swung: (none|one|\d+) of his \d+ missed the zone\.$/, at);
      else assert.equal((text.match(/chase/g) || []).length, 1, at);
      assert.ok((text.match(/never swung/gi) || []).length <= 1, at);
    }
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
    // Fooled by the speed only when the last pitch's own why says so: he was out in front, and didn't recognise it.
    if (/timing was set for the faster one/.test(text)) assert.ok(last.early > 0.008 && !last.picked && last.sat.code === prev.code, at);
    // Weak contact: rolled over when early, wherever it was; otherwise by where it crossed (weakly, below).
    weakly(text, last, ab.batter, at);
  }
  // A four-pitch walk, every one high and inside.
  assert.equal(note(replay('#ab.v3.average.R.2.FF0.FF0.FF0.FF0')), 'All four missed the zone, and he didn’t chase any.');
  // Misiorowski's curve was meant for the dirt and hung in the zone.
  assert.match(note(replay('#ab.v3.misiorowski.R.4d.FF13.SL19.CU22')), /^The curveball was meant to be in the dirt but crossed down in the zone, and he didn’t miss it\./);
  // The README's strikeout: six pitches, ending on a curve 6 mph slower than the slider before it.
  const k = replay('#ab.v3.average.R.2gbo.FF6.SL23.CH16.FF3.SL24.CU22');
  assert.equal(k.result, 'K');
  assert.equal(k.pitches.length, 6);
  assert.equal(note(k), 'The curveball was 6\u00a0mph slower than the slider before it, and his timing was set for the faster one. 6 pitches: he swung at 4 and missed one, chasing 2 out of the zone.');
});

// Weak contact, in the note or a pitch's why: out in front, he rolled it over, wherever it was. Otherwise it's by where
// it crossed, from his side: an inside pitch got in on his hands, one away came off the end of the bat, and one over
// the middle got in on him when he was late.
function weakly(text, p, batter, at) {
  const col = boxAt(p.plate, batter).c;
  if (/rolled it over/.test(text)) assert.ok(p.early > 0.008, at);
  if (/got in on (him|his hands)/.test(text)) assert.ok(p.early <= 0.008 && col <= 0, at);
  if (/got in on him\b/.test(text)) assert.ok(p.early < -0.008 && col === 0, at);
  if (/off the end of the bat/.test(text)) assert.ok(p.early <= 0.008 && col > 0, at);
  if (/squarely/.test(text)) assert.ok(Math.abs(p.early) <= 0.008 && col === 0, at);
}
test('weak contact is said by where the pitch crossed: in on his hands inside, off the end of the bat away', () => {
  const said = {};
  for (const ab of PLAYED) ab.pitches.forEach((p, i) => {
    if (p.play !== 'out' || p.contact >= 0.3) return;
    const note_ = p === ab.pitches.at(-1) ? note(ab) : '';
    for (const [what, text] of [['note', note_], [`pitch ${p.n}`, why(p, ab.pitches[i - 1], ab.batter)]]) {
      const at = `${ab.pitcher.key} to a ${ab.batter}, seed ${ab.seed}, ${what}: ${text}`;
      weakly(text, p, ab.batter, at);
      const col = boxAt(p.plate, ab.batter).c;
      if (col < 0) assert.doesNotMatch(text, /off the end/, at);
      if (col > 0) assert.doesNotMatch(text, /got in on/, at);
      for (const w of ['rolled it over', 'got in on his hands', 'got in on him,', 'got in on him:', 'off the end', 'squarely']) if (text.includes(w)) said[w] = (said[w] || 0) + 1;
    }
  });
  // Each way of saying it comes up dozens of times, in the note and the why alike.
  for (const w of ['rolled it over', 'got in on his hands', 'off the end', 'squarely']) assert.ok(said[w] > 25, `${w}: ${said[w]}`);
  assert.ok(said['got in on him,'] > 20 && said['got in on him:'] > 20, JSON.stringify(said));
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
  // Misiorowski's first pitch crossed a few hundredths of an inch past the zone's edge, and was called a strike.
  const first = replay('#ab.v3.misiorowski.R.1b.FF8.CU23.FF9.FC18.FF8').pitches[0];
  assert.ok(!first.inZone && ZONE.half - Math.abs(first.plate[0]) > -0.5 / 12, 'the pitch isn’t just off the edge');
  assert.match(why(first, null, 'R'), /It was just off the edge, but the umpire gave the pitcher the strike\./);
  // Nola's walk ended on a pitch in the zone, called a ball.
  const walk = replay('#ab.v3.nola.R.q6.KC18.FF23.FF6.CH22.FF3');
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
      assert.deepEqual([read.version, read.pitcherKey, read.batter, read.seed, read.rest], [VERSION, ab.pitcher.key, ab.batter, ab.seed, ''], link);
      assert.deepEqual(read.calls, calls.slice(0, k), link);
      assert.deepEqual(replay(link).pitches.map(played), ab.pitches.slice(0, k).map(played), link);
    }
  }
  // The seed's whole range.
  for (const seed of [0, 2 ** 32 - 1]) assert.equal(parseLink(linkFor({ pitcher: AVERAGE, batter: 'R', seed, calls: [] })).seed, seed);
});

// Five at-bats, pitch by pitch (what happened, and where it crossed the plate), as version 3 of the hitter plays them.
// Anything that changes how a link replays fails here until VERSION in js/atbat.js goes up and these are pinned again,
// so a link made before the change opens saying it may play out differently.
const PINNED = {
  version: 3,
  links: {
    'ab.v3.average.R.2v.CH17.SI7.CH22.SI19.CH18.FF18.CH21': ['called 0.721 2.609', 'foul 0.101 3.249', 'foul 0.442 1.740', 'ball 1.143 1.316', 'foul 1.182 2.374', 'ball -0.560 1.676', 'whiff -1.030 1.241'],
    'ab.v3.skenes.L.5p.CH17.SI8.ST24.FF10.SI10': ['ball 0.596 1.388', 'foul -0.260 2.797', 'ball -1.013 0.598', 'ball 0.958 2.711', 'ball 1.888 2.759'],
    'ab.v3.miller.R.8h.SL18.FF18.FF13.FF14.SL13': ['ball -0.072 1.005', 'foul -0.077 2.641', 'foul 0.833 2.101', 'ball 1.767 2.748', 'whiff -0.006 3.300'],
    'ab.v3.waldron.L.b9.FF1.FC7.KN18.SI22.ST22': ['inplay out 0.478 3.548'],
    'ab.v3.rogers.R.e1.SI17.SL23.SI10.SL24.SI12': ['called 0.880 2.348', 'whiff 0.959 1.108', 'ball -0.946 1.308', 'ball 2.442 1.669', 'inplay out -0.476 1.618'],
  },
};
const pitchByPitch = ab => ab.pitches.map(p => `${p.result}${p.play ? ` ${p.play}` : ''} ${p.plate.map(v => v.toFixed(3)).join(' ')}`);
test('five pinned links replay as they did, until the hitter’s version goes up', () => {
  const now = Object.fromEntries(Object.keys(PINNED.links).map(link => [link, pitchByPitch(replay(link))]));
  const pinned = `\n${JSON.stringify(Object.fromEntries(Object.entries(now).map(([link, ps]) => [link.replace(/^ab\.v\d+/, `ab.v${VERSION}`), ps])), null, 1)}`;
  if (VERSION === PINNED.version) assert.deepEqual(now, PINNED.links, 'This changes how at-bat links replay: raise VERSION in js/atbat.js, then pin these links again.');
  else assert.fail(`The hitter is version ${VERSION} now: pin these links again for it, as version ${VERSION} plays them:${pinned}`);
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
  assert.deepEqual(parseLink('#ab.skenes.L.k3x9a.FF6.S'), { version: 1, pitcherKey: 'skenes', batter: 'L', seed: parseInt('k3x9a', 36), calls: [{ code: 'FF', spot: SPOTS[6] }], rest: 'S' });
  // A link carries the version of the hitter it was made against; one from before links had a version, the first.
  assert.deepEqual(parseLink('#ab.v7.skenes.L.k3x9a.FF6.S'), { ...parseLink('#ab.skenes.L.k3x9a.FF6.S'), version: 7 });
  assert.equal(parseLink('#AB.V7.skenes.L.k3x9a').version, 7);
  for (const cut of ['#ab.v7', '#ab.v7.skenes', '#ab.v7.skenes.L', '#ab.v', '#ab.v.skenes.L.k3x9a']) assert.equal(parseLink(cut), null, cut);
  // A spot off the grid is read as no spot, for the page to say so.
  assert.deepEqual(parseLink('#ab.average.R.9.FF6.SL40').calls, [{ code: 'FF', spot: SPOTS[6] }, { code: 'SL', spot: undefined }]);
  // A link made with a long run of full stops and a letter after it reads at once, rather than freezing the page that
  // opens it: dropping what's on the end takes one pass, not one for every stop.
  const t0 = Date.now(), long = parseLink(`#ab.skenes.L.k3x9a.FF6${'.'.repeat(300000)}x`), took = Date.now() - t0;
  assert.deepEqual(long.calls, [{ code: 'FF', spot: SPOTS[6] }]);
  assert.ok(took < 1000, `${took} ms to read a link with 300,000 full stops in it`);
});

test('the log says where a pitch crossed when it went to another box than the one called', () => {
  for (const ab of PLAYED) for (const p of ab.pitches) {
    const box = boxAt(p.plate, ab.batter), line = calledLine(p, ab.batter);
    assert.equal(box.zone, p.inZone, `seed ${ab.seed}, pitch ${p.n}: crossed in ${box.id}, in the zone ${p.inZone}`);
    assert.equal(line.startsWith('called '), box.id !== p.spot.id, `seed ${ab.seed}, pitch ${p.n}: ${line}`);
  }
  // Misiorowski's curve, called in the dirt, hung in the zone and went out.
  assert.equal(calledLine(replay('#ab.v3.misiorowski.R.4d.FF13.SL19.CU22').pitches[2], 'R'), 'called in the dirt, crossed down in the zone');
  // The README's strikeout: the curve to the dirt box crossed in it, so the log names the call alone.
  assert.equal(calledLine(replay('#ab.v3.average.R.2gbo.FF6.SL23.CH16.FF3.SL24.CU22').pitches[5], 'R'), 'in the dirt');
});

// The lab: at-bats with the pitcher choosing for himself, measured the way Statcast measures the league, on three seeds
// pooled (test/lab.mjs). tools/calibrate.mjs holds new knobs to the same checks, and won't write ones that miss.
const measured = run(PARAMS), lab = measured.lab, CHECKS = checks(PARAMS, measured);
const holds = group => { for (const c of CHECKS.filter(x => x.group === group)) assert.ok(c.ok, `seeds ${SEEDS.join(', ')}: ${c.said}`); };
test('over thousands of at-bats it comes out near the real league', () => holds('league'));

// The README quotes the lab's strikeouts against the league's, and the season's count of pitches: within a point of
// what they are now, and the count exactly as js/numbers.js has it, so a retune or a new season's numbers can't leave
// its words behind.
test('the README’s strikeouts are the lab’s and the league’s, and its count of pitches is the season’s', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  const [, ours, theirs] = readme.match(/strikeouts run [^(]*\((\d+)% against (\d+)%\)/) || [];
  assert.ok(ours, 'the README no longer says how strikeouts compare with the league’s');
  assert.ok(Math.abs(Number(ours) - lab.k * 100) <= 1, `the README says strikeouts come out at ${ours}%; the lab has ${(lab.k * 100).toFixed(1)}%`);
  assert.ok(Math.abs(Number(theirs) - TARGET.k * 100) <= 1, `the README says the league’s were ${theirs}%; js/league.js has ${(TARGET.k * 100).toFixed(1)}%`);
  const total = `${TOTAL.toLocaleString('en-US')} pitches`;
  assert.ok(readme.includes(total), `the README doesn’t give the season’s ${total}`);
});

// The same checks turn down knobs that don't play like the league, as tools/calibrate.mjs does before writing any: a
// hitter who swings more in every count, say.
test('the lab’s checks turn down knobs that play unlike the league', () => {
  const eager = { ...PARAMS, swingBias: Object.fromEntries(Object.entries(PARAMS.swingBias).map(([c, v]) => [c, v + 0.3])) };
  const failed = checks(eager).filter(c => !c.ok).map(c => c.what);
  assert.ok(failed.includes('swing') && failed.includes('chaseSwing'), `failed: ${failed.join(', ')}`);
});

test('in every count, hitters swing, miss, foul off and get called strikes about as often as they really did', () => holds('counts'));

test('each kind of pitch gets missed, swung at in the zone and chased about as often as it really was, and lands in the zone as often', () => holds('types'));

test('where a pitch crosses matters as it did in 2026: misses and damage over the middle, on the edges and corners, and off the plate', () => holds('zones'));

// The hitter notices patterns, so no simple plan beats a pitcher's own calls: down the middle every pitch, one pitch to
// one spot, or the same two in turn (test/lab.mjs, PLANS); and Miller's four-seamer up and slider down and away in
// turn is no surer a strikeout than his real 47.4%.
test('no simple plan beats a pitcher’s own calls', () => holds('plans'));

test('each real pitcher’s pitches get missed about as often as his really did, and he strikes out, walks and gets hit as he did', () => holds('pitchers'));

// Fouls follow the count, a knob for each (js/atbat-params.js, fairBy): less of his contact goes fair in one, and more
// of it is fouled off there, and in no other count.
test('how much contact goes foul is set count by count', () => {
  const fouls = params => measure(params, 2500, 7).counts;
  const base = fouls(PARAMS), more = fouls({ ...PARAMS, fairBy: { ...PARAMS.fairBy, '1-1': PARAMS.fairBy['1-1'] * 0.6 } });
  assert.ok(more['1-1'].foul > base['1-1'].foul + 0.1, `1-1: ${base['1-1'].foul.toFixed(3)}, then ${more['1-1'].foul.toFixed(3)}`);
  assert.ok(Math.abs(more['0-0'].foul - base['0-0'].foul) < 0.02, `0-0: ${base['0-0'].foul.toFixed(3)}, then ${more['0-0'].foul.toFixed(3)}`);
});

// The umpire's zone shifts with the count, a knob for each (js/atbat-params.js, umpBy): moved in at 0-2 rather than out,
// fewer pitches he takes there are called strikes, in the zone and out of it, and no fewer at 3-0.
test('the umpire’s zone can shift with the count', () => {
  const called = shift => measure({ ...PARAMS, umpBy: { ...PARAMS.umpBy, '0-2': PARAMS.umpBy['0-2'] + shift } }, 2500, 8).counts;
  const wide = called(-0.1), tight = called(0.1);
  for (const k of ['calledZone', 'calledOut']) assert.ok(tight['0-2'][k] < wide['0-2'][k] * 0.93, `0-2 ${k}: ${wide['0-2'][k].toFixed(3)} with his zone out, ${tight['0-2'][k].toFixed(3)} with it in`);
  assert.ok(Math.abs(tight['3-0'].calledZone - wide['3-0'].calledZone) < 0.02, `3-0: ${wide['3-0'].calledZone.toFixed(3)}, then ${tight['3-0'].calledZone.toFixed(3)}`);
});

// How each kind of pitch looks to him moves his swings at it (js/atbat-params.js, typeSwing): a changeup that looks more
// like a strike off the plate is chased more, and the other pitches no more than before.
test('each kind of pitch can be chased and taken in its own way', () => {
  const swings = params => measure(params, 5000, 9).types;
  const base = swings(PARAMS), chased = swings({ ...PARAMS, typeSwing: { ...PARAMS.typeSwing, CH: { ...PARAMS.typeSwing.CH, chase: PARAMS.typeSwing.CH.chase + 0.15 } } });
  assert.ok(chased.CH.chaseSwing > base.CH.chaseSwing + 0.05, `changeups chased ${base.CH.chaseSwing.toFixed(3)}, then ${chased.CH.chaseSwing.toFixed(3)}`);
  // (Some of it reaches his swings at changeups that caught the zone: one down and away at the corner, where a changeup
  // goes to a batter on the other side, is judged off the plate often enough. Under 4 points.)
  assert.ok(Math.abs(chased.CH.zoneSwing - base.CH.zoneSwing) < 0.04, `changeups swung at in the zone ${base.CH.zoneSwing.toFixed(3)}, then ${chased.CH.zoneSwing.toFixed(3)}`);
  assert.ok(Math.abs(chased.SI.chaseSwing - base.SI.chaseSwing) < 0.02, `sinkers chased ${base.SI.chaseSwing.toFixed(3)}, then ${chased.SI.chaseSwing.toFixed(3)}`);
});

// Where a pitch crosses moves how often he misses it and how hard he hits it (js/atbat-params.js, contact.edge and
// quality.middle): with more for the corners he misses them more against the middle, and with the middle's damage
// drawn in to half as wide, one over the middle does more harm against one off the plate. (Spread wider, it can't do
// much less: the middle's edge in damage comes from where it's read and timed as well.)
test('where a pitch crosses moves his misses and his damage', () => {
  const by = params => measure(params, 3000, 10).groups, ratio = (g, k) => g.corner[k] / g.middle[k];
  const base = by(PARAMS), edged = by({ ...PARAMS, contact: { ...PARAMS.contact, edge: PARAMS.contact.edge + 0.3 } });
  assert.ok(ratio(edged, 'whiff') > ratio(base, 'whiff') * 1.3, `corner misses against the middle's: ${ratio(base, 'whiff').toFixed(2)}, then ${ratio(edged, 'whiff').toFixed(2)}`);
  const sharp = by({ ...PARAMS, quality: { ...PARAMS.quality, middle: PARAMS.quality.middle / 2 } }), harm = g => g.middle.wobacon / g.out.wobacon;
  assert.ok(harm(sharp) > harm(base) * 1.25, `wOBA on contact over the middle against off the plate: ${harm(base).toFixed(2)}, then ${harm(sharp).toFixed(2)}`);
});

// Each throw can come in at its own speed (js/atbat-params.js, speedSpread): spread as much as the pitcher's own did in
// 2026 (sd in js/league.js), about his average.
test('a pitch’s speed can vary from throw to throw as the pitcher’s does', () => {
  for (const [key, code] of [['miller', 'FF'], ['sale', 'SL'], ['average', 'CH']]) {
    const pitcher = pitcherByKey(key), e = pitcher.pitches.find(p => p.code === code), speeds = [];
    for (let seed = 1; seed <= 600; seed++) speeds.push(throwCall(startAtBat({ pitcher, seed, params: { ...PARAMS, speedSpread: 1 } }), { code, spot: spotById('00') }).mph);
    const mean = speeds.reduce((a, v) => a + v, 0) / speeds.length, sd = Math.sqrt(speeds.reduce((a, v) => a + (v - mean) ** 2, 0) / speeds.length);
    assert.ok(Math.abs(mean - e.mph) < 0.15 && Math.abs(sd / e.sd - 1) < 0.15, `${key}'s ${code}: ${mean.toFixed(2)} ± ${sd.toFixed(2)} mph, against ${e.mph} ± ${e.sd}`);
    assert.ok(speeds.every(v => Math.abs(v - e.mph) <= 2.5 * e.sd + 1e-9), `${key}'s ${code}: a speed more than 2.5 of his spread away`);
  }
});

// The hitter who notices patterns (js/atbat-params.js, notice): after five curves in a row he's looking for the curve,
// not a fastball, and a curve that crosses where the last five did gets hit harder, than if he noticed nothing.
test('what he has seen this at-bat moves what he looks for, and how hard he hits a pitch where they have crossed', () => {
  const sixth = params => {
    let curve = 0, hard = 0, inPlay = 0;
    for (let seed = 1; seed <= 1500; seed++) {
      const ab = startAtBat({ pitcher: AVERAGE, seed, params });
      for (let i = 0; i < 5 && !ab.result; i++) { throwCall(ab, { code: 'CU', spot: spotById('m11') }); ab.balls = 0; ab.strikes = 0; ab.result = null; }
      const r = throwCall(ab, { code: 'CU', spot: spotById('m11') });
      if (r.sat.code === 'CU') curve++;
      if (r.result === 'inplay') { inPlay++; hard += r.contact; }
    }
    return { curve: curve / 1500, contact: hard / inPlay };
  };
  const off = sixth({ ...PARAMS, notice: { at: 0, next: 0, where: 0 } }), on = sixth(PARAMS);
  assert.ok(off.curve < 0.35 && on.curve > 0.7, `looking for the curve after five: ${off.curve.toFixed(2)}, then ${on.curve.toFixed(2)}`);
  assert.ok(on.contact > off.contact + 0.3, `how hard he hit the sixth: ${off.contact.toFixed(2)}, then ${on.contact.toFixed(2)}`);
  // Looking for the curve alone makes him hit it harder; where the five crossed adds to that (notice.where).
  const unready = sixth({ ...PARAMS, notice: { ...PARAMS.notice, where: 0 } });
  assert.ok(on.contact > unready.contact + 0.3, `how hard he hit the sixth, looking for it: ${unready.contact.toFixed(2)}, then ready where the five crossed ${on.contact.toFixed(2)}`);
});

// A real pitcher's stuff with two strikes (js/atbat-params.js, pitcherPutaway) moves his strikeouts toward his own.
test('a real pitcher’s stuff with two strikes moves his strikeouts', () => {
  const k = params => measurePitchers(params, 1500, 12).miller.k.sim;
  const base = k({ ...PARAMS, pitcherPutaway: { ...PARAMS.pitcherPutaway, miller: 1 } }), more = k({ ...PARAMS, pitcherPutaway: { ...PARAMS.pitcherPutaway, miller: 2 } });
  assert.ok(more > base + 0.04, `Miller's strikeouts ${base.toFixed(3)} at 1, ${more.toFixed(3)} at 2`);
});

// A real pitcher's command (js/atbat-params.js, pitcherCommand) moves his walks toward his own, and his contact factor
// (pitcherContact) his hits on balls in play; and the knuckleball's wildness (commandBy.KN) how many of Waldron's cross
// in the zone.
test('a real pitcher’s command moves his walks, his contact factor his hits, and the knuckleball’s wildness its zone', () => {
  const m = params => measurePitchers(params, 1500, 13);
  const with_ = (knob, key, v) => ({ ...PARAMS, [knob]: { ...PARAMS[knob], [key]: v } });
  const tight = m(with_('pitcherCommand', 'sale', 0.7)).sale, wild = m(with_('pitcherCommand', 'sale', 1.3)).sale;
  assert.ok(wild.bb.sim > tight.bb.sim * 1.5, `Sale's walks ${tight.bb.sim.toFixed(3)} at 0.7, ${wild.bb.sim.toFixed(3)} at 1.3`);
  const soft = m(with_('pitcherContact', 'rogers', 0.6)).rogers, hard = m(with_('pitcherContact', 'rogers', 1.4)).rogers;
  assert.ok(hard.wobacon.sim > soft.wobacon.sim * 1.5, `Rogers's wOBA on contact ${soft.wobacon.sim.toFixed(3)} at 0.6, ${hard.wobacon.sim.toFixed(3)} at 1.4`);
  const kn = params => m(params).waldron.rows.find(r => r.code === 'KN').zone;
  const steady = kn({ ...PARAMS, commandBy: { ...PARAMS.commandBy, KN: 0.6 } }), wobbly = kn({ ...PARAMS, commandBy: { ...PARAMS.commandBy, KN: 1.5 } });
  assert.ok(steady > wobbly + 0.08, `Waldron's knuckleballs in the zone ${steady.toFixed(3)} at 0.6, ${wobbly.toFixed(3)} at 1.5`);
});

// The batter's side matters as it did in 2026 (test/lab.mjs, PLATOON): on the pitcher's own side of the plate he does
// worse, on the other side better, by as much.
test('a batter on the pitcher’s side of the plate does worse, as in 2026', () => holds('platoon'));

// The calls follow the matchup (js/atbat.js, mixFor and OTHER_SIDE): each pitcher's mix to that side of the plate, and
// his pitches to the side they break to.
test('the calls follow the batter’s side: the pitcher’s mix to it, and his pitches to the side they break to', () => {
  const calls = (key, batter, n = 3000) => Array.from({ length: n }, (_, i) => autoCall(startAtBat({ pitcher: pitcherByKey(key), batter, seed: 7 + i })));
  const share = (cs, code) => cs.filter(c => c.code === code).length / cs.length;
  // The league-average righty throws a changeup three times as often to a left-handed batter; Sale his sinker to a third
  // of left-handed batters' pitches, and almost never to right-handed ones.
  const [toR, toL] = ['R', 'L'].map(b => calls('average', b));
  assert.ok(share(toL, 'CH') > 2.5 * share(toR, 'CH'), `changeups ${share(toR, 'CH').toFixed(3)} to a right-handed batter, ${share(toL, 'CH').toFixed(3)} to a left-handed one`);
  const [saleR, saleL] = ['R', 'L'].map(b => calls('sale', b));
  assert.ok(share(saleR, 'SI') < 0.02 && share(saleL, 'SI') > 0.2, `Sale's sinkers ${share(saleR, 'SI').toFixed(3)} to right-handed batters, ${share(saleL, 'SI').toFixed(3)} to left-handed ones`);
  // A sinker runs in on a batter on the pitcher's own side, and is thrown away from one on the other; a changeup goes
  // down either way to one on his side, and away from one on the other; a slider goes away from one on his side, and in
  // or away about as often to one on the other.
  const side = (cs, code) => { const of = cs.filter(c => c.code === code); return of.reduce((a, c) => a + Math.sign(c.spot.c), 0) / of.length; };
  assert.ok(side(toR, 'SI') < -0.15 && side(toL, 'SI') > 0.15, `sinkers' side (away 1, in -1): ${side(toR, 'SI').toFixed(2)} to a right-handed batter, ${side(toL, 'SI').toFixed(2)} to a left-handed one`);
  assert.ok(Math.abs(side(toR, 'CH')) < 0.15 && side(toL, 'CH') > 0.3, `changeups' side: ${side(toR, 'CH').toFixed(2)} to a right-handed batter, ${side(toL, 'CH').toFixed(2)} to a left-handed one`);
  assert.ok(side(toR, 'SL') > 0.3 && Math.abs(side(toL, 'SL')) < 0.15, `sliders' side: ${side(toR, 'SL').toFixed(2)} to a right-handed batter, ${side(toL, 'SL').toFixed(2)} to a left-handed one`);
});

// The platoon term (js/atbat-params.js, platoon) moves how a batter on the pitcher's own side of the plate does against one
// on the other: his misses, chases and damage.
test('the platoon term moves a batter on the pitcher’s side against one on the other', () => {
  const split = platoon => { const m = measure({ ...PARAMS, platoon }, 3000, 14).platoon; return m.other.woba - m.same.woba; };
  const none = split({ stuff: 0, chase: 0, damage: 0 }), more = split({ stuff: 0.15, chase: 0.08, damage: 0.08 });
  assert.ok(more > none + 0.03, `the other side's wOBA over the same side's: ${none.toFixed(3)} with no platoon term, ${more.toFixed(3)} with a big one`);
});

test('changing speeds works: a changeup after a fastball fools him more than one after a changeup', () => holds('sequence'));

// The lab measures what 2026's pitch-by-pitch numbers measure (js/league.js, LEAGUE.after): how much likelier a miss is
// right after a pitch 6 mph faster or slower than right after the same pitch. Pulling his timing toward the last pitch's
// speed (memory) makes it likelier.
test('the lab measures how much a change of speed fools him on the next pitch', () => {
  const lor = memory => measure({ ...PARAMS, memory }, 3000, 11).after.lor;
  const none = lor(0), pulled = lor(0.4);
  assert.ok(pulled > none + 0.15, `log odds ratio with no pull ${none.toFixed(3)}, with a pull of 0.4 ${pulled.toFixed(3)}`);
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

// The hundred throws face the hitter as he stands: one who has seen four curves down and away this at-bat is looking for
// a fifth there, so it's missed less and hit more than by one who has seen only the last of them.
test('the hundred throws face a hitter who remembers the whole at-bat, not just its last pitch', () => {
  const ab = startAtBat({ pitcher: pitcherByKey('misiorowski'), batter: 'R', seed: 1 });
  for (let i = 0; i < 4; i++) { throwCall(ab, { code: 'CU', spot: spotById('m11') }); ab.balls = 0; ab.strikes = 0; ab.result = null; }
  ab.balls = 1; ab.strikes = 1;
  const seen = whatIf(ab, spotById('m11'), 400, 1).CU, once = whatIf({ ...ab, pitches: ab.pitches.slice(-1) }, spotById('m11'), 400, 1).CU;
  assert.ok(seen.whiff < once.whiff && seen.hit > once.hit, `after four curves ${seen.whiff} misses and ${seen.hit} hits in 400; after one, ${once.whiff} and ${once.hit}`);
});

// The page throws each pitch 400 times, a slice of 100 at a time, and shows it per 100: at 100 throws a pitch's misses
// per 100 wander by about 8 either way from chart to chart, enough to put the wrong pitch on top. Paul Skenes to a
// left-handed batter, 1-2 after a four-seamer up and in, down and off the plate away: over 20,000 throws the changeup is
// missed most, 33 times in 100 to the slider's 22.5.
test('four hundred throws of each put the same pitch on top whatever the seed', () => {
  const ab = startAtBat({ pitcher: pitcherByKey('skenes'), batter: 'L', seed: 12345 });
  throwCall(ab, { code: 'FF', spot: spotById('1m1') });
  ab.balls = 1; ab.strikes = 2;
  const spot = spotById('m12'), top = t => Object.keys(t).sort((a, b) => t[b].whiff - t[a].whiff)[0];
  assert.equal(top(whatIf(ab, spot, 20000, 99)), 'CH');
  const tops = [1, 2, 3, 4, 5, 6, 7, 8].map(seed => top(whatIf(ab, spot, 400, seed)));
  assert.deepEqual(tops, Array(8).fill('CH'), 'the pitch missed most in eight charts');
  // Thrown in four slices of 100, as the page does it, it comes out the same as 400 at once.
  const whole = whatIf(ab, spot, 400, 9), slices = [0, 100, 200, 300].map(from => whatIf(ab, spot, 100, 9, from));
  for (const [code, v] of Object.entries(whole)) for (const k of ['ball', 'called', 'whiff', 'foul', 'out', 'hit', 'hbp']) {
    assert.equal(slices.reduce((s, t) => s + t[code][k], 0), v[k], `${code} ${k}`);
  }
});
