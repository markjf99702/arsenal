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
  // A ball challenged (js/atbat.js, challenge): overturned it's a called strike, and upheld it's still a ball.
  if (p.challenge === 'overturned') return three ? 'Strike three, on a challenge' : 'Strike, on a challenge';
  if (p.challenge === 'upheld') return four ? 'Ball four, challenged' : 'Ball, challenged';
  switch (p.result) {
    case 'ball': return four ? 'Ball four' : 'Ball';
    case 'called': return three ? 'Strike three, called' : 'Called strike';
    case 'whiff': return three ? 'Strike three, swinging' : 'Swinging strike';
    case 'tip': return three ? 'Foul tip, caught: strike three' : 'Foul tip';
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

// Where a pitch in the zone touched it, from the hitter's side, by the edge it's nearest and how far over it the ball
// was: "caught the bottom of the zone by an inch", "just caught the outside edge" (under half an inch).
export function caught(p, batter) {
  const [x, z] = p.plate, side = ZONE.half - Math.abs(x), low = z - ZONE.bottom, high = ZONE.top - z, by = Math.min(side, low, high);
  const inside = batter === 'R' ? x < 0 : x > 0;
  const edge = by === low ? 'the bottom of the zone' : by === high ? 'the top of the zone' : `the ${inside ? 'inside' : 'outside'} edge`;
  return Math.round(by * 12) < 1 ? `just caught ${edge}` : `caught ${edge} by ${inches(by)}`;
}
// A challenge, settled: "Challenged and overturned: it caught the bottom of the zone by an inch, so it's a strike.", or
// "Challenged, and the call stands: it was 2 inches below the zone."
export function challenged(p, batter) {
  return p.challenge === 'overturned' ? `Challenged and overturned: it ${caught(p, batter)}, so it’s a strike.` : `Challenged, and the call stands: it was ${missed(p, batter)}.`;
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

// When he swung, against when the pitch got there: early, more than 8 ms out in front (the ball slower than he was set
// for), late, more than 8 ms behind it, or on time ('').
export const timing = p => (p.early > 0.008 ? 'early' : p.early < -0.008 ? 'late' : '');
// Whether he judged that a pitch would miss the zone.
export const thoughtMiss = p => Math.abs(p.judged[0]) > ZONE.half || p.judged[1] < ZONE.bottom || p.judged[1] > ZONE.top;

// Weak contact, by what happened: out in front, he rolled it over, wherever it was. Otherwise by where it crossed, from
// his side: inside, it got in on his hands; away, he got the end of the bat on it; over the middle, by when he swung:
// late, it got in on him, and on time he just didn't hit it squarely.
function weak(p, batter) {
  if (timing(p) === 'early') return 'early';
  const c = boxAt(p.plate, batter).c;
  return c < 0 ? 'hands' : c > 0 ? 'end' : timing(p) === 'late' ? 'late' : 'square';
}

// A few sentences on why the pitch went the way it did: where it went against the call, what he was looking for and
// whether he recognised it, then what he did.
export function why(p, prev, batter) {
  const out = [];
  // Called off the plate and caught the zone, or missed the spot by more than 8 inches. (Hit by a pitch says it below.)
  const off = [p.plate[0] - p.aim[0], p.plate[1] - p.aim[1]], by = Math.hypot(off[0], off[1]);
  let touched = false;
  if (p.result !== 'hbp') {
    if (!p.spot.zone && p.inZone) { out.push(`It was meant to be ${ring(p.spot)} and caught the zone.`); touched = true; }
    else if (Math.round(by * 12) > 8) out.push(`It missed the spot by ${inches(by)}, ${direction(off, batter)}.`);
  }
  const same = p.sat.code === p.code;
  out.push(`He was looking for ${the(p.sat.code)}${same ? ', and got it' : ''}.`);
  if (!same) {
    const slower = prev ? Math.round(prev.mph - p.mph) : 0;
    const speed = slower >= 5 ? ` It was ${mph(slower)} slower than the last pitch.` : slower <= -5 ? ` It was ${mph(-slower)} harder than the last pitch.` : '';
    // Lines and the decision point only after a different kind of pitch, which is what can look alike. A pitch a foot off
    // the last one's line still goes unrecognised 55% of the time (js/atbat-params.js, recognize), so the distance is
    // given only when it was close, within 8 inches.
    const other = prev && prev.code !== p.code && p.tunnel != null;
    if (p.picked) out.push((other && p.tunnel > 0.5 ? 'It came out on a different line from the last pitch, and he recognised it.' : 'He recognised it anyway.') + speed);
    else if (other && Math.round(p.tunnel * 12) <= 8) out.push(`At the decision point it looked like the ${NAME[prev.code]} before it, ${inches(p.tunnel)} apart, and he didn’t recognise it in time.${speed}`);
    else out.push(`He didn’t recognise ${the(p.code)} in time.${speed}`);
  }
  if (!p.swing) {
    // A ball challenged: the call, and how the challenge went.
    const abs = p.challenge === 'overturned' ? ` The umpire called it a ball, but a challenge overturned it: it ${caught(p, batter)}.` : p.challenge === 'upheld' ? ' A challenge upheld the call.' : '';
    if (p.result === 'hbp') out.push('It got away inside.');
    else if (p.result === 'ball' && !p.inZone) out.push(`He took it: ${offBy(p, batter, 'was')}.`);
    else if (p.result === 'ball') out.push('It caught the edge, but the umpire called it a ball.');
    else if (!p.inZone) out.push(`${cap(offBy(p, batter, 'was'))}, but the umpire gave the pitcher the strike.`);
    else {
      out.push(!thoughtMiss(p) ? 'He took it, and it was a strike.' : touched ? 'He thought it would miss, and took it.' : 'He thought it would miss, and it caught the zone.');
    }
    return out.join(' ') + abs;
  }
  if (!p.inZone) out.push(`He chased: ${offBy(p, batter, 'finished')}.`);
  if (p.result === 'tip') {
    // A foul tip is contact: off the bat straight into the catcher's glove, and held (OBR, Definitions of Terms).
    out.push('He got a piece of it, and the catcher held on.');
  } else if (p.result === 'whiff') {
    const v = p.miss[1], t = p.early;
    const where = Math.abs(v) >= 0.12 ? `He swung ${inches(v)} ${v < 0 ? 'over' : 'under'} it` : Math.abs(p.miss[0]) >= 0.2 ? `He swung ${inches(p.miss[0])} ${(batter === 'R') === (p.miss[0] > 0) ? 'inside of' : 'outside of'} it` : '';
    const when = { early: `${ms(t)} out in front`, late: `${ms(t)} late` }[timing(p)] || '';
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
    // Weak contact, as in the note: early, or where it crossed.
    const weakly = s < 0.3 && {
      early: 'He was out in front and rolled it over: an easy out.', hands: 'It got in on his hands: weak contact, an easy out.',
      end: 'He got it off the end of the bat: weak contact, an easy out.', late: 'It got in on him: weak contact, an easy out.',
      square: 'He didn’t hit it squarely: weak contact, an easy out.',
    }[weak(p, batter)];
    out.push({
      HR: 'He hit it right on the barrel.', '3B': 'He hit it between the outfielders and kept running.', '2B': 'He hit it hard, between the outfielders.',
      '1B': s > 0.6 ? 'He lined it into the outfield.' : p.picked ? 'He hit it between the fielders.' : 'He was fooled and still got enough of it.',
      out: s > 0.75 ? 'He hit it hard, but right at someone.' : weakly || 'He put it in play, and they made the play.',
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

// What he did with the bat over the at-bat. A foul tip touched the bat, so the tally counts it apart from the misses.
// `count` starts with how many pitches there were, and `chase` says how many swings were out of the zone, unless the
// lead said so already.
function tally(ps, { count = true, chase = true } = {}) {
  const swings = ps.filter(p => p.swing).length, misses = ps.filter(p => p.result === 'whiff').length;
  const tipped = ps.filter(p => p.result === 'tip').length, chased = chase ? ps.filter(p => p.swing && !p.inZone).length : 0;
  let said;
  if (!swings) said = 'he never swung';
  else if (swings === 1 && ps.length > 1 && ps.at(-1).result === 'inplay') said = 'he swung only at the last one';
  else if (swings === 1) said = `he swung once${chased ? ', at a pitch out of the zone,' : ''} and ${misses ? 'missed' : tipped ? 'tipped it' : 'didn’t miss'}`;
  else {
    said = `he swung at ${swings}`;
    if (tipped) said += misses ? `, missed ${few(misses)} and tipped ${few(tipped)}` : ` and tipped ${few(tipped)}`;
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
  if (r === 'KL' && last.challenge === 'overturned') {
    lead = `Strike three on a challenge: the umpire called it ${last.before.balls === 3 ? 'ball four' : 'a ball'}, but it ${caught(last, batter)}.`;
  } else if (r === 'KL') {
    // Off the plate, strike three was the umpire's call, not the hitter's mistake.
    lead = last.inZone
      ? `Strike three caught him looking: he was waiting for ${the(last.sat.code)}${last.sat.code === last.code ? ' and still took it' : ` and got ${the(last.code)}`}.`
      : `Strike three on a pitch ${missed(last, batter)}: the umpire gave the pitcher the edge.`;
  } else if (r === 'K') {
    // Two pitches that look alike at the decision point and finish far apart: he couldn't tell them apart in time.
    const apart = prev && Math.hypot(last.plate[0] - prev.plate[0], last.plate[1] - prev.plate[1]);
    if (prev && !last.picked && last.code !== prev.code && last.tunnel != null && last.tunnel < 0.6 && apart >= Math.max(2 * last.tunnel, 8 / 12)) {
      lead = `The ${X} looked just like the ${NAME[prev.code]} before it until the decision point, ${inches(last.tunnel)} apart there, then finished ${inches(apart)} away.`;
    } else if (prev && Math.round(prev.mph - last.mph) >= 6 && last.early > 0.008 && !last.picked && last.sat.code === prev.code) {
      // A much slower pitch, when it's what beat him: he was looking for another of the faster one, and was out in front
      // of it, not knowing what it was. (If he was on time, or recognised it, the last pitch's why says so, and the speed
      // wasn't it.)
      lead = `The ${X} was ${mph(Math.round(prev.mph - last.mph))} slower than the ${NAME[prev.code]} before it, and his timing was set for the faster one.`;
    } else if (last.result === 'tip') lead = `He got only a piece of the ${X}, and the catcher held on for strike three.`;
    else if (!last.inZone) lead = `He chased the ${X} for strike three.`;
    else lead = `The ${X} beat him in the zone.`;
  } else if (r === 'BB') {
    const out = ps.filter(p => !p.inZone).length, chased = ps.filter(p => p.swing && !p.inZone).length, swung = ps.some(p => p.swing);
    // The lead has the pitches and the chases, and the rest what he did with the bat. If every pitch missed and he didn't
    // chase, he never swung: that's said. If he never swung at all, that leads, and there's nothing more to say.
    lead = !swung && out < n ? `He never swung: ${few(out)} of his ${n} missed the zone.`
      : `${out === n ? `All ${all(n)}` : `${cap(few(out))} of his ${n}`} missed the zone, and he ${chased ? `chased only ${few(chased)}` : 'didn’t chase any'}.`;
    // Ball four in the zone was the umpire's call, and that comes first. Ball four challenged, the call stood.
    if (last.inZone) lead = `Ball four caught the edge, but the umpire called it a ball. ${lead}`;
    if (last.challenge === 'upheld') lead = `Ball four was challenged, and the call stood. ${lead}`;
    rest = !swung ? '' : tally(ps, { count: false, chase: false });
  } else if (r === 'HBP') {
    const { balls, strikes } = last.before;
    lead = `The ${balls || strikes ? `${balls}-${strikes}` : 'first-pitch'} ${X}, meant to be ${spotName(last.spot)}, got away and hit him.`;
  } else if (r === 'out') {
    // Weak contact: early, or where it crossed (weak).
    if (last.contact < 0.3) {
      lead = {
        early: `He was out in front of the ${X} and rolled it over.`, hands: `The ${X} got in on his hands, and he hit it weakly.`,
        end: `He got the ${X} off the end of the bat.`, late: `The ${X} got in on him, and he hit it weakly.`, square: `He didn’t hit the ${X} squarely.`,
      }[weak(last, batter)];
    } else lead = `He got the ${X} ${spotThen(crossedAt(last, batter))} and put it in play, but a fielder got to it.`;
  } else {
    const middle = Math.abs(last.plate[0]) < 0.45 && Math.abs(last.plate[1] - MIDDLE[1]) < 0.5;
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

// ---------------------------------------------------------------- you at the plate
// What you did with a pitch in Step in (js/atbat.js, swingAt), in the same words as the hitter's: where you swung
// against where it crossed ("You swung 3 inches under it, 20 ms late."), or what you took.
export function yourWhy(p, batter) {
  if (!p.swing) {
    if (p.result === 'hbp') return 'It got away inside and hit you.';
    if (p.result === 'ball') return p.inZone ? 'You took it, and it caught the edge, but the umpire called it a ball.' : `You took it: ${offBy(p, batter, 'was')}.`;
    return p.inZone ? 'You took it, and it was a strike.' : `You took it: ${offBy(p, batter, 'was')}, but the umpire gave the pitcher the strike.`;
  }
  const out = [];
  if (!p.inZone) out.push(`You chased: ${offBy(p, batter, 'finished')}.`);
  const [h, v] = p.miss, t = p.early;
  const where = Math.abs(v) >= 0.12 ? `${inches(v)} ${v < 0 ? 'over' : 'under'} it` : Math.abs(h) >= 0.2 ? `${inches(h)} ${(batter === 'R') === (h > 0) ? 'inside of' : 'outside of'} it` : '';
  const when = { early: `${ms(t)} early`, late: `${ms(t)} late` }[timing(p)] || '';
  if (p.result === 'whiff') {
    if (where && when) out.push(`You swung ${where}, ${when}.`);
    else if (where) out.push(`You swung ${where}.`);
    else if (when) out.push(`You were ${when}.`);
    else out.push('You were on it, and it still beat you.');
  } else if (p.result === 'tip') out.push('You got a piece of it, and the catcher held on.');
  else if (p.result === 'foul') out.push(`${p.before.strikes === 2 ? 'You fouled it off to stay alive' : 'You got a piece of it'}${when ? `, ${when}` : ''}.`);
  else {
    const s = p.contact;
    out.push({
      HR: 'You hit it right on the barrel.', '3B': 'You hit it between the outfielders and kept running.', '2B': 'You hit it hard, between the outfielders.',
      '1B': s > 0.6 ? 'You lined it into the outfield.' : 'You hit it between the fielders.',
      out: s > 0.75 ? 'You hit it hard, but right at someone.' : `You put it in play${when ? `, ${when}` : ''}, and they made the play.`,
    }[p.play]);
  }
  return out.join(' ');
}

// At the end of your at-bat: how many pitches, and what you did with the bat.
export function yourNote(ab) {
  const ps = ab.pitches, swings = ps.filter(p => p.swing).length, misses = ps.filter(p => p.result === 'whiff').length;
  const chased = ps.filter(p => p.swing && !p.inZone).length, looked = ps.filter(p => !p.swing && p.result === 'called').length;
  const n = `${ps.length} pitch${ps.length === 1 ? '' : 'es'}`;
  if (!swings) return `${n}: you never swung${looked ? `, and took ${few(looked)} for ${looked === 1 ? 'a strike' : 'strikes'}` : ''}.`;
  return `${n}: you swung at ${few(swings)}${misses ? ` and missed ${misses === swings && swings > 1 ? (swings === 2 ? 'both' : 'every one') : few(misses)}` : ' and never missed'}${chased ? `, chasing ${few(chased)} out of the zone` : ''}${looked ? `, and took ${few(looked)} for ${looked === 1 ? 'a strike' : 'strikes'}` : ''}.`;
}
