// A baseball drawn on a 2D canvas: a shaded sphere with its real seam (one closed curve
// that splits the cover into two figure-eight pieces) and 108 double stitches.
import { apply, align, mul, rotation, norm, cross, add, scale } from './math3.js';

// The seam is the classic "tennis ball" curve, which lies exactly on the unit sphere
// when A + B = 1 and C = 2√(AB). B sets how narrow the waist of each leather piece is.
const B = 0.28, A = 1 - B, C = 2 * Math.sqrt(A * B);
const seamAt = t => [A * Math.cos(t) + B * Math.cos(3 * t), A * Math.sin(t) - B * Math.sin(3 * t), C * Math.sin(2 * t)];

// Spinning about FOUR, a fixed point sees four seams go by per turn (the axis goes through
// the narrow waist of each piece). About TWO it sees two (the axis goes through the round lobes).
export const FOUR = [0, 0, 1];
export const TWO = norm([1, 1, 0]);
// About DOT the axis goes through a seam, so from the front the seam spins in a tight red circle:
// the "red dot" hitters look for on a slider.
export const DOT = [1, 0, 0];

const SEAM_POINTS = 360;
const STITCHES = 108;
const seam = [];
const stitches = [];
{
  // Even spacing along the seam's length, so the stitches sit evenly.
  const fine = 4000, pts = [], acc = [0];
  for (let i = 0; i <= fine; i++) pts.push(seamAt((i / fine) * Math.PI * 2));
  for (let i = 1; i <= fine; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
  const total = acc[fine];
  const at = s => {
    let lo = 0, hi = fine;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (acc[mid] < s) lo = mid; else hi = mid; }
    return lo;
  };
  for (let i = 0; i < SEAM_POINTS; i++) seam.push(pts[at((i / SEAM_POINTS) * total)]);
  for (let i = 0; i < STITCHES; i++) {
    const k = at(((i + 0.5) / STITCHES) * total);
    const p = pts[k], q = pts[Math.min(k + 1, fine)];
    const tan = norm([q[0] - p[0], q[1] - p[1], q[2] - p[2]]);
    const side = norm(cross(p, tan));
    const onBall = v => norm(v);
    // Each stitch is a "V": one leg on each side of the seam, both leaning back along it.
    const legs = [1, -1].map(sgn => [
      onBall(add(p, scale(side, 0.022 * sgn))),
      onBall(add(add(p, scale(side, 0.095 * sgn)), scale(tan, -0.045))),
    ]);
    stitches.push(legs);
  }
}

// A rotation that puts the ball's local spin axis on `viewAxis`, then turns it `roll` radians about it.
export function orient(localAxis, viewAxis, roll = 0) {
  return mul(rotation(viewAxis, roll), align(localAxis, viewAxis));
}

// Like orient, but picks the roll that turns `localPoint` (a point on the ball's spin equator)
// as close as it can to the view direction `facing`.
export function orientFacing(localAxis, viewAxis, localPoint, facing) {
  const M1 = align(localAxis, viewAxis);
  const ax = norm(viewAxis);
  const flat = v => { const d = v[0] * ax[0] + v[1] * ax[1] + v[2] * ax[2]; return norm([v[0] - ax[0] * d, v[1] - ax[1] * d, v[2] - ax[2] * d]); };
  const p = flat(apply(M1, localPoint)), q = flat(facing);
  const c = cross(p, q);
  const roll = Math.atan2(c[0] * ax[0] + c[1] * ax[1] + c[2] * ax[2], p[0] * q[0] + p[1] * q[1] + p[2] * q[2]);
  return mul(rotation(ax, roll), M1);
}

// View space: x right, y up, z toward the viewer. M takes ball coordinates to view space.
export function drawBall(ctx, cx, cy, r, M, opts = {}) {
  const { shade = true, ink = '#c8202f', outline = 'rgba(60,40,30,.35)' } = opts;
  if (r < 2.2) {
    ctx.fillStyle = '#fbf7ee';
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(r, 1.2), 0, Math.PI * 2); ctx.fill();
    return;
  }
  ctx.save();
  // Leather
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, '#fffdf8');
  g.addColorStop(0.55, '#f3ede1');
  g.addColorStop(1, shade ? '#cdc1aa' : '#e9e1d2');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.clip();

  const px = v => cx + v[0] * r, py = v => cy - v[1] * r;
  const view = seam.map(p => apply(M, p));

  // The groove where the two pieces meet.
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(150,110,95,.55)';
  ctx.lineWidth = Math.max(0.6, r * 0.018);
  ctx.beginPath();
  for (let i = 0; i <= view.length; i++) {
    const a = view[i % view.length], b = view[(i + view.length - 1) % view.length];
    if (a[2] > 0 && b[2] > 0) { ctx.moveTo(px(b), py(b)); ctx.lineTo(px(a), py(a)); }
  }
  ctx.stroke();

  // Stitches, fading out toward the edge where they turn away from us.
  ctx.strokeStyle = ink;
  if (r < 9) {
    // Too small for single stitches: draw the seam as a red line.
    ctx.lineWidth = Math.max(0.8, r * 0.12);
    ctx.beginPath();
    for (let i = 0; i <= view.length; i++) {
      const a = view[i % view.length], b = view[(i + view.length - 1) % view.length];
      if (a[2] > 0.05 && b[2] > 0.05) { ctx.moveTo(px(b), py(b)); ctx.lineTo(px(a), py(a)); }
    }
    ctx.stroke();
  } else {
    ctx.lineWidth = Math.max(0.9, r * 0.034);
    for (const legs of stitches) {
      for (const [s, e] of legs) {
        const a = apply(M, s), b = apply(M, e);
        const z = Math.min(a[2], b[2]);
        if (z <= 0) continue;
        ctx.globalAlpha = Math.min(1, z * 5);
        ctx.beginPath(); ctx.moveTo(px(a), py(a)); ctx.lineTo(px(b), py(b)); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  if (shade) {
    // Soft shadow on the side away from the light, over the stitches too.
    const s = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.2, cx - r * 0.05, cy - r * 0.05, r * 1.08);
    s.addColorStop(0, 'rgba(255,255,255,0)');
    s.addColorStop(0.65, 'rgba(70,50,30,0)');
    s.addColorStop(1, 'rgba(70,50,30,.32)');
    ctx.fillStyle = s;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  ctx.restore();
  if (outline && r > 6) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2); ctx.stroke();
  }
}

// The ball's spin as a rotation matrix at time t (seconds of real time), given a base
// orientation M0 and the spin axis in view space.
export function spun(M0, viewAxis, radians) {
  return mul(rotation(viewAxis, radians), M0);
}

export { apply };
