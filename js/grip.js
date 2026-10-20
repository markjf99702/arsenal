// Grip drawings: the ball as the pitcher sees it from behind, just before letting go,
// with the fingers laid over it. Positions are in ball radii from the centre, y down.
import { drawBall, orientFacing, FOUR, TWO } from './ball.js';
import { mul, rotation } from './math3.js';

const S = Math.SQRT1_2;
// Ball orientations. Each names the spin axis (on screen), a point on the ball and where it faces.
const BALLS = {
  // Four-seam: the horseshoe's top seam runs across the top, its U-turn on the ring-finger side.
  four: [FOUR, [1, 0, 0], [1, 0, 0], [0, 0.5, 0.87]],
  // Two-seam: the two seams that run closest together go straight up the back of the ball.
  two: [TWO, [1, 0, 0], [0, 0, 1], [0, 0.35, 0.94]],
  // Knuckleball: the horseshoe sits up top so the fingertips can dig in just under it.
  knuckle: [FOUR, [1, 0, 0], [1, 0, 0], [0, 0.72, 0.69]],
};

// A finger: [base x, base y, tip x, tip y, width, kind]; kind 'nail' bends the tip into the leather.
const F = (bx, by, tx, ty, w = 0.42, kind = '') => ({ bx, by, tx, ty, w, kind });

export const GRIPS = {
  FF: { ball: 'four', fingers: [F(-0.3, 1.7, -0.25, -0.86), F(0.22, 1.7, 0.25, -0.9), F(0.72, 1.62, 0.9, 0.45, 0.38)], thumb: [-0.05, 0.86] },
  SI: { ball: 'two', fingers: [F(-0.46, 1.7, -0.44, -0.84), F(0.44, 1.7, 0.45, -0.88), F(0.95, 1.6, 1.0, 0.62, 0.36)], thumb: [0, 0.86] },
  FC: { ball: 'four', fingers: [F(0.02, 1.7, 0.04, -0.86), F(0.47, 1.7, 0.5, -0.82), F(0.95, 1.55, 1.02, 0.55, 0.36)], thumb: [0.12, 0.88] },
  SL: { ball: 'two', turn: -12, fingers: [F(0.02, 1.7, 0.06, -0.84), F(0.46, 1.7, 0.46, -0.86), F(0.86, 1.55, 0.92, 0.62, 0.36)], thumb: [-0.25, 0.85] },
  ST: { ball: 'two', turn: -26, fingers: [F(0.16, 1.72, 0.2, -0.86), F(0.58, 1.68, 0.56, -0.76), F(0.95, 1.5, 0.92, 0.6, 0.36)], thumb: [-0.35, 0.82] },
  CU: { ball: 'two', turn: 28, fingers: [F(-0.02, 1.72, -0.1, -0.84), F(0.42, 1.7, 0.36, -0.9), F(0.9, 1.58, 0.98, 0.58, 0.36)], thumb: [-0.28, 0.84] },
  KC: { ball: 'two', turn: 28, fingers: [F(-0.04, 1.72, -0.06, -0.18, 0.42, 'nail'), F(0.42, 1.7, 0.36, -0.9), F(0.9, 1.58, 0.98, 0.58, 0.36)], thumb: [-0.28, 0.84] },
  SV: { ball: 'two', turn: 10, fingers: [F(0.06, 1.72, 0.02, -0.86), F(0.5, 1.7, 0.44, -0.86), F(0.98, 1.55, 1.02, 0.6, 0.36)], thumb: [-0.3, 0.84] },
  CH: { ball: 'two', circle: true, fingers: [F(-0.44, 1.7, -0.44, -0.84), F(0.44, 1.7, 0.45, -0.82), F(0.98, 1.55, 1.03, 0.55, 0.34)], thumb: null },
  FS: { ball: 'two', fingers: [F(-0.55, 1.72, -0.72, -0.72), F(0.55, 1.72, 0.72, -0.76), F(1.05, 1.55, 1.05, 0.62, 0.36)], thumb: [0, 0.86] },
  FO: { ball: 'two', fingers: [F(-0.42, 1.72, -1.0, -0.42), F(0.42, 1.72, 1.0, -0.46), F(1.18, 1.4, 1.12, 0.78, 0.34)], thumb: [0, 0.9] },
  KN: { ball: 'knuckle', fingers: [F(-0.3, 1.72, -0.25, -0.38, 0.42, 'nail'), F(0.22, 1.72, 0.25, -0.42, 0.42, 'nail'), F(0.8, 1.6, 0.92, 0.35, 0.38)], thumb: [-0.05, 0.86] },
  EP: { ball: 'four', fingers: [F(-0.3, 1.7, -0.25, -0.86), F(0.22, 1.7, 0.25, -0.9), F(0.72, 1.62, 0.9, 0.45, 0.38)], thumb: [-0.05, 0.86] },
};

const SKIN = { fill: '220,174,138', line: '111,74,51', nail: '246,228,214' };
// Where a finger is off the ball, the page shows through it, and the dark theme's page turns it a muddy brown. So a
// solid layer of the light theme's paper goes under those parts first: on either page they come out the light skin
// tone they have on the ball, and on the ball the seams still show through.
const UNDER = '246,241,230';

// Clips to everything outside the ball.
function offBall(ctx, R) {
  ctx.beginPath();
  ctx.rect(-4 * R, -4 * R, 8 * R, 8 * R);
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.clip('evenodd');
}

// Draws one grip into a canvas. `lefty` mirrors it.
export function drawGrip(ctx, w, h, code, { lefty = false } = {}) {
  const g = GRIPS[code];
  ctx.clearRect(0, 0, w, h);
  const R = Math.min(w, h) * 0.36;
  const cx = w / 2, cy = h * 0.47;
  const turn = ((g.turn || 0) * Math.PI) / 180;
  ctx.save();
  ctx.translate(cx, cy);
  if (lefty) ctx.scale(-1, 1);
  const [la, va, lp, face] = BALLS[g.ball];
  let M = orientFacing(la, va, lp, face);
  if (turn) M = mul(rotation([0, 0, 1], -turn), M);
  drawBall(ctx, 0, 0, R, M);
  ctx.rotate(turn);
  // The thumb is underneath, so it shows as a dashed outline.
  if (g.thumb) {
    const [x, y] = g.thumb;
    ctx.save();
    ctx.setLineDash([R * 0.07, R * 0.05]);
    ctx.strokeStyle = `rgba(${SKIN.line},.9)`;
    ctx.lineWidth = Math.max(1.3, R * 0.024);
    ctx.fillStyle = `rgba(${SKIN.fill},.25)`;
    ctx.beginPath(); ctx.ellipse(x * R, y * R, R * 0.25, R * 0.17, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  if (g.circle) circleOK(ctx, R);
  // Fingers, outermost first so the index finger sits on top.
  [...g.fingers].reverse().forEach(f => finger(ctx, f, R));
  ctx.restore();
}

// A see-through finger that fades out toward the hand, so the seams show underneath.
function finger(ctx, f, R) {
  const bx = f.bx * R, by = f.by * R, tx = f.tx * R, ty = f.ty * R, w = f.w * R;
  const ang = Math.atan2(ty - by, tx - bx);
  const L = Math.hypot(tx - bx, ty - by);
  const along = (a0, a1, rgb) => {
    const gr = ctx.createLinearGradient(0, 0, L, 0);
    gr.addColorStop(0, `rgba(${rgb},0)`);
    gr.addColorStop(0.3, `rgba(${rgb},${a0})`);
    gr.addColorStop(1, `rgba(${rgb},${a1})`);
    return gr;
  };
  const outline = () => {
    ctx.beginPath();
    ctx.moveTo(0, -w / 2);
    ctx.lineTo(L - w / 2, -w / 2);
    ctx.arc(L - w / 2, 0, w / 2, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(0, w / 2);
  };
  // Off the ball, the solid layer underneath, fading toward the hand like the finger.
  ctx.save();
  offBall(ctx, R);
  ctx.translate(bx, by);
  ctx.rotate(ang);
  outline();
  ctx.fillStyle = along(1, 1, UNDER);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(ang);
  outline();
  ctx.fillStyle = along(0.42, 0.5, SKIN.fill);
  ctx.fill();
  ctx.strokeStyle = along(0.9, 0.95, SKIN.line);
  ctx.lineWidth = Math.max(1.4, R * 0.026);
  ctx.stroke();
  // Knuckle creases.
  ctx.strokeStyle = `rgba(${SKIN.line},.4)`;
  ctx.lineWidth = Math.max(1, R * 0.016);
  for (const k of f.kind === 'nail' ? [0.55] : [0.5, 0.74]) {
    const x = L * k;
    ctx.beginPath(); ctx.moveTo(x - w * 0.05, -w * 0.3); ctx.quadraticCurveTo(x + w * 0.06, 0, x - w * 0.05, w * 0.3); ctx.stroke();
  }
  // Fingernail (we see the back of the finger).
  ctx.fillStyle = `rgba(${SKIN.nail},.85)`;
  ctx.strokeStyle = `rgba(${SKIN.line},.75)`;
  ctx.lineWidth = Math.max(1, R * 0.018);
  ctx.beginPath();
  if (f.kind === 'nail') ctx.ellipse(L - w * 0.22, 0, w * 0.14, w * 0.3, 0, 0, Math.PI * 2);
  else ctx.ellipse(L - w * 0.36, 0, w * 0.28, w * 0.25, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

// Changeup: the index finger curls round to meet the thumb, making an O on the side of the ball.
function circleOK(ctx, R) {
  const x = -0.86 * R, y = 0.22 * R, r = R * 0.27, w = R * 0.19;
  ctx.save();
  ctx.lineWidth = w;
  // Off the ball, the solid layer underneath, as for the other fingers.
  ctx.save();
  offBall(ctx, R);
  ctx.strokeStyle = `rgb(${UNDER})`;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = `rgba(${SKIN.fill},.55)`;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = Math.max(1.4, R * 0.026);
  ctx.strokeStyle = `rgba(${SKIN.line},.9)`;
  for (const rr of [r - w / 2, r + w / 2]) { ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.stroke(); }
  // Where fingertip meets thumb.
  ctx.beginPath(); ctx.moveTo(x + (r - w / 2) * 0.7, y - (r - w / 2) * 0.7); ctx.lineTo(x + (r + w / 2) * 0.7, y - (r + w / 2) * 0.7); ctx.stroke();
  ctx.restore();
}
