// The pitches: what they're called, how they're held, how they work.
// Numbers come from js/numbers.js (Statcast); the words here were written against the 2026 numbers.
import { NUMBERS } from './numbers.js';

export const FAMILIES = [
  { id: 'fast', name: 'Fastballs' },
  { id: 'break', name: 'Breaking balls' },
  { id: 'off', name: 'Off-speed' },
  { id: 'odd', name: 'Oddities' },
];

// seam: which way the ball turns ('four' or 'two' seams per turn, 'dot' for bullet spin around a seam).
// target: where a right-hander's pitch ends up on its way to a right-handed hitter, from the catcher's
// view in feet (x to the catcher's right, z above the ground). pair: the pitch it's usually paired with.
const LIST = [
  {
    code: 'FF', slug: 'four-seam', name: 'Four-seam fastball', short: 'Four-seam', fam: 'fast',
    seam: 'four', target: [0.15, 3.05], pair: 'SL',
    line: 'The hardest pitch and the most common: almost a third of everything thrown.',
    grip: 'Index and middle fingers across the horseshoe seam, a finger’s width apart, thumb underneath on the bottom seam. Held out in the fingertips, off the palm.',
    how: 'Almost pure backspin, with four seams cutting through the air on every turn. The backspin pushes up against gravity, so the ball falls more than a foot less than it would with no spin at all. That’s the “rising” fastball: it doesn’t climb, it just doesn’t drop as far as the hitter’s eyes expect.',
  },
  {
    code: 'SI', slug: 'sinker', name: 'Sinker', aka: 'two-seamer', short: 'Sinker', fam: 'fast',
    seam: 'two', target: [-0.55, 2.0], pair: 'ST', side: -2.0,
    line: 'A fastball that sinks and runs toward the pitcher’s arm side.',
    grip: 'Index and middle fingers along the two seams where they run closest together, with a little extra pressure from the index finger. Thumb underneath.',
    how: 'The spin is tilted toward the arm side, so less of it holds the ball up. Next to a four-seamer it drops about 8 inches more and runs twice as far sideways. Hitters tend to beat it into the ground.',
    note: 'Tyler Rogers, who throws from just above the ground, threw his sinker three times out of four, at 83 mph.',
  },
  {
    code: 'FC', slug: 'cutter', name: 'Cutter', short: 'Cutter', fam: 'fast',
    seam: 'four', target: [0.45, 2.5], pair: 'CU',
    line: 'A fastball that breaks a couple of inches toward the glove side, late.',
    grip: 'A four-seam grip slid a little off centre, toward the outer half of the ball, with more pressure on the middle finger.',
    how: 'Thrown like a fastball, but the off-centre grip turns some of the spin into bullet spin and tilts the rest. So instead of running to the arm side like other fastballs, it cuts about 2 inches the other way. Against opposite-handed hitters it bores in on their hands, which is how it breaks bats.',
  },
  {
    code: 'SL', slug: 'slider', name: 'Slider', short: 'Slider', fam: 'break',
    seam: 'dot', target: [0.75, 1.75], pair: 'FF',
    line: 'Faster than a curve, with a shorter, sharper break: across and down.',
    grip: 'Held off centre on the outer half of the ball, middle finger along a seam and index finger beside it. Thumb underneath on the opposite seam.',
    how: 'Most of a slider’s spin is bullet spin, like a spiralling football, which doesn’t push the ball anywhere. Hitters sometimes pick it up as a red dot where the seams spin around the front of the ball. With little spin holding it up it drops about 20 inches more than a four-seamer and breaks a few inches to the glove side. Only the four-seamer and sinker are thrown more.',
  },
  {
    code: 'ST', slug: 'sweeper', name: 'Sweeper', short: 'Sweeper', fam: 'break',
    seam: 'two', target: [0.95, 2.0], pair: 'SI', side: -2.25,
    line: 'A slider that goes sideways: more than a foot of break across the plate.',
    grip: 'Usually a slider grip with the hand turned further onto the side of the ball, so the fingers come off its outside edge.',
    how: 'Statcast split it off from the slider in 2023. More of its spin turns into movement, and nearly all of that movement is sideways: about 14 inches toward the glove side, the most of any breaking ball. It’s at its best against same-handed hitters, sweeping away from them.',
  },
  {
    code: 'CU', slug: 'curveball', name: 'Curveball', short: 'Curve', fam: 'break',
    seam: 'four', target: [0.25, 1.45], pair: 'FF',
    line: 'The slow, looping one: topspin pulls it down on top of gravity.',
    grip: 'Middle finger along a seam, index finger resting beside it, thumb on the seam underneath. The hand comes over the top and the middle finger pulls down as the ball leaves.',
    how: 'Where a fastball has backspin, the curve has topspin, which pushes it down. Add gravity and it falls more than 4 feet on the way in, nearly 40 inches more than a four-seamer. It’s the slowest common pitch too, about 15 mph slower than a four-seamer.',
    note: 'Seth Lugo also threw 64 slow curves at 69 mph, a pitch Statcast tracks separately.',
  },
  {
    code: 'KC', slug: 'knuckle-curve', name: 'Knuckle curve', short: 'Knuckle curve', fam: 'break',
    seam: 'four', target: [0.3, 1.4], pair: 'FF',
    line: 'A curveball with the index finger tucked into the ball.',
    grip: 'The curveball grip, with the index finger bent back so its tip (or its nail) digs into the leather beside the seam.',
    how: 'The tucked finger gives the pitcher something to push against while pulling down on the ball, and many find it easier to throw hard. It averages about 2 mph faster than a regular curve, with the same 10 inches of drop from spin, and hitters miss it a little more often.',
  },
  {
    code: 'SV', slug: 'slurve', name: 'Slurve', short: 'Slurve', fam: 'break',
    seam: 'two', target: [0.6, 1.55], pair: 'SI',
    line: 'Halfway between a slider and a curveball: across and down at once.',
    grip: 'A curveball grip held a little off centre, with the hand somewhere between on top of the ball and on its side.',
    how: 'Statcast gave it its own name in 2023. Its spin sits between a curve’s topspin and a sweeper’s sidespin, so it breaks both ways: about 12 inches across and 5 down from spin alone. Only a couple of dozen pitchers throw one.',
  },
  {
    code: 'CH', slug: 'changeup', name: 'Changeup', short: 'Changeup', fam: 'off',
    seam: 'two', target: [-0.35, 1.55], pair: 'FF',
    line: 'Looks like a fastball leaving the hand, then arrives 9 mph slower and fades.',
    grip: 'The circle change: index finger and thumb touch to make an O on the side of the ball, middle and ring fingers lie on top. The ball sits further back in the hand.',
    how: 'It’s thrown with the same arm speed as a fastball, so the hitter reads fastball, but the grip takes speed and spin off. With less backspin it drops about 18 inches more than a four-seamer, and it runs toward the arm side, away from opposite-handed hitters.',
    note: 'Devin Williams’s changeup, the Airbender, ran 20.6 inches to his arm side, more than any other changeup.',
  },
  {
    code: 'FS', slug: 'splitter', name: 'Splitter', aka: 'split-finger', short: 'Splitter', fam: 'off',
    seam: 'two', target: [-0.05, 1.35], pair: 'FF',
    line: 'Fingers split wide, so it leaves the hand with little spin and dives under the bat.',
    grip: 'Index and middle fingers spread on either side of the ball, outside the seams, thumb underneath. Thrown with fastball arm speed.',
    how: 'Wedging the ball between the fingers takes spin off: about 1,370 rpm, the least of any common pitch. Without backspin to hold it up it falls almost 19 inches more than a four-seamer, and hitters miss on 34 of every 100 swings, more than any other common pitch.',
  },
  {
    code: 'FO', slug: 'forkball', name: 'Forkball', short: 'Forkball', fam: 'off',
    seam: 'two', target: [0.0, 1.35], pair: 'FF',
    line: 'A deeper splitter, with the ball jammed right back between the fingers.',
    grip: 'The ball is pushed all the way back between the index and middle fingers, spread wider than for a splitter. Thumb underneath.',
    how: 'Jamming the ball in deep kills even more spin than a splitter: under 1,000 rpm, so it tumbles more than it spins and drops about 6 inches more. Statcast called just 456 pitches forkballs in 2026, nearly all from Kodai Senga (his “ghost fork”) and Roki Sasaki. Hitters missed on 42 of every 100 swings.',
  },
  {
    code: 'KN', slug: 'knuckleball', name: 'Knuckleball', short: 'Knuckleball', fam: 'odd',
    seam: 'four', target: [0.0, 2.2], pair: 'FF',
    line: 'Thrown with almost no spin, so the air pushes it around and nobody knows where it’s going.',
    grip: 'Fingertips or nails dug into the leather just behind the seam. The ball is pushed out with a stiff wrist so it barely turns.',
    how: 'At about 350 rpm it turns only two or three times on the way to the plate. As it slowly rotates, the seams catch the air unevenly and the push keeps changing, so it wobbles and darts, differently every time. Matt Waldron was the only pitcher to throw it regularly in 2026; position players lobbed a few more in blowouts.',
  },
  {
    code: 'EP', slug: 'eephus', name: 'Eephus', short: 'Eephus', fam: 'odd',
    seam: 'four', target: [0.0, 2.9], pair: 'FF', active: 90,
    line: 'A lob: 45 mph, high in the air, dropping in on the strike zone.',
    grip: 'Whatever fastball grip the pitcher likes. What makes it an eephus is the throw: slow, and lofted high.',
    how: 'It falls about 11 feet on its way to the plate, so it has to start out going up. In 2026 it was mostly thrown by position players pitching in lopsided games, and hitters missed it on fewer than 4 of every 100 swings.',
  },
];

export const PITCHES = LIST.map(p => ({ ...p, n: NUMBERS[p.code] }));
// With no prototype, so a link like #constructor or #toString finds nothing instead of an object's built-ins.
const lookup = key => Object.assign(Object.create(null), Object.fromEntries(PITCHES.map(p => [p[key], p])));
export const BY_CODE = lookup('code');
export const BY_SLUG = lookup('slug');
