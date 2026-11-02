// The flight model against the Statcast numbers it's built from:  node --test test/physics.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PITCHES, BY_CODE } from '../js/pitches.js';
import { throwPitch, sideCamera, catcherCamera, topCamera, palette, drawZone, drawSideField, drawTopField, PLATE_Y, G } from '../js/flight.js';
import { Stage } from '../js/stage.js';
import { tilt } from '../js/spin.js';
import { atBatCamera, markRadius, GROUND, HIGH_RELEASE, drawMarks, growth, GROW, MARK, SHAPE } from '../js/tracker.js';

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

// Where each pitch is thrown comes from Statcast too (tools/statcast.mjs): where a right-hander's pitch of that kind
// crossed the plate on average to right-handed batters. None is typed into js/pitches.js.
test('every pitch is aimed where Statcast’s crossed the plate', async () => {
  for (const p of PITCHES) assert.deepEqual(p.target, p.n.aim, `${p.code} is aimed at ${p.target}, Statcast's crossed at ${p.n.aim}`);
  assert.doesNotMatch(await readFile(new URL('../js/pitches.js', import.meta.url), 'utf8'), /target: \[/, 'an aim typed into js/pitches.js');
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

test('the at-bat view marks a pitch that crosses at the ground and shows the highest release, on every screen', () => {
  // Its canvas in CSS pixels: a phone before and after the shorter frame, the narrowest phone, a computer, a tablet.
  for (const [w, h] of [[358, 322], [358, 235], [288, 189], [650, 447], [736, 506]]) {
    for (const dpr of [1, 2]) {
      const W = w * dpr, H = h * dpr, cam = atBatCamera(W, H, { dpr });
      const at = `${W}x${H}`;
      const ground = cam.project(GROUND).y + markRadius(cam);
      assert.ok(ground <= H, `${at}: a pitch at the ground is marked down to ${ground.toFixed(0)}, past the bottom edge`);
      for (const x of [-3, 0, 3]) {
        const hand = cam.project([x, HIGH_RELEASE[1], HIGH_RELEASE[2]]).y;
        assert.ok(hand >= H * 0.04, `${at}: a 7-foot release is ${hand.toFixed(0)}px from the top`);
      }
    }
  }
  // A squarer canvas fits by tilting alone, at the explorer's zoom; a wide one pulls back only as far as it has to.
  assert.equal(atBatCamera(716, 716, { dpr: 2 }).F, catcherCamera(716, 716).F);
  const wide = atBatCamera(1300, 894, { dpr: 2 }).F / catcherCamera(1300, 894).F;
  assert.ok(wide > 0.78 && wide < 0.86, `the computer's at-bat view is ${wide.toFixed(2)} of the explorer's`);
});

// A stand-in for a canvas's 2D context that records what's filled or stroked: each circle (where, how big), or a line,
// in what colour and how wide. Anything else it's asked to do, it does nothing.
function recorder() {
  const drawn = [], nothing = { addColorStop() {}, width: 0 };
  let path = [];
  const ctx = new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'beginPath') return () => { path = []; };
      if (k === 'arc') return (x, y, r) => path.push({ x, y, r });
      // A square with rounded corners, by its middle and half its width (r, as for a circle).
      if (k === 'roundRect') return (x, y, w, h) => path.push({ x: x + w / 2, y: y + h / 2, r: w / 2, square: true });
      if (k === 'fillText') return (text, x, y) => drawn.push({ op: 'text', text, x, y, color: t.fillStyle });
      if (k === 'fill' || k === 'stroke' || k === 'strokeRect') {
        return () => {
          const was = { op: k, color: k === 'fill' ? t.fillStyle : t.strokeStyle, width: t.lineWidth };
          if (k === 'strokeRect' || !path.some(a => a.r)) drawn.push(was);
          else for (const a of path) drawn.push({ ...a, ...was });
        };
      }
      return () => nothing;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return { ctx, drawn };
}

// The scenery's lines and the paths are as thick, in CSS pixels, on a phone with two device pixels to each CSS pixel
// as on a computer with one, and on a computer with two: a phone's picture, 358 x 235 CSS pixels, and a computer's,
// 650 x 447. On a phone they were half as thick.
const SCREENS = [['phone', 358, 235, 2], ['computer', 650, 447, 1], ['computer at 2x', 650, 447, 2]];
const css = (drawn, pick) => { const d = drawn.find(pick); return d && +(d.width / d.dpr).toFixed(2); };
test('the strike zone, the side view’s zone and the chalk from above are as thick on a phone as on a computer', () => {
  const widths = SCREENS.map(([, w, h, dpr]) => {
    const out = {};
    for (const [kind, make, draw, pick] of [
      ['zone', () => catcherCamera(w * dpr, h * dpr), (ctx, cam) => drawZone(ctx, cam, palette(false)), d => d.op === 'stroke'],
      ['side', () => sideCamera(w * dpr, h * dpr, { dpr }), (ctx, cam) => drawSideField(ctx, cam, palette(false)), d => d.op === 'strokeRect'],
      ['above', () => topCamera(w * dpr, h * dpr), (ctx, cam) => drawTopField(ctx, cam, palette(false)), d => d.op === 'strokeRect'],
    ]) {
      const cam = make(), { ctx, drawn } = recorder();
      cam.dpr = dpr;
      draw(ctx, cam);
      out[kind] = css(drawn.map(d => ({ ...d, dpr })), pick);
    }
    return out;
  });
  for (const [i, [name]] of SCREENS.entries()) assert.ok(widths[i].zone >= 1 && widths[i].side >= 1.5 && widths[i].above >= 1.5, `${name}: ${JSON.stringify(widths[i])} CSS px`);
  assert.deepEqual(widths[2], widths[1], 'a computer at 2x draws them at another width');
  assert.deepEqual(widths[0].side, widths[1].side, 'the side view’s zone on a phone and a computer');
});

test('the paths, the ghost and the decision ring are as thick on a phone as on a computer', () => {
  const widths = SCREENS.map(([, w, h, dpr]) => {
    // The page's stage on a canvas of that size, with nothing to watch it resize or animate it, drawn once the pitch is in.
    const { ctx, drawn } = recorder();
    Object.assign(globalThis, {
      window: { devicePixelRatio: dpr }, matchMedia: () => ({ matches: false }), ResizeObserver: class { observe() {} },
      requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
      document: { createElement: () => ({ getContext: () => recorder().ctx }) },
    });
    const stage = new Stage({ width: 0, height: 0, getContext: () => ctx, getBoundingClientRect: () => ({ width: w, height: h, left: 0, top: 0 }) });
    stage.set({ view: 'catcher', color: '#ffd23f', ghost: true });
    stage.throw(BY_CODE.SL);
    stage.clock = 5;
    drawn.length = 0;
    stage.draw();
    const lines = drawn.filter(d => d.op === 'stroke').map(d => ({ ...d, dpr }));
    return { path: css(lines, d => d.color === '#ffd23f' && !d.r), ring: css(lines, d => d.color === '#ffd23f' && d.r), ghost: css(lines, d => d.color === palette(false).ghost && !d.r) };
  });
  for (const [i, [name]] of SCREENS.entries()) assert.ok(widths[i].path >= 1.8 && widths[i].ring >= 1.5 && widths[i].ghost >= 1.35, `${name}: ${JSON.stringify(widths[i])} CSS px`);
  assert.deepEqual(widths[0], widths[1], 'a phone and a computer draw them at different widths');
});

test('the newest mark grows in as it lands, settling to its size, and the others stay as they are', () => {
  assert.equal(growth(0), 1.5);
  assert.equal(growth(GROW), 1);
  assert.equal(growth(Infinity), 1);
  for (let t = 0; t < GROW; t += 0.01) assert.ok(growth(t + 0.01) < growth(t), `it grows again at ${t.toFixed(2)} s`);
  assert.ok(GROW >= 0.15 && GROW <= 0.25, `it takes ${GROW} s`);
  const cam = atBatCamera(716, 470, { dpr: 2 }), r = markRadius(cam);
  const marks = [{ x: -0.5, z: 3, n: 1, kind: 'strike' }, { x: 0.5, z: 2, n: 2, kind: 'ball' }];
  for (const [grow, want] of [[undefined, [1, 1]], [growth(0), [1, 1.5]], [growth(GROW / 2), [1, growth(GROW / 2)]]]) {
    const { ctx, drawn } = recorder();
    drawMarks(ctx, cam, marks, { grow });
    const discs = drawn.filter(d => d.op === 'fill');
    assert.deepEqual(discs.map(d => +(d.r / r).toFixed(3)), want.map(v => +v.toFixed(3)), `drawn at ${grow ?? 1}× for the newest`);
    // Each where it crossed, the newest too.
    discs.forEach((d, i) => { const p = cam.project([marks[i].x, 17 / 12, marks[i].z]); assert.ok(Math.hypot(d.x - p.x, d.y - p.y) < 1e-9, `mark ${i + 1} moved`); });
  }
});

test('a mark mostly covered by a later one keeps a ring of its colour showing round it', () => {
  const cam = atBatCamera(716, 470, { dpr: 2 }), r = markRadius(cam);
  const at = m => cam.project([m.x, 17 / 12, m.z]);
  // Three pitches up and in, the second and third within a mark's width of the first, the third on the second; and one
  // well clear of them, low and away.
  const marks = [
    { x: -0.5, z: 3, n: 1, kind: 'strike' }, { x: -0.48, z: 3.02, n: 2, kind: 'ball' }, { x: -0.49, z: 2.99, n: 3, kind: 'play' },
    { x: 0.6, z: 1.8, n: 4, kind: 'ball' },
  ];
  const { ctx, drawn } = recorder();
  drawMarks(ctx, cam, marks);
  const rings = drawn.filter(d => d.op === 'stroke' && d.r > r * 1.2 && d.color !== '#fff');
  const near = (d, m) => Math.hypot(d.x - at(m).x, d.y - at(m).y) < 1e-9;
  assert.deepEqual(rings.map(d => [marks.findIndex(m => near(d, m)) + 1, d.color]), [[1, MARK.strike], [2, MARK.ball]], 'the rings round covered marks');
  assert.ok(rings[0].r - rings[1].r > rings[1].width, `the first one's ring, ${rings[0].r.toFixed(1)}px out, is hidden under the second's`);
  // Every mark, the newest too, is where its pitch crossed, and none of them is bigger for it.
  const discs = drawn.filter(d => d.op === 'fill');
  assert.equal(discs.length, 4);
  discs.forEach((d, i) => assert.ok(near(d, marks[i]) && Math.abs(d.r - (d.square ? r * 0.9 : r)) < 1e-9, `mark ${i + 1} moved or changed size`));
  // Marks that only touch, more than a mark's width apart, are left alone.
  const apart = recorder();
  drawMarks(apart.ctx, cam, [marks[0], { ...marks[1], x: -0.5 + (1.05 * r) / cam.project([0, 17 / 12, 3]).k }]);
  assert.equal(apart.drawn.filter(d => d.op === 'stroke' && d.r > r * 1.2).length, 0, 'a ring round a mark that shows');
});

// Told apart by their shapes as well as their colours: a strike is a filled red disc, a ball a green ring round a white
// middle with its number in green, a ball in play a blue square. The colours are the end card's own in the light
// palette (css/app.css), and every number reads at 4.9 to 1 or more on what's behind it.
test('a strike is marked with a red disc, a ball with a green ring and a ball in play with a blue square', async () => {
  const cam = atBatCamera(716, 470, { dpr: 2 }), r = markRadius(cam);
  const marks = [{ x: -0.5, z: 3, n: 1, kind: 'strike' }, { x: 0.5, z: 2, n: 2, kind: 'ball' }, { x: 0, z: 1.2, n: 3, kind: 'play' }];
  const { ctx, drawn } = recorder();
  drawMarks(ctx, cam, marks);
  const fills = drawn.filter(d => d.op === 'fill'), texts = drawn.filter(d => d.op === 'text');
  assert.deepEqual(fills.map(d => [d.square ? 'square' : 'disc', d.color]), [['disc', MARK.strike], ['disc', '#fff'], ['square', MARK.play]], 'what each mark is filled with');
  const ring = drawn.filter(d => d.op === 'stroke' && d.color === MARK.ball);
  assert.ok(ring.length === 1 && ring[0].r < r && ring[0].r - ring[0].width / 2 > r * 0.5, `the ball's ring: ${JSON.stringify(ring)}`);
  assert.deepEqual(texts.map(d => [d.text, d.color]), [['1', '#fff'], ['2', MARK.ball], ['3', '#fff']], 'the numbers');
  assert.deepEqual(SHAPE, { strike: 'disc', ball: 'ring', play: 'square' });
  const css = await readFile(new URL('../css/app.css', import.meta.url), 'utf8');
  const light = Object.fromEntries([...css.slice(0, css.indexOf('@media')).matchAll(/--res-(\w+): (#[0-9a-f]{6})/g)].map(m => [m[1], m[2]]));
  assert.deepEqual(MARK, light, 'the marks and the end card are coloured differently');
  const lum = hex => { const [R, G, B] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * R + 0.7152 * G + 0.0722 * B; };
  for (const [kind, c] of Object.entries(MARK)) assert.ok((1.05) / (lum(c) + 0.05) >= 4.9, `a white number on a ${kind}'s ${c}`);
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
