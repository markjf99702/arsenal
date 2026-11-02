// What happened on each pitch of an at-bat, and why, in words. Everything here reads the model's own record of
// the pitch (js/atbat.js): what the hitter was looking for, whether he picked it up, where he swung and when.
import { ZONE, SPOTS, spotName } from './atbat.js';

export const NAME = { FF: 'four-seamer', SI: 'sinker', FC: 'cutter', SL: 'slider', ST: 'sweeper', CU: 'curveball', KC: 'knuckle curve', SV: 'slurve', CH: 'changeup', FS: 'splitter', FO: 'forkball', KN: 'knuckleball', EP: 'eephus' };
const the = code => `the ${NAME[code] || code}`;
// In words, inches spelled out ("in" alone reads as the word), and a no-break space so a unit never starts a line.
const inches = ft => { const n = Math.max(1, Math.round(Math.abs(ft) * 12)); return n === 1 ? 'an inch' : `${n} inches`; };
const ms = s => `${Math.round(Math.abs(s) * 1000)}\u00a0ms`;
const mph = v => `${v}\u00a0mph`;
const cap = s => s[0].toUpperCase() + s.slice(1);

export function resultWord(p) {
  const three = p.after.strikes === 3, four = p.after.balls === 4;
  switch (p.result) {
    case 'ball': return four ? 'Ball four' : 'Ball';
    case 'called': return three ? 'Strike three, called' : 'Called strike';
    case 'whiff': return three ? 'Strike three, swinging' : 'Swinging strike';
    case 'tip': return 'Foul tip, caught: strike three';
    case 'foul': return 'Foul';
    case 'hbp': return 'Hit by pitch';
    // The same words as the end card's (ENDING), so the log and the card name a ball in play alike.
    default: return ENDING[p.play];
  }
}

export const ENDING = { K: 'Strikeout swinging', KL: 'Strikeout looking', BB: 'Walk', HBP: 'Hit by pitch', out: 'Out in play', '1B': 'Single', '2B': 'Double', '3B': 'Triple', HR: 'Home run' };

// A ball's radius, in feet. A pitch whose middle is lower than that at the front of the plate has bounced.
const BALL_R = 1.45 / 12;
export const bounced = p => p.plate[1] < BALL_R;

// The box of the 5 x 5 grid a pitch crossed in, from the hitter's side: the zone in thirds, and the ring around it.
export function boxAt([x, z], batter) {
  const third = (v, lo, hi) => (v < lo ? -2 : v > hi ? 2 : Math.min(1, Math.floor((3 * (v - lo)) / (hi - lo)) - 1));
  const c = third(batter === 'R' ? x : -x, -ZONE.half, ZONE.half), r = third(z, ZONE.bottom, ZONE.top);
  return SPOTS.find(s => s.c === c && s.r === r);
}
// Where a pitch crossed, in the spots' words. The bottom row is called "in the dirt"; one that got there without
// bouncing crossed "low".
export function crossedAt(p, batter) {
  if (bounced(p)) return 'in the dirt';
  const box = boxAt(p.plate, batter);
  return box.r === -2 ? spotName(box).replace('in the dirt', 'low') : spotName(box);
}
// The spot called and, when the pitch crossed in another box, where: "called in the dirt, crossed down in the zone".
export function calledLine(p, batter) {
  const called = spotName(p.spot);
  if (boxAt(p.plate, batter).id === p.spot.id) return called;
  return `called ${called}, ${bounced(p) ? 'bounced in front of the plate' : `crossed ${crossedAt(p, batter)}`}`;
}

// Where a pitch missed the zone, from the hitter's side: "3 inches below the zone", "5 inches off the plate away".
// Under half an inch is "just off the edge", not "an inch".
export function missed(p, batter) {
  const [x, z] = p.plate;
  const parts = [], half = 0.5 / 12;
  if (z < ZONE.bottom - half) parts.push(`${inches(ZONE.bottom - z)} below the zone`);
  else if (z > ZONE.top + half) parts.push(`${inches(z - ZONE.top)} above the zone`);
  const off = Math.abs(x) - ZONE.half;
  if (off >= half) {
    const inside = batter === 'R' ? x < 0 : x > 0;
    parts.push(`${inches(off)} off the plate ${inside ? 'inside' : 'away'}`);
  }
  return parts.join(' and ') || 'just off the edge';
}

// Which way a pitch missed its spot, from the hitter's side: "up", "inside", "down and away".
function direction([dx, dz], batter) {
  const inside = batter === 'R' ? dx < 0 : dx > 0;
  const v = Math.abs(dz) >= Math.abs(dx) / 2 ? (dz > 0 ? 'up' : 'down') : '';
  const h = Math.abs(dx) >= Math.abs(dz) / 2 ? (inside ? 'in' : 'away') : '';
  return v && h ? `${v} and ${h}` : v || (inside ? 'inside' : 'away');
}
// The ring around the zone in the spots' words: off the plate on either side, high above it, in the dirt below.
const ring = spot => (Math.abs(spot.c) === 2 ? 'off the plate' : spot.r === 2 ? 'high' : 'in the dirt');
// Where it missed the zone, or that it bounced: "it was 3 inches below the zone", "it bounced in front of the plate".
const offBy = (p, batter, verb) => (bounced(p) ? 'it bounced in front of the plate' : `it ${verb} ${missed(p, batter)}`);

// A few sentences on why the pitch went the way it did: where it went against the call, what he was looking for and
// whether he recognised it, then what he did.
export function why(p, prev, batter) {
  const out = [];
  // Called off the plate and caught the zone, or missed the spot by more than 8 inches. (Hit by a pitch says it below.)
  const off = [p.plate[0] - p.aim[0], p.plate[1] - p.aim[1]], by = Math.hypot(off[0], off[1]);
  let caught = false;
  if (p.result !== 'hbp') {
    if (!p.spot.zone && p.inZone) { out.push(`It was meant to be ${ring(p.spot)} and caught the zone.`); caught = true; }
    else if (Math.round(by * 12) > 8) out.push(`It missed the spot by ${inches(by)}, ${direction(off, batter)}.`);
  }
  const same = p.sat.code === p.code;
  out.push(`He was looking for ${the(p.sat.code)}${same ? ', and got it' : ''}.`);
  if (!same) {
    const slower = prev ? Math.round(prev.mph - p.mph) : 0;
    const speed = slower >= 5 ? ` It was ${mph(slower)} slower than the last pitch.` : slower <= -5 ? ` It was ${mph(-slower)} harder than the last pitch.` : '';
    // Lines and the decision point only after a different kind of pitch, which is what can look alike. A pitch a foot off
    // the last one's line still goes unrecognised 42% of the time (js/atbat-params.js, recognize), so the distance is
    // given only when it was close, within 8 inches.
    const other = prev && prev.code !== p.code && p.tunnel != null;
    if (p.picked) out.push((other && p.tunnel > 0.5 ? 'It came out on a different line from the last pitch, and he recognised it.' : 'He recognised it anyway.') + speed);
    else if (other && Math.round(p.tunnel * 12) <= 8) out.push(`At the decision point it looked like the ${NAME[prev.code]} before it, ${inches(p.tunnel)} apart, and he didn’t recognise it in time.${speed}`);
    else out.push(`He didn’t recognise ${the(p.code)} in time.${speed}`);
  }
  if (!p.swing) {
    if (p.result === 'hbp') out.push('It got away inside.');
    else if (p.result === 'ball' && !p.inZone) out.push(`He took it: ${offBy(p, batter, 'was')}.`);
    else if (p.result === 'ball') out.push('It caught the edge, but the umpire called it a ball.');
    else if (!p.inZone) out.push(`${cap(offBy(p, batter, 'was'))}, but the umpire gave the pitcher the strike.`);
    else {
      const thoughtBall = Math.abs(p.judged[0]) > ZONE.half || p.judged[1] < ZONE.bottom || p.judged[1] > ZONE.top;
      out.push(!thoughtBall ? 'He took it, and it was a strike.' : caught ? 'He thought it would miss, and took it.' : 'He thought it would miss, and it caught the zone.');
    }
    return out.join(' ');
  }
  if (!p.inZone) out.push(`He chased: ${offBy(p, batter, 'finished')}.`);
  if (p.result === 'tip') {
    // A foul tip is contact: off the bat straight into the catcher's glove, and held (OBR, Definitions of Terms).
    out.push('He got a piece of it, and the catcher held on.');
  } else if (p.result === 'whiff') {
    const v = p.miss[1], t = p.early;
    const where = Math.abs(v) >= 0.12 ? `He swung ${inches(v)} ${v < 0 ? 'over' : 'under'} it` : Math.abs(p.miss[0]) >= 0.2 ? `He swung ${inches(p.miss[0])} ${(batter === 'R') === (p.miss[0] > 0) ? 'inside of' : 'outside of'} it` : '';
    const when = t > 0.008 ? `${ms(t)} out in front` : t < -0.008 ? `${ms(t)} late` : '';
    if (where && when) out.push(`${where}, ${when}.`);
    else if (where) out.push(`${where}.`);
    else if (when) out.push(`He was ${when}.`);
    // Nothing wrong with his swing: out of the zone he knew what it was and went after it anyway; in it, it beat him.
    else if (!p.inZone && p.picked) out.push(`He saw ${the(p.code)} and swung at it anyway.`);
    else out.push('He was on it, and it still beat him.');
  } else if (p.result === 'foul') {
    out.push(p.before.strikes === 2 ? 'He fouled it off to stay alive.' : 'He got a piece of it.');
  } else if (p.result === 'inplay') {
    const s = p.contact;
    // Weak contact by when he swung, as in the note: early, late or on time.
    const weak = p.early > 0.008 ? 'He was out in front and rolled it over: an easy out.' : p.early < -0.008 ? 'It got in on him: weak contact, an easy out.' : 'He got it off the end of the bat: weak contact, an easy out.';
    out.push({
      HR: 'He hit it right on the barrel.', '3B': 'He hit it between the outfielders and kept running.', '2B': 'He hit it hard, between the outfielders.',
      '1B': s > 0.6 ? 'He lined it into the outfield.' : p.picked ? 'He hit it between the fielders.' : 'He was fooled and still got enough of it.',
      out: s > 0.75 ? 'He hit it hard, but right at someone.' : s < 0.3 ? weak : 'He put it in play, and they made the play.',
    }[p.play]);
  }
  return out.join(' ');
}

// Counts in the note: none and one in words, more as digits ("he swung once and missed", "he swung at 3 and missed 2");
// "all four" in words.
const WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const few = n => (n <= 1 ? WORDS[n] : String(n));
const all = n => WORDS[n] ?? String(n);
// A spot's name inside a sentence: one with a comma of its own ("in, at the belt") gets one after it too.
const spotThen = name => (name.includes(',') ? `${name},` : name);
const MIDDLE = [0, (ZONE.top + ZONE.bottom) / 2];
const fromMiddle = ([x, z]) => Math.hypot(x - MIDDLE[0], z - MIDDLE[1]);

// What he did with the bat over the at-bat. A foul tip is contact, so it isn't counted as a miss. `count` starts with
// how many pitches there were, and `chase` says how many swings were out of the zone, unless the lead said so already.
function tally(ps, { count = true, chase = true } = {}) {
  const swings = ps.filter(p => p.swing).length, misses = ps.filter(p => p.result === 'whiff').length;
  const tipped = ps.some(p => p.result === 'tip'), chased = chase ? ps.filter(p => p.swing && !p.inZone).length : 0;
  let said;
  if (!swings) said = 'he never swung';
  else if (swings === 1 && ps.length > 1 && ps.at(-1).result === 'inplay') said = 'he swung only at the last one';
  else if (swings === 1) said = `he swung once${chased ? ', at a pitch out of the zone,' : ''} and ${misses ? 'missed' : tipped ? 'tipped it' : 'didn’t miss'}`;
  else {
    said = `he swung at ${swings}`;
    if (tipped) said += misses ? `, missed ${few(misses)} and tipped one` : ' and tipped one';
    else said += !misses ? ' and never missed' : misses < swings ? ` and missed ${few(misses)}` : swings === 2 ? ' and missed both' : ' and missed every one';
    if (chased) said += chased === swings ? ', each at a pitch out of the zone' : `, chasing ${few(chased)} out of the zone`;
  }
  return count ? `${ps.length} pitches: ${said}.` : `${cap(said)}.`;
}

// The scout's note at the end: the pitch or pattern that decided it, then what he did with the bat.
export function note(ab) {
  const ps = ab.pitches, last = ps.at(-1), prev = ps.at(-2), n = ps.length, r = ab.result, batter = ab.batter;
  if (!last) return '';
  const X = NAME[last.code];
  let lead = '', rest = tally(ps);
  if (r === 'KL') {
    // Off the plate, strike three was the umpire's call, not the hitter's mistake.
    lead = last.inZone
      ? `Strike three caught him looking: he was waiting for ${the(last.sat.code)}${last.sat.code === last.code ? ' and still took it' : ` and got ${the(last.code)}`}.`
      : `Strike three on a pitch ${missed(last, batter)}: the umpire gave the pitcher the edge.`;
  } else if (r === 'K') {
    // Two pitches that look alike at the decision point and finish far apart: he couldn't tell them apart in time.
    const apart = prev && Math.hypot(last.plate[0] - prev.plate[0], last.plate[1] - prev.plate[1]);
    if (prev && !last.picked && last.code !== prev.code && last.tunnel != null && last.tunnel < 0.6 && apart >= Math.max(2 * last.tunnel, 8 / 12)) {
      lead = `The ${X} looked just like the ${NAME[prev.code]} before it until the decision point, ${inches(last.tunnel)} apart there, then finished ${inches(apart)} away.`;
    // A much slower pitch, when it's what beat him: he was out in front of it, not knowing what it was. (If he was on
    // time, or recognised it, the last pitch's why says so, and the speed wasn't it.)
    } else if (prev && Math.round(prev.mph - last.mph) >= 6 && last.early > 0.008 && !last.picked) lead = `The ${X} was ${mph(Math.round(prev.mph - last.mph))} slower than the ${NAME[prev.code]} before it, and his timing was set for the faster one.`;
    else if (last.result === 'tip') lead = `He got only a piece of the ${X}, and the catcher held on for strike three.`;
    else if (!last.inZone) lead = `He chased the ${X} for strike three.`;
    else lead = `The ${X} beat him in the zone.`;
  } else if (r === 'BB') {
    const out = ps.filter(p => !p.inZone).length, chased = ps.filter(p => p.swing && !p.inZone).length;
    lead = `${out === n ? `All ${all(n)}` : `${cap(few(out))} of his ${n}`} missed the zone, and he ${chased ? `chased only ${few(chased)}` : 'didn’t chase any'}.`;
    // Ball four in the zone was the umpire's call, and that comes first.
    if (last.inZone) lead = `Ball four caught the edge, but the umpire called it a ball. ${lead}`;
    // The lead has the pitches and the chases. If every pitch missed and he didn't chase, he never swung: it's said.
    rest = out === n && !chased ? '' : tally(ps, { count: false, chase: false });
  } else if (r === 'HBP') {
    const { balls, strikes } = last.before;
    lead = `The ${balls || strikes ? `${balls}-${strikes}` : 'first-pitch'} ${X}, meant to be ${spotName(last.spot)}, got away and hit him.`;
  } else if (r === 'out') {
    // Weak contact by when he swung: early, he rolled it over; late, it got in on him; on time, off the end of the bat.
    if (last.contact < 0.3) {
      lead = last.early > 0.008 ? `He was out in front of the ${X} and rolled it over.` : last.early < -0.008 ? `The ${X} got in on him, and he hit it weakly.` : `He got the ${X} off the end of the bat.`;
    } else lead = `He got the ${X} ${spotThen(crossedAt(last, batter))} and put it in play, but the defense was there.`;
  } else {
    const middle = Math.abs(last.plate[0]) < 0.45 && last.plate[1] > 2.0 && last.plate[1] < 3.0;
    const off = Math.hypot(last.plate[0] - last.aim[0], last.plate[1] - last.aim[1]);
    // A hit on a pitch that missed its spot toward the middle: the miss is the story.
    if (Math.round(off * 12) > 9 && fromMiddle(last.plate) < fromMiddle(last.aim) && boxAt(last.plate, batter).id !== last.spot.id) {
      lead = `The ${X} was meant to be ${spotThen(spotName(last.spot))} but crossed ${crossedAt(last, batter)}, and he didn’t miss it.`;
    } else if (last.sat.code === last.code) lead = `He was looking for the ${X}${middle ? ' and got it over the middle' : ' and got it'}.`;
    else if (middle) lead = `The ${X} caught too much of the plate.`;
    else if (r === 'HR') lead = `He wasn’t looking for the ${X}, and still hit it out.`;
    else if (r === '1B') lead = `He stayed with the ${X} and found a way to hit it.`;
    else lead = `He wasn’t looking for the ${X}, and still drove it.`;
  }
  // One pitch: the lead says it all.
  if (n === 1) rest = r === 'HBP' ? '' : 'He swung at the first pitch.';
  return `${lead} ${rest}`.trim();
}
