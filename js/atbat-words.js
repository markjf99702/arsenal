// What happened on each pitch of an at-bat, and why, in words. Everything here reads the model's own record of
// the pitch (js/atbat.js): what the hitter was looking for, whether he picked it up, where he swung and when.
import { ZONE } from './atbat.js';

export const NAME = { FF: 'four-seamer', SI: 'sinker', FC: 'cutter', SL: 'slider', ST: 'sweeper', CU: 'curveball', KC: 'knuckle curve', SV: 'slurve', CH: 'changeup', FS: 'splitter', FO: 'forkball', KN: 'knuckleball', EP: 'eephus' };
const the = code => `the ${NAME[code] || code}`;
const inches = ft => `${Math.max(1, Math.round(Math.abs(ft) * 12))} in`;
const ms = s => `${Math.round(Math.abs(s) * 1000)} ms`;

export function resultWord(p) {
  const three = p.after.strikes === 3, four = p.after.balls === 4;
  switch (p.result) {
    case 'ball': return four ? 'Ball four' : 'Ball';
    case 'called': return three ? 'Strike three, called' : 'Called strike';
    case 'whiff': return three ? 'Strike three, swinging' : 'Swinging strike';
    case 'tip': return 'Foul tip, caught: strike three';
    case 'foul': return 'Foul';
    case 'hbp': return 'Hit by pitch';
    default: return { out: 'In play, out', '1B': 'Single', '2B': 'Double', '3B': 'Triple', HR: 'Home run' }[p.play];
  }
}

export const ENDING = { K: 'Strikeout swinging', KL: 'Strikeout looking', BB: 'Walk', HBP: 'Hit by pitch', out: 'Out in play', '1B': 'Single', '2B': 'Double', '3B': 'Triple', HR: 'Home run' };

// Where a pitch missed the zone, from the hitter's side: "3 in below the zone", "5 in off the plate away".
export function missed(p, batter) {
  const [x, z] = p.plate;
  const parts = [];
  if (z < ZONE.bottom) parts.push(`${inches(ZONE.bottom - z)} below the zone`);
  else if (z > ZONE.top) parts.push(`${inches(z - ZONE.top)} above the zone`);
  const off = Math.abs(x) - ZONE.half;
  if (off > 0) {
    const inside = batter === 'R' ? x < 0 : x > 0;
    parts.push(`${inches(off)} off the plate ${inside ? 'inside' : 'away'}`);
  }
  return parts.join(' and ') || 'just off the edge';
}

// One or two sentences on why the pitch went the way it did.
export function why(p, prev, batter) {
  const out = [];
  const same = p.sat.code === p.code;
  out.push(same ? `He was sitting on ${the(p.code)}.` : `He was looking for ${the(p.sat.code)}.`);
  if (!same) {
    const slower = prev ? Math.round(prev.mph - p.mph) : 0;
    const speed = slower >= 5 ? ` It was ${slower} mph slower than the last pitch.` : slower <= -5 ? ` It was ${-slower} mph harder than the last pitch.` : '';
    if (p.picked) out.push((p.tunnel != null && p.tunnel > 0.5 ? 'It came out on a different line from the last pitch, and he picked it up.' : 'He picked it up anyway.') + speed);
    else if (p.tunnel != null) out.push(`At the decision point it was ${inches(p.tunnel)} from where the last pitch had been, and he didn't pick it up.${speed}`);
    else out.push(`He didn't pick it up in time.${speed}`);
  }
  if (!p.swing) {
    if (p.result === 'hbp') out.push('It got away inside.');
    else if (p.result === 'ball' && !p.inZone) out.push(`He laid off: it missed ${missed(p, batter)}.`);
    else if (p.result === 'ball') out.push('It caught the edge, but the umpire called it a ball.');
    else if (!p.inZone) out.push(`It missed ${missed(p, batter)}, but the umpire gave the pitcher the strike.`);
    else {
      const thoughtBall = Math.abs(p.judged[0]) > ZONE.half || p.judged[1] < ZONE.bottom || p.judged[1] > ZONE.top;
      out.push(thoughtBall ? 'He thought it would miss, and it caught the zone.' : 'He took it, and it was a strike.');
    }
    return out.join(' ');
  }
  if (!p.inZone) out.push(`He chased: it finished ${missed(p, batter)}.`);
  if (p.result === 'whiff' || p.result === 'tip') {
    const v = p.miss[1], t = p.early;
    const where = Math.abs(v) >= 0.12 ? `He swung ${inches(v)} ${v < 0 ? 'over' : 'under'} it` : Math.abs(p.miss[0]) >= 0.2 ? `He swung ${inches(p.miss[0])} ${(batter === 'R') === (p.miss[0] > 0) ? 'inside of' : 'outside of'} it` : '';
    const when = t > 0.008 ? `${ms(t)} out in front` : t < -0.008 ? `${ms(t)} late` : '';
    if (where && when) out.push(`${where}, ${when}.`);
    else if (where) out.push(`${where}.`);
    else if (when) out.push(`He was ${when}.`);
    else out.push('He was on it, and it still beat him.');
  } else if (p.result === 'foul') {
    out.push(p.before.strikes === 2 ? 'He fought it off to stay alive.' : 'He got a piece of it.');
  } else if (p.result === 'inplay') {
    const s = p.contact;
    out.push({
      HR: 'He squared it up.', '3B': 'He hit it into the gap and kept running.', '2B': 'He hit it hard, into the gap.',
      '1B': s > 0.6 ? 'He lined it into the outfield.' : 'He found a hole.',
      out: s > 0.75 ? 'He hit it hard, but right at someone.' : s < 0.3 ? 'He got it off the end of the bat: weak contact, an easy out.' : 'He put it in play, and they made the play.',
    }[p.play]);
  }
  return out.join(' ');
}

// The scout's note at the end: the pitch or pattern that decided it.
export function note(ab) {
  const ps = ab.pitches, last = ps.at(-1), prev = ps.at(-2);
  const n = ps.length;
  const swings = ps.filter(p => p.swing).length, misses = ps.filter(p => p.result === 'whiff' || p.result === 'tip').length;
  const chased = ps.filter(p => p.swing && !p.inZone).length;
  const tally = `${n} pitch${n === 1 ? '' : 'es'}: he swung at ${swings} and missed ${misses}${chased ? `, chasing ${chased} out of the zone` : ''}.`;
  let lead = '';
  const r = ab.result;
  if ((r === 'K' || r === 'KL') && last) {
    if (r === 'KL') lead = `Strike three caught him looking: he was waiting for ${the(last.sat.code)}${last.sat.code === last.code ? ' and still took it' : ` and got ${the(last.code)}`}.`;
    else if (prev && !last.picked && last.code !== prev.code && last.tunnel != null && last.tunnel < 0.6) {
      const apart = Math.hypot(last.plate[0] - prev.plate[0], last.plate[1] - prev.plate[1]);
      lead = `The ${NAME[last.code]} came out of the same tunnel as the ${NAME[prev.code]} before it, ${inches(last.tunnel)} apart at the decision point, and finished ${inches(apart)} away from it.`;
    } else if (prev && Math.round(prev.mph - last.mph) >= 6) lead = `The ${NAME[last.code]} was ${Math.round(prev.mph - last.mph)} mph slower than the ${NAME[prev.code]} before it, and his timing was set for the faster one.`;
    else if (!last.inZone) lead = `He chased the ${NAME[last.code]} for strike three.`;
    else lead = `The ${NAME[last.code]} beat him in the zone.`;
  } else if (r === 'BB') {
    const out = ps.filter(p => !p.inZone).length;
    lead = `${out} of the ${n} pitches missed the zone, and he only chased ${chased}.`;
  } else if (r === 'HBP') lead = 'One got away inside.';
  else if (last) {
    const middle = Math.abs(last.plate[0]) < 0.45 && last.plate[1] > 2.0 && last.plate[1] < 3.0;
    if (r === 'out') lead = last.contact < 0.3 ? `He was off balance on the ${NAME[last.code]} and rolled it over.` : `He put the ${NAME[last.code]} in play, and the defense was there.`;
    else if (last.sat.code === last.code) lead = `He was sitting on the ${NAME[last.code]}${middle ? ' and got it over the middle' : ' and got it'}.`;
    else if (middle) lead = `The ${NAME[last.code]} caught too much of the plate.`;
    else lead = `He stayed with the ${NAME[last.code]} and found a way to hit it.`;
  }
  return `${lead} ${tally}`.trim();
}
