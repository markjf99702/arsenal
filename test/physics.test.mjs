// The flight model against the Statcast numbers it's built from:  node --test test/physics.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PITCHES, BY_CODE } from '../js/pitches.js';
import { throwPitch, fromMound, sameTimeAs, RUBBER_Y, sideCamera, catcherCamera, topCamera, tvCamera, TV_EYE, apex, palette, drawZone, drawSideField, drawTopField, drawTvField, PLATE_Y, G } from '../js/flight.js';
import { Stage, PREV } from '../js/stage.js';
import { tilt, spinTilt, spinOf, seamsMove } from '../js/spin.js';
import { cross, norm } from '../js/math3.js';
import { atBatCamera, markRadius, GROUND, HIGH_RELEASE, drawMarks, growth, GROW, MARK, SHAPE, MITT, FIGURE, KNEE, LETTERS, figure, onPicture, drawBatter } from '../js/tracker.js';
import { SPOTS, spotXZ, PITCHERS, pitchFor } from '../js/atbat.js';
import { LEAGUE } from '../js/league.js';

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

// The centre-field camera is far behind the pitcher and to one side, with a long lens, and every pitch, either hand, a
// submariner's too, stays in its picture from the hand to the plate, under the speed and time over its top, on a phone,
// a computer and a tablet.
test('the TV camera has a long lens, and every pitch stays in its picture', async () => {
  assert.ok(TV_EYE[1] > 400 && TV_EYE[0] !== 0 && TV_EYE[2] > 10, `the camera at ${TV_EYE}`);
  const { PITCHERS, pitchFor } = await import('../js/atbat.js');
  // Every pitch of the league's and of the nine real pitchers' (Tyler Rogers's from by his knees, Chris Sale's from far
  // out to the side), and each of the league's from a 46-foot mound at 60 mph.
  const real = PITCHERS.filter(a => a.key !== 'average').flatMap(a => a.pitches.map(e => [{ ...pitchFor(a, e, [0, 0]), target: BY_CODE[e.code].target }, [a.hand]]));
  const thrown = [...PITCHES.map(p => [p, ['R', 'L']]), ...real, ...PITCHES.map(p => [fromMound(p, 46, 60), ['R']])];
  for (const [w, h, dpr] of [[358, 320, 3], [650, 447, 1], [650, 447, 2], [1024, 520, 2]]) {
    const W = w * dpr, H = h * dpr;
    const lens = 2 * Math.atan(W / 2 / tvCamera(W, H, { dpr }).F) * (180 / Math.PI);
    assert.ok(lens < 5, `${w}x${h}: the lens takes in ${lens.toFixed(1)}° across`);
    // An ordinary pitch is drawn big enough to read, not small under a stretch of empty stands: the plate is at least a
    // ninth of the picture's width.
    const ff = tvCamera(W, H, { dpr, see: [throwPitch(BY_CODE.FF, { rng: () => 0.5 }).release] });
    const plate = ff.project([0.708, PLATE_Y, 0]).x - ff.project([-0.708, PLATE_Y, 0]).x;
    assert.ok(Math.abs(plate) >= W / 9, `${w}x${h}: the plate is ${(Math.abs(plate) / dpr).toFixed(0)}px wide in a picture ${w}px wide`);
    for (const [p, hands] of thrown) {
      for (const hand of hands) {
        const f = throwPitch(p, { hand, rng: () => 0.5 });
        const cam = tvCamera(W, H, { top: Math.max(7.5, apex(f) + 0.8), dpr, see: [f.release] });
        for (let i = 0; i <= 40; i++) {
          const { x, y } = cam.project(f.pos((f.T * i) / 40));
          assert.ok(x >= 0 && x <= W && y >= 60 * dpr && y <= H, `${w}x${h}: ${p.code} ${hand} at (${(x / dpr).toFixed(0)}, ${(y / dpr).toFixed(0)}), ${i}/40 of the way`);
        }
      }
    }
  }
  // And its scenery draws.
  const ctx = new Proxy({}, { get: (o, k) => (k in o ? o[k] : typeof k === 'string' && /^(create)/.test(k) ? () => ({ addColorStop() {} }) : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
  drawTvField(ctx, tvCamera(650, 447), palette(false));
});

// Your own mound: from 46, 50 or 54 feet, the pitcher is scaled to the distance, his release and extension with it, and
// what spin moves the ball with the square of it, at any speed; it still lands where it's aimed, in the time its speed
// and distance give, and the same time to the plate as a speed from 60 ft 6 in that sameTimeAs works out. A 12-year-old's
// 60 mph from 46 feet gets there as soon as about 80 mph from 60 ft 6 in.
test('a pitch from your own mound, at your own speed', () => {
  const DRAG = 0.915, MPH = 5280 / 3600;
  for (const p of steady) {
    for (const [mound, mph] of [[46, 60], [50, 66], [54, 75], [RUBBER_Y, 70]]) {
      const k = mound / RUBBER_Y, q = fromMound(p, mound, mph), f = throwPitch(q, { rng: () => 0.5 });
      const rel = f.release, D = rel.y - PLATE_Y;
      assert.ok(Math.abs(rel.y - (mound - p.n.extension * k)) < 1e-9 && Math.abs(rel.z - p.n.height * k) < 1e-9, `${p.code} from ${mound} ft: let go of at ${rel.y.toFixed(2)} ft, ${rel.z.toFixed(2)} up`);
      assert.ok(Math.abs(f.T - (2 * D) / (mph * MPH * (1 + DRAG))) < 1e-9, `${p.code} from ${mound} ft at ${mph}: ${f.T}`);
      assert.ok(Math.hypot(f.end[0] - p.target[0], f.end[2] - p.target[1]) < 0.01, `${p.code} from ${mound} ft misses its aim`);
      const gap = [(f.ghostEnd[0] - f.end[0]) * 12, (f.end[2] - f.ghostEnd[2]) * 12];
      assert.ok(Math.abs(Math.abs(gap[0]) - Math.abs(p.n.arm) * k * k) < 0.05 && Math.abs(gap[1] - p.n.rise * k * k) < 0.05, `${p.code} from ${mound} ft moves ${gap.map(v => v.toFixed(1))}, not the square of ${k.toFixed(2)} times its own`);
      const same = sameTimeAs(f, p.n), big = throwPitch(fromMound(p, RUBBER_Y, same), { rng: () => 0.5 });
      assert.ok(Math.abs(big.T - f.T) < 1e-6, `${p.code}: ${same.toFixed(1)} mph from 60 ft 6 in takes ${big.T}, not ${f.T}`);
    }
    assert.equal(fromMound(p), p, 'the big leagues\' own pitch, unchanged');
  }
  const kid = sameTimeAs(throwPitch(fromMound(BY_CODE.FF, 46, 60), { rng: () => 0.5 }), BY_CODE.FF.n);
  assert.ok(kid > 78 && kid < 82, `60 mph from 46 feet is like ${kid.toFixed(1)} mph from 60 ft 6 in`);
  // The scenery moves with it: from the side, the rubber is drawn 46 feet from the plate.
  const cam = sideCamera(650, 447);
  cam.mound = 46;
  const c = palette(false), rects = [];
  const ctx = new Proxy({ fillRect(...a) { rects.push([this.fillStyle, ...a]); } }, { get: (o, k) => (k in o ? o[k] : typeof k === 'string' && k.startsWith('create') ? () => ({ addColorStop() {} }) : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
  drawSideField(ctx, cam, c);
  const rubber = rects.find(([fill, , , , h]) => fill === c.chalk && h === 3);
  assert.ok(rubber && Math.abs(rubber[1] - cam.project([0, 46, 0.85]).x) < 0.5, `the rubber is drawn at ${rubber?.[1]}, not 46 feet out at ${cam.project([0, 46, 0.85]).x}`);
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
  const drawn = [], nothing = { addColorStop() {}, width: 0 }, saved = [];
  let path = [];
  const ctx = new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'beginPath') return () => { path = []; };
      // How solid it's drawn, kept and given back as a canvas does.
      if (k === 'save') return () => saved.push(t.globalAlpha);
      if (k === 'restore') return () => { t.globalAlpha = saved.pop(); };
      if (k === 'arc') return (x, y, r) => path.push({ x, y, r });
      // A square with rounded corners, by its middle and half its width (r, as for a circle).
      if (k === 'roundRect') return (x, y, w, h) => path.push({ x: x + w / 2, y: y + h / 2, r: w / 2, square: true });
      if (k === 'fillText') return (text, x, y) => drawn.push({ op: 'text', text, x, y, color: t.fillStyle });
      if (k === 'fill' || k === 'stroke' || k === 'strokeRect') {
        return () => {
          const was = { op: k, color: k === 'fill' ? t.fillStyle : t.strokeStyle, width: t.lineWidth, alpha: t.globalAlpha ?? 1 };
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

// The batter stands in his box, a flat figure facing the plate, on a right-handed batter's side or a left-handed one's,
// one the other's mirror image. The hollow under his front knee and the letters on his chest are level with the bottom
// and the top of the strike zone. On a phone, a computer and a tablet he's clear of every pitch thrown to a spot off the
// plate inside, at its mark's full size; he's under the marks anyway, in the picture's background, and see-through.
test('the batter is drawn in his box, his knees and letters level with the zone, clear of the spots inside', () => {
  // His drawing: the front knee's joint a little above the hollow under it, the letters on the front of his chest.
  const knee = FIGURE.find(s => s.line && s.line[1][1] > 1.6 && s.line[1][1] < 1.9 && s.line[1][0] > 0.35);
  assert.ok(knee && knee.line[1][1] - KNEE > 0.05 && knee.line[1][1] - KNEE < 0.2, `the front knee at ${knee?.line[1]}`);
  assert.ok(FIGURE.some(s => s.poly?.some(([u, z]) => z === LETTERS && u >= 0.4)), 'nothing on the front of his chest at the letters');
  for (const [name, w, h, dpr] of [['phone', 358, 235, 2], ['computer', 650, 447, 1], ['tablet', 736, 506, 2]]) {
    const cam = atBatCamera(w * dpr, h * dpr, { dpr }), r = markRadius(cam);
    const zone = { top: cam.project([0, 17 / 12, LEAGUE.sz.top]).y, bottom: cam.project([0, 17 / 12, LEAGUE.sz.bottom]).y };
    for (const batter of ['R', 'L']) {
      const shapes = figure(cam, batter), pts = shapes.flat(), toward = batter === 'R' ? 1 : -1, at = onPicture(cam, batter);
      // Level with the zone: his knees and letters where its bottom and top are, and his feet on the ground under them.
      assert.ok(Math.abs(at([0, KNEE]).y - zone.bottom) < 1e-6 && Math.abs(at([0, LETTERS]).y - zone.top) < 1e-6, `${name}, ${batter}: knees and letters at ${at([0, KNEE]).y.toFixed(1)} and ${at([0, LETTERS]).y.toFixed(1)}, the zone from ${zone.bottom.toFixed(1)} to ${zone.top.toFixed(1)}`);
      const bottom = Math.max(...pts.map(p => p.y));
      assert.ok(Math.abs(bottom - at([0, 0]).y) < 1e-6, `${name}, ${batter}: his feet at ${bottom.toFixed(1)}, the ground at ${at([0, 0]).y.toFixed(1)}`);
      // On his own side of the plate, and clear of each spot off the plate inside.
      const inside = SPOTS.filter(s => s.c === -2).map(s => cam.project([...spotXZ(s, batter)].flatMap((v, i) => (i ? [17 / 12, v] : [v]))));
      const front = Math.max(...pts.map(p => toward * p.x));
      for (const m of inside) assert.ok(front < toward * m.x - r, `${name}, ${batter}: he reaches ${front.toFixed(1)}, a mark inside starts at ${(toward * m.x - r).toFixed(1)}`);
      // Every shape goes round the same way, so one path adds them up.
      const signs = shapes.map(sh => Math.sign(sh.reduce((a, p, i) => { const q = sh[(i + 1) % sh.length]; return a + p.x * q.y - q.x * p.y; }, 0)));
      assert.ok(signs.every(x => x === signs[0]), `${name}, ${batter}: his shapes go round different ways`);
    }
    // Each side the mirror image of the other.
    const R = figure(cam, 'R').flat(), L = figure(cam, 'L').flat();
    const mirrored = R.every(p => L.some(q => Math.abs(q.x - (cam.W - p.x)) < 1e-6 && Math.abs(q.y - p.y) < 1e-6));
    assert.ok(mirrored, `${name}: the left-handed batter isn't the right-handed one turned round`);
  }
  // See-through: dark on the light palette, pale on the dark, and well short of solid either way.
  for (const dark of [false, true]) {
    const { ctx, drawn } = recorder();
    drawBatter(ctx, atBatCamera(716, 470, { dpr: 2 }), 'R', dark);
    const alpha = Number(drawn.filter(d => d.op === 'fill').at(-1).color.match(/[\d.]+\)$/)[0].slice(0, -1));
    assert.ok(alpha >= 0.15 && alpha <= 0.35, `the batter is ${alpha} solid on the ${dark ? 'dark' : 'light'} palette`);
  }
});

// The catcher's target, a mitt with its pocket on the spot called, is drawn under the pitch's path and its marks, and the
// line from it to where a pitch that missed crossed runs between the two, under the mark.
test('the catcher\'s target is under the pitch, and the line from it to where the pitch crossed is under its mark', () => {
  const { ctx, drawn } = recorder();
  Object.assign(globalThis, {
    window: { devicePixelRatio: 2 }, matchMedia: () => ({ matches: false }), ResizeObserver: class { observe() {} },
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    document: { createElement: () => ({ getContext: () => recorder().ctx }) },
  });
  const stage = new Stage({ width: 0, height: 0, getContext: () => ctx, getBoundingClientRect: () => ({ width: 358, height: 235, left: 0, top: 0 }) });
  stage.set({ view: 'catcher', ghost: false, color: '#ffd23f', atBat: true, batter: 'R', target: [0.47, 3.4], miss: [0.9, 2.6], marks: [{ x: 0.9, z: 2.6, n: 1, kind: 'strike' }] });
  stage.show([throwPitch(BY_CODE.FF, { rng: () => 0.5 })]);
  stage.clock = 5;
  drawn.length = 0;
  stage.draw();
  const cam = stage.camera(), spot = cam.project([0.47, 17 / 12, 3.4]);
  const pocket = drawn.findIndex(d => d.color === MITT.pocket), path = drawn.findIndex(d => d.color === '#ffd23f');
  const line = drawn.findIndex(d => d.color === '#f3d6ad'), mark = drawn.findIndex(d => d.color === MARK.strike && d.op === 'fill');
  assert.ok(pocket >= 0 && Math.hypot(drawn[pocket].x - spot.x, drawn[pocket].y - spot.y) < 1e-9, 'the mitt\'s pocket isn\'t on the spot');
  assert.ok(drawn.findIndex(d => d.color === MITT.leather) < pocket, 'the pocket is under the mitt');
  assert.ok(pocket < line && line < path && path < mark, `drawn in the order ${JSON.stringify({ pocket, line, path, mark })}`);
  drawn.length = 0;
  stage.set({ miss: null });
  assert.equal(drawn.filter(d => d.color === '#f3d6ad').length, 0, 'a line with no miss');
});

// Where the hitter swung: a small ring, smaller than a mark, joined to its mark by a line, all under the marks, and its
// word beside it over them. Nothing at all when he swung where the pitch was.
test('where the hitter swung is a small ring joined to the mark, with its word over the marks', () => {
  const marks = [{ x: 0.2, z: 1.4, n: 1, kind: 'strike' }];
  const draw = swing => {
    const { ctx, drawn } = recorder();
    Object.assign(globalThis, {
      window: { devicePixelRatio: 2 }, matchMedia: () => ({ matches: false }), ResizeObserver: class { observe() {} },
      requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
      document: { createElement: () => ({ getContext: () => recorder().ctx }) },
    });
    const stage = new Stage({ width: 0, height: 0, getContext: () => ctx, getBoundingClientRect: () => ({ width: 358, height: 235, left: 0, top: 0 }) });
    stage.set({ view: 'catcher', atBat: true, batter: 'R', marks, swing });
    drawn.length = 0;
    stage.draw();
    return { drawn, cam: stage.camera() };
  };
  const { drawn, cam } = draw({ at: [0.1, 1.85], to: [0.2, 1.4], tag: 'early' });
  const at = cam.project([0.1, 17 / 12, 1.85]), rr = markRadius(cam);
  const ring = drawn.findIndex(d => d.op === 'stroke' && d.color === '#fff' && d.r && Math.hypot(d.x - at.x, d.y - at.y) < 1e-9);
  const mark = drawn.findIndex(d => d.op === 'fill' && d.color === MARK.strike), word = drawn.findIndex(d => d.op === 'text' && d.text === 'early');
  assert.ok(ring >= 0 && drawn[ring].r < rr, `the ring: ${JSON.stringify(drawn[ring])}`);
  assert.ok(ring < mark && mark < word, `drawn in the order ${JSON.stringify({ ring, mark, word })}`);
  assert.ok(drawn.slice(0, mark).some(d => d.op === 'stroke' && d.color === '#fff' && !d.r), 'no line from the ring to the mark');
  const near = draw({ at: [0.21, 1.41], to: [0.2, 1.4], tag: '' }).drawn;
  assert.equal(near.filter(d => d.op === 'stroke' && d.color === '#fff' && d.r && d.r < rr).length, 0, 'a ring on the mark');
});

// The pitch before, its whole path and its decision ring, faint under the new one's: drawn first, and only so solid.
test('the last pitch\'s path and decision ring are drawn faint, under the new pitch', () => {
  const { ctx, drawn } = recorder();
  Object.assign(globalThis, {
    window: { devicePixelRatio: 2 }, matchMedia: () => ({ matches: false }), ResizeObserver: class { observe() {} },
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    document: { createElement: () => ({ getContext: () => recorder().ctx }) },
  });
  const stage = new Stage({ width: 0, height: 0, getContext: () => ctx, getBoundingClientRect: () => ({ width: 358, height: 235, left: 0, top: 0 }) });
  const before = throwPitch(BY_CODE.SL, { rng: () => 0.5 }), now = throwPitch(BY_CODE.FF, { rng: () => 0.5 });
  stage.set({ view: 'catcher', ghost: false, color: '#ffd23f', atBat: true, batter: 'R', prev: before });
  stage.show([now]);
  stage.clock = 0.5;
  drawn.length = 0;
  stage.draw();
  const yellow = drawn.filter(d => d.op === 'stroke' && d.color === '#ffd23f');
  const faint = yellow.filter(d => d.alpha === PREV), solid = yellow.filter(d => d.alpha === 1);
  assert.ok(PREV >= 0.3 && PREV <= 0.6, `the last pitch is drawn ${PREV} solid`);
  assert.ok(faint.length >= 2 && drawn.indexOf(faint.at(-1)) < drawn.indexOf(solid[0]), 'the last pitch isn\'t under the new one');
  const cam = stage.camera(), at = cam.project(before.pos(before.T - 0.175));
  assert.ok(faint.some(d => d.r && Math.hypot(d.x - at.x, d.y - at.y) < 1e-9), 'the last pitch\'s decision ring');
  // Its whole path, though the new one has only just left the hand.
  assert.ok(faint.some(d => !d.r), 'the last pitch\'s path');
  drawn.length = 0;
  stage.set({ prev: null });
  assert.equal(drawn.filter(d => d.alpha === PREV).length, 0, 'a last pitch with none set');
});

// Step in times a tap by the event's own time between frames (Stage.timeAt): one that came after the last frame counts
// that much later, and one that came before it, as a touch that reaches the page a frame late does, that much earlier,
// up to 0.05 s either way. Held, the clock doesn't move. At Slow the game clock runs at its speed.
test('a tap is timed to the moment it came, before or after the last frame', () => {
  const at = (stamp, o = {}) => Stage.prototype.timeAt.call({ clock: 1, tickAt: 1000, held: false, opts: { speed: 1 }, ...o }, stamp);
  const close = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} against ${b}`);
  close(at(1010) - at(1000), 0.01, 'a tap 10 ms after the last frame');
  close(at(1000) - at(990), 0.01, 'a tap 10 ms before the last frame');
  close(at(1000) - at(900), 0.05, 'a tap long before the last frame');
  close(at(1100) - at(1000), 0.05, 'a tap long after the last frame');
  close(at(990, { held: true }), at(1000, { held: true }), 'a tap while the throw is held');
  close(at(990, { opts: { speed: 0.25 } }) - at(1000, { opts: { speed: 0.25 } }), -0.0025, 'a tap 10 ms before the last frame at Slow');
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

// The clock's arrow is where the pitch moves, by Statcast's movement; its thin line, where the spin itself points, by
// Hawk-Eye's spin direction (js/numbers.js); and the ball, on the card and in flight, turns on an axis square to that.
test('the clock\'s arrow and thin line, and the ball\'s axis, are drawn from the numbers', () => {
  const deg = a => (a * 180) / Math.PI;
  const near = (a, b, by, what) => { const d = Math.abs(((a - b + 540) % 360) - 180); assert.ok(d <= by, `${what}: ${a.toFixed(1)}° drawn, ${b.toFixed(1)}° in the numbers`); };
  for (const p of steady) {
    for (const hand of ['R', 'L']) {
      const flip = a => (hand === 'R' ? a : 360 - a);
      near(deg(tilt(p, hand).angle), flip(deg(Math.atan2(p.n.arm, p.n.rise))), 0.01, `${p.code} ${hand}, the arrow`);
      const st = spinTilt(p, hand);
      if (p.n.spin == null) { assert.equal(st, null, `${p.code} has a thin line with no spin direction`); continue; }
      near(deg(st.angle), flip(p.n.spin), 0.01, `${p.code} ${hand}, the thin line`);
      // The part of the axis that does the pushing is square to the push: crossed with the flight, it points along it.
      const { axis } = spinOf(p, hand), along = norm(cross(axis, [0, -1, 0]));
      near(deg(Math.atan2(-along[0], along[2])), flip(p.n.spin), 0.01, `${p.code} ${hand}, the axis the ball turns on`);
      assert.deepEqual(throwPitch(p, { hand, rng: () => 0.5 }).axis, axis, `${p.code} ${hand}: the ball in flight turns on another axis`);
    }
  }
  // Half an hour or more apart as they read, the card says the seams add the rest: the sinker's spin points to 1:30 and
  // it moves toward 2:00; the four-seamer's are a quarter of an hour apart.
  assert.deepEqual([spinTilt(BY_CODE.SI).text, tilt(BY_CODE.SI).text, seamsMove(BY_CODE.SI)], ['1:30', '2:00', true]);
  assert.deepEqual([spinTilt(BY_CODE.FF).text, tilt(BY_CODE.FF).text, seamsMove(BY_CODE.FF)], ['1:15', '1:00', false]);
});

// A real pitcher's ball turns on his own spin direction, not the league's (js/league.js); where none was measured (Waldron's
// knuckleball), on the way it moves.
test('a real pitcher\'s ball turns on his own spin direction', () => {
  const deg = a => (a * 180) / Math.PI;
  for (const pitcher of PITCHERS) {
    for (const e of pitcher.pitches) {
      if (e.code === 'KN') continue;
      const f = throwPitch(pitchFor(pitcher, e, [0, 2.5]), { hand: pitcher.hand, rng: () => 0.5 });
      const along = norm(cross(f.axis, [0, -1, 0])), drawn = (deg(Math.atan2(-along[0], along[2])) + 360) % 360;
      const want = e.spin ?? (deg(Math.atan2(e.arm, e.rise)) + 360) % 360, mine = pitcher.hand === 'R' ? want : (360 - want) % 360;
      assert.ok(Math.abs(((drawn - mine + 540) % 360) - 180) < 0.01, `${pitcher.key}'s ${e.code} turns toward ${drawn.toFixed(1)}°, not his ${mine.toFixed(1)}°`);
    }
  }
  assert.ok(PITCHERS.every(p => p.pitches.every(e => e.code === 'KN' || e.spin != null)), 'a real pitcher\'s pitch with no spin direction');
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
