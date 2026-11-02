// Drawn over the view from behind the plate during an at-bat: the batter in his box, and each pitch so far
// where it crossed the plate, numbered, the way a broadcast's pitch tracker shows them.
import { PLATE_Y, catcherCamera } from './flight.js';
import { LEAGUE } from './league.js';

// Result colours, as broadcasts use them: green for a ball, red for a strike, blue for a ball in play. They're the end
// card's own (--res-*, css/app.css), a shade darker than broadcasts' so a white number on them reads at 4.9 to 5.7 to 1.
// And each has a shape of its own, so they're told apart without the colours: a strike is a filled disc, a ball a ring
// and a ball in play a square.
export const MARK = { ball: '#23804b', strike: '#c23b33', play: '#2f66b8' };
export const SHAPE = { strike: 'disc', ball: 'ring', play: 'square' };
export const markKind = result => (result === 'ball' || result === 'hbp' ? 'ball' : result === 'inplay' ? 'play' : 'strike');

// A mark's radius: a little more than a ball's at the plate, and never under 7 CSS pixels.
const MID = [0, PLATE_Y, 2.5];
export const markRadius = cam => Math.max(7 * (cam.dpr || 1), cam.project(MID).k * 0.16);

// The at-bat's view from behind the plate, fitted to the canvas. It tilts so that a pitch crossing at the ground is
// marked whole above the bottom edge and the highest release there is (7 feet, at a long stride) is inside the top,
// and where tilting can't fit both, on a wide canvas, it pulls back just enough. `lift` raises it more, for a lob.
export const HIGH_RELEASE = [0, 53, 7];
export const GROUND = [0, PLATE_Y, 0];
let fitted = {};
export function atBatCamera(W, H, { dpr = 1, lift = 0 } = {}) {
  const key = `${W}|${H}|${dpr}|${lift}`;
  if (fitted.key === key) return fitted.cam;
  const deg = Math.PI / 180;
  const level = catcherCamera(W, H);
  // Each point's angle above the middle of the view untilted; tilting up by L takes L off it.
  const angle = P => { const c = level.toCam(P); return Math.atan2(c[1], c[2]); };
  const top = angle(HIGH_RELEASE), bottom = angle(GROUND), mid = angle(MID);
  const toMid = Math.hypot(...level.toCam(MID));
  const padTop = H * 0.05, padBottom = 2 * dpr;
  // The range of tilts that fits both, for a view `zoom` times the explorer's.
  const range = zoom => {
    const F = zoom * level.F;
    let lo = 0, hi = 0, L = 0;
    for (let i = 0; i < 3; i++) {
      const r = Math.max(7 * dpr, (0.16 * F) / (toMid * Math.cos(mid - L)));
      lo = top - Math.atan((H / 2 - padTop) / F);
      hi = bottom + Math.atan((H / 2 - padBottom - r) / F);
      L = (lo + hi) / 2;
    }
    return { lo, hi, L };
  };
  let zoom = 1;
  if (range(1).lo > range(1).hi) {
    let a = 0.2, b = 1;
    for (let i = 0; i < 30; i++) { const z = (a + b) / 2; if (range(z).lo <= range(z).hi) a = z; else b = z; }
    zoom = a;
  }
  const cam = catcherCamera(W, H, { lift: range(zoom).L / deg + lift, zoom });
  cam.dpr = dpr;
  fitted = { key, cam };
  return cam;
}

// The newest mark grows in as it lands: half as big again, settling to its size over GROW seconds. `age` is how long
// ago it landed; growth is how many times its size it's drawn.
export const GROW = 0.18;
export const growth = age => (age >= 0 && age < GROW ? 1 + 0.5 * (1 - age / GROW) ** 2 : 1);

// How far across the at-bat's picture the words over its top-left corner can reach, in CSS pixels from its left edge:
// to the edge of a mark on `spot` ([x, z] in feet, the high spot off the plate on that side), so the count and what
// happened never cover a pitch thrown there.
export function readoutRoom(W, H, dpr, [x, z]) {
  const cam = atBatCamera(W, H, { dpr });
  return (cam.project([x, PLATE_Y, z]).x - markRadius(cam)) / dpr;
}

// A mark's outline, `r` from its middle: a circle, or for a ball in play a square with rounded corners, as wide.
function outline(ctx, kind, x, y, r) {
  ctx.beginPath();
  if (SHAPE[kind] !== 'square') { ctx.arc(x, y, r, 0, Math.PI * 2); return; }
  const s = r * 0.9;
  if (ctx.roundRect) ctx.roundRect(x - s, y - s, 2 * s, 2 * s, s * 0.32); else ctx.rect(x - s, y - s, 2 * s, 2 * s);
}

// And how far across it the radar board in its top-right corner can reach, in CSS pixels from its right edge: to the
// edge of a mark on the same spot on the other side.
export function boardRoom(W, H, dpr, [x, z]) {
  const cam = atBatCamera(W, H, { dpr });
  return (W - cam.project([-x, PLATE_Y, z]).x - markRadius(cam)) / dpr;
}

// Each pitch where it crossed. One that crossed below the bottom edge (it bounced) sits on the edge with a notch
// under its number, pointing down: lower than this. `grow` is how many times its size the newest is drawn (growth).
// A strike is filled with its red and a ball in play with its blue, each with a white number; a ball is a green ring
// round a white middle, with its number in green. A later pitch that crossed within a mark's width of an earlier one
// covers most of it, so the earlier one keeps a thin outline of its colour round the outside, one further out for each
// that covers it, and can still be found. Every mark stays where its pitch crossed.
export function drawMarks(ctx, cam, marks, { grow = 1 } = {}) {
  const r0 = markRadius(cam);
  const at = marks.map(m => {
    const p = markAt(cam, [m.x, m.z]);
    return { ...p, low: p.y < cam.project([m.x, PLATE_Y, m.z]).y };
  });
  const ring = Math.max(1.5 * (cam.dpr || 1), r0 * 0.2);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  marks.forEach((m, i) => {
    const p = at[i], { low, y } = p;
    const last = i === marks.length - 1, r = last ? r0 * grow : r0;
    const color = MARK[m.kind], hollow = SHAPE[m.kind] === 'ring';
    ctx.globalAlpha = last ? 1 : 0.88;
    const covered = at.slice(i + 1).filter(q => Math.hypot(q.x - p.x, q.y - y) < r0).length;
    if (covered) {
      // Outside the white edge of the mark on top, with a white line between each outline and the next.
      outline(ctx, m.kind, p.x, y, r0 * 1.12 + ring * (1.6 * covered - 0.5));
      ctx.strokeStyle = '#fff'; ctx.lineWidth = ring * 1.8; ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = ring; ctx.stroke();
    }
    const edge = Math.max(1.5, r * (last ? 0.26 : 0.16));
    outline(ctx, m.kind, p.x, y, r);
    ctx.fillStyle = hollow ? '#fff' : color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = edge;
    ctx.stroke();
    if (hollow) {
      // The ring, inside the white edge.
      const w = Math.max(1.5 * (cam.dpr || 1), r * 0.24);
      ctx.beginPath(); ctx.arc(p.x, y, r - edge / 2 - w / 2, 0, Math.PI * 2);
      ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
    }
    ctx.fillStyle = hollow ? color : '#fff';
    ctx.font = `700 ${Math.round(r * (hollow ? 1.02 : 1.15))}px "Barlow Condensed", system-ui, sans-serif`;
    ctx.fillText(String(m.n), p.x, y + r * (low ? -0.18 : 0.06));
    if (low) {
      ctx.beginPath();
      ctx.moveTo(p.x - r * 0.34, y + r * 0.4); ctx.lineTo(p.x + r * 0.34, y + r * 0.4); ctx.lineTo(p.x, y + r * 0.76);
      ctx.closePath(); ctx.fill();
    }
  });
  ctx.restore();
}

// Where a mark is drawn: where its pitch crossed, or on the bottom edge for one that crossed below it (drawMarks).
export function markAt(cam, [x, z]) {
  const p = cam.project([x, PLATE_Y, z]), floor = cam.H - markRadius(cam) - 2;
  return { x: p.x, y: Math.min(p.y, floor) };
}

// The catcher's target: a mitt where the pitch is called, as a broadcast's command graphic shows it, seen from behind
// him with its thumb to the right. Brown leather with a paler pocket and a white edge, so it shows on the dirt and the
// grass alike, and looks nothing like the dashed ring of the decision point. Its pocket is on the spot.
export const MITT = { leather: '#6b3d1e', pocket: '#c08a52' };
export function drawTarget(ctx, cam, [x, z]) {
  const p = markAt(cam, [x, z]), R = markRadius(cam) * 1.15, dpr = cam.dpr || 1;
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y - R * 0.08, R, 0, Math.PI * 2);
  ctx.moveTo(p.x + R * 1.22, p.y + R * 0.5);
  ctx.arc(p.x + R * 0.78, p.y + R * 0.5, R * 0.44, 0, Math.PI * 2);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * Math.max(1.5 * dpr, R * 0.18); ctx.stroke();
  ctx.fillStyle = MITT.leather; ctx.fill();
  ctx.beginPath(); ctx.arc(p.x, p.y, R * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = MITT.pocket; ctx.fill();
  ctx.restore();
}

// A thin line from the target to where the pitch crossed, for one that missed it by more than MISSED (6 inches), under
// its mark: pale leather, with a dark edge on the light palette.
export const MISSED = 0.5;
export function drawMiss(ctx, cam, from, to, dark) {
  const a = markAt(cam, from), b = markAt(cam, to), dpr = cam.dpr || 1;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  if (!dark) { ctx.strokeStyle = 'rgba(20, 30, 45, .55)'; ctx.lineWidth = 3.5 * dpr; ctx.stroke(); }
  ctx.strokeStyle = '#f3d6ad'; ctx.lineWidth = 1.5 * dpr; ctx.stroke();
  ctx.restore();
}

// The batter, a flat figure in his box, the way a broadcast's strike zone graphic stands one beside it: side on from
// behind the plate, facing it, his bat up behind him. He's made of simple shapes, drawn in feet: across, toward the
// plate from the middle of his stance, and up from the ground, with the hollow under his front knee at KNEE and the
// letters on his chest at LETTERS. A line is a limb, `r` thick either side (or tapering from one to the other).
// On the picture he's stretched to fit the strike zone (2026's average, js/league.js): that hollow and the letters are
// level with its bottom and its top. The middle of his stance is 2.55 feet out from the middle of the plate.
const STANCE = 2.55;
export const KNEE = 1.62, LETTERS = 3.22;
export const FIGURE = [
  { circle: [0.06, 4.56], r: 0.36 }, // his head, in a helmet
  { poly: [[0.08, 4.68], [0.62, 4.62], [0.62, 4.54], [0.1, 4.5]] }, // its brim
  { line: [[0.02, 4.3], [0.04, 4]], r: 0.17 }, // neck
  { poly: [[-0.42, 4.02], [0.22, 4.08], [0.4, 3.64], [0.42, 3.22], [0.3, 2.74], [-0.5, 2.6], [-0.5, 3.4]] }, // body
  { circle: [-0.2, 2.64], r: 0.38 }, // hips
  { line: [[-0.12, 2.5], [0.22, 1.7]], r: [0.36, 0.25] }, { line: [[0.22, 1.7], [0.02, 0.24]], r: [0.25, 0.17] }, // back leg
  { line: [[0.06, 2.46], [0.44, 1.76]], r: [0.32, 0.23] }, { line: [[0.44, 1.76], [0.3, 0.22]], r: [0.23, 0.16] }, // front leg
  { poly: [[-0.34, 0], [0.48, 0], [0.48, 0.1], [0.28, 0.22], [-0.12, 0.32], [-0.34, 0.2]] }, // back foot
  { poly: [[0.06, 0], [0.76, 0], [0.75, 0.1], [0.5, 0.22], [0.16, 0.3]] }, // front foot
  { line: [[0.12, 3.9], [0.28, 3.5]], r: 0.15 }, { line: [[0.28, 3.5], [-0.28, 4.16]], r: 0.13 }, // front arm
  { line: [[-0.32, 3.9], [-0.76, 3.86]], r: 0.15 }, { line: [[-0.76, 3.86], [-0.3, 4.2]], r: 0.13 }, // back arm, elbow up
  { circle: [-0.3, 4.18], r: 0.14 }, // hands
  { line: [[-0.3, 4.18], [-1.66, 6.52]], r: [0.05, 0.11] }, // bat
];
// Each shape as an outline of points.
const arc = ([x, z], r, from, to, n = 8) => Array.from({ length: n + 1 }, (_, i) => { const a = from + ((to - from) * i) / n; return [x + r * Math.cos(a), z + r * Math.sin(a)]; });
const outlineOf = s => {
  if (s.poly) return s.poly;
  if (s.circle) return arc(s.circle, s.r, 0, 2 * Math.PI, 20).slice(1);
  const [[ax, az], [bx, bz]] = s.line, [ra, rb] = [].concat(s.r, s.r), t = Math.atan2(bz - az, bx - ax);
  return [...arc([bx, bz], rb, t - Math.PI / 2, t + Math.PI / 2), ...arc([ax, az], ra, t + Math.PI / 2, t + (3 * Math.PI) / 2)];
};

// Where a point of the figure's drawing is on the picture, for a batter on `batter`'s side (a right-handed batter stands
// on the catcher's left, facing right), as if he stood level with the front of the plate, where the zone is.
export function onPicture(cam, batter) {
  const sx = batter === 'R' ? -1 : 1, k = (LEAGUE.sz.top - LEAGUE.sz.bottom) / (LETTERS - KNEE);
  return ([u, z]) => cam.project([sx * (STANCE - u * k), PLATE_Y, LEAGUE.sz.bottom + (z - KNEE) * k]);
}
// And each of its shapes, each going round the same way, so drawn as one path they add up where they overlap rather
// than cut holes in each other.
export function figure(cam, batter) {
  const at = onPicture(cam, batter);
  return FIGURE.map(s => {
    const shape = outlineOf(s).map(at);
    const area = shape.reduce((a, p, i) => { const q = shape[(i + 1) % shape.length]; return a + p.x * q.y - q.x * p.y; }, 0);
    return area < 0 ? shape.reverse() : shape;
  });
}

// The batter's box he's standing in, shaded, so it's clear which side he hits from, and him in it, see-through, in a
// dark ink on the light palette and a pale one on the dark, under everything else on the picture. His shapes are one
// path, so where they overlap he isn't any darker.
export function drawBatter(ctx, cam, batter, dark) {
  const sx = batter === 'R' ? -1 : 1;
  const pts = [[1.208, -2.29], [5.208, -2.29], [5.208, 3.71], [1.208, 3.71]].map(([x, y]) => cam.project([sx * x, y, 0.01]));
  ctx.save();
  ctx.fillStyle = dark ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.28)';
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  for (const shape of figure(cam, batter)) {
    shape.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
  }
  ctx.fillStyle = dark ? 'rgba(236,231,220,.2)' : 'rgba(22,30,44,.3)';
  ctx.fill();
  ctx.restore();
}
