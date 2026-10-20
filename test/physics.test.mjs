// The flight model against the Statcast numbers it's built from:  node --test test/physics.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PITCHES, BY_CODE } from '../js/pitches.js';
import { throwPitch, sideCamera, PLATE_Y, G } from '../js/flight.js';
import { tilt } from '../js/spin.js';

const steady = PITCHES.filter(p => p.code !== 'KN');

test('every pitch reaches the plate where it was aimed', () => {
  for (const p of steady) {
    for (const hand of ['R', 'L']) {
      const f = throwPitch(p, { hand, rng: () => 0.5 });
      const sgn = hand === 'R' ? 1 : -1;
      assert.ok(Math.abs(f.end[1] - PLATE_Y) < 1e-6, `${p.code} ends at the front of the plate`);
      assert.ok(Math.abs(f.end[0] - p.target[0] * sgn) < 1e-6, `${p.code} ${hand} ends on its target sideways`);
      assert.ok(Math.abs(f.end[2] - p.target[1]) < 1e-6, `${p.code} ${hand} ends on its target height`);
    }
  }
});

test('the gap to the no-spin ghost is the Statcast movement', () => {
  for (const p of steady) {
    const f = throwPitch(p, { hand: 'R', rng: () => 0.5 });
    // A right-hander's arm side is the catcher's left, so arm-side movement is negative x.
    assert.ok(Math.abs((f.end[0] - f.ghostEnd[0]) * 12 + p.n.arm) < 1e-6, `${p.code} sideways`);
    assert.ok(Math.abs((f.end[2] - f.ghostEnd[2]) * 12 - p.n.rise) < 1e-6, `${p.code} up and down`);
  }
});

// The knuckleball too: its numbers leave out position players' lobs (tools/statcast.mjs), so they're one pitch's.
test('total drop, gravity included, comes out close to Statcast’s', () => {
  for (const p of PITCHES) {
    const f = throwPitch(p, { hand: 'R', rng: () => 0.5 });
    // Drop below the line the ball started out on: gravity's half g t², less the spin's lift.
    const drop = (0.5 * G * f.T * f.T - p.n.rise / 12) * 12;
    const off = Math.abs(drop - p.n.drop);
    assert.ok(off < Math.max(3, p.n.drop * 0.12), `${p.code}: model ${drop.toFixed(1)} in, Statcast ${p.n.drop} in`);
  }
});

test('flight times are what a hitter gets', () => {
  const ff = throwPitch(BY_CODE.FF, { rng: () => 0.5 }).T;
  const cu = throwPitch(BY_CODE.CU, { rng: () => 0.5 }).T;
  const ep = throwPitch(BY_CODE.EP, { rng: () => 0.5 }).T;
  assert.ok(ff > 0.37 && ff < 0.42, `four-seam ${ff}`);
  assert.ok(cu > 0.44 && cu < 0.5, `curve ${cu}`);
  assert.ok(ep > 0.8 && ep < 0.95, `eephus ${ep}`);
});

test('from the side, only a lob above the usual 7.5 feet gives up height to the readout', () => {
  // The stage on a computer, about 650 x 447 CSS pixels, at both pixel densities.
  for (const dpr of [1, 2]) {
    const W = 650 * dpr, H = 447 * dpr;
    assert.equal(Math.round(sideCamera(W, H, { dpr }).stretch * 2) / 2, 5, 'pitches at the usual height are stretched 5×');
    // The top of a lob's arc is 0.8 feet under the camera's top, and the readout's two lines end 85px down.
    const lob = sideCamera(W, H, { top: 8.7, dpr });
    const crest = lob.project([0, 30, 8.7 - 0.8]).y / dpr;
    assert.ok(crest > 85, `the top of a lob's arc is ${crest.toFixed(0)}px down, inside the readout`);
  }
});

test('a knuckleball never goes the same way twice', () => {
  let seed = 1;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const ends = Array.from({ length: 6 }, () => throwPitch(BY_CODE.KN, { rng }).end);
  const spread = Math.max(...ends.map(e => e[0])) - Math.min(...ends.map(e => e[0]));
  assert.ok(spread > 0.05, `knuckleballs ended within ${spread} ft of each other`);
});

test('tilt reads like a clock from behind the pitcher', () => {
  const minutes = t => { const [h, m] = t.split(':').map(Number); return (h % 12) * 60 + m; };
  const ff = minutes(tilt(BY_CODE.FF, 'R').text);
  assert.ok(ff >= 45 && ff <= 75, `right-handed four-seam at ${tilt(BY_CODE.FF, 'R').text}`);
  const ffL = minutes(tilt(BY_CODE.FF, 'L').text);
  assert.ok(ffL >= 645 && ffL <= 675, `left-handed four-seam at ${tilt(BY_CODE.FF, 'L').text}`);
  const cu = minutes(tilt(BY_CODE.CU, 'R').text);
  assert.ok(cu >= 7 * 60 && cu <= 7 * 60 + 45, `curve at ${tilt(BY_CODE.CU, 'R').text}`);
});

test('the offline copy lists every script and font', async () => {
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  const files = [
    ...(await readdir(new URL('../js/', import.meta.url))).filter(f => f.endsWith('.js')).map(f => `js/${f}`),
    ...(await readdir(new URL('../fonts/', import.meta.url))).filter(f => f.endsWith('.woff2')).map(f => `fonts/${f}`),
    'css/app.css', 'index.html',
  ];
  for (const f of files) assert.ok(sw.includes(`'${f}'`), `sw.js is missing ${f}`);
});
