// The flight of a pitch, and the scenes it's drawn in.
// World coordinates are Statcast's, in feet: x to the catcher's right, y from the back tip of
// home plate toward the mound, z up. The front of the plate is at y = 17/12, the rubber at y = 60.5.
import { drawBall, orient, FOUR, TWO, DOT } from './ball.js';
import { apply, cross, norm, add, scale, dot } from './math3.js';

export const G = 32.174;
export const MPH = 5280 / 3600;
export const PLATE_Y = 17 / 12;
const RUBBER_Y = 60.5;
const BALL_R = 1.45 / 12;
const DRAG = 0.915; // speed at the plate over speed out of the hand (air takes ~8%)
export const DECIDE = 0.175; // seconds before the plate: where a hitter has to commit
const ZONE = { left: -17 / 24, right: 17 / 24, bottom: 1.6, top: 3.4 };

const LOCAL_AXIS = { four: FOUR, two: TWO, dot: DOT };

// A thrown pitch: position over time, the no-spin path for comparison, and how the ball turns.
export function throwPitch(p, { hand = 'R', jitter = [0, 0], release = null, rng = Math.random } = {}) {
  const n = p.n;
  const sgn = hand === 'R' ? 1 : -1;
  const rel = release || { x: (p.side ?? -1.85) * sgn, y: RUBBER_Y - n.extension, z: n.height };
  const v0 = n.mph * MPH, vf = v0 * DRAG;
  const D = rel.y - PLATE_Y;
  const T = (2 * D) / (v0 + vf);
  const ay = (v0 - vf) / T;
  // Spin-induced movement over the flight, as accelerations. A right-hander's arm side is the catcher's left.
  const mx = (-sgn * n.arm) / 12, mz = n.rise / 12;
  const ax = (2 * mx) / (T * T), az = -G + (2 * mz) / (T * T);
  const tx = p.target[0] * sgn + jitter[0], tz = p.target[1] + jitter[1];
  const vx = (tx - rel.x - 0.5 * ax * T * T) / T;
  const vz = (tz - rel.z - 0.5 * az * T * T) / T;

  // A knuckleball's push keeps changing as its seams slowly turn: a few random wobbles.
  const wob = [];
  if (p.code === 'KN') {
    for (let i = 0; i < 3; i++) {
      wob.push({ w: 2 * Math.PI * (1.2 + rng() * 2.6), ax: (rng() - 0.5) * 0.34, az: (rng() - 0.5) * 0.3 });
    }
  }
  const wobble = t => {
    let x = 0, z = 0;
    for (const k of wob) { const f = 1 - Math.cos(k.w * t); x += k.ax * f; z += k.az * f; }
    return [x, z];
  };

  const pos = t => {
    const [wx, wz] = wobble(t);
    return [rel.x + vx * t + 0.5 * ax * t * t + wx, rel.y - v0 * t + 0.5 * ay * t * t, rel.z + vz * t + 0.5 * az * t * t + wz];
  };
  const ghost = t => [rel.x + vx * t, rel.y - v0 * t + 0.5 * ay * t * t, rel.z + vz * t - 0.5 * G * t * t];

  // Spin axis: the part that moves the ball sits square to both the flight and the movement;
  // the rest (bullet spin) points along the flight.
  const fwd = [0, -1, 0];
  let move = norm([mx, 0, mz]);
  if (p.code === 'KN') move = norm([rng() - 0.5, 0, rng() - 0.5]);
  const active = (n.active ?? p.active ?? 65) / 100;
  const transverse = cross(fwd, move);
  const axis = norm(add(scale(transverse, active), scale(fwd, Math.sqrt(Math.max(0, 1 - active * active)) * sgn)));
  const rps = (n.rpm || 0) / 60;

  return {
    p, hand, T, release: rel, pos, ghost, axis, rps,
    seam: LOCAL_AXIS[p.seam] || FOUR,
    phase: rng() * Math.PI * 2,
    end: pos(T),
    ghostEnd: ghost(T),
    decide: pos(Math.max(0, T - DECIDE)),
    speedAtPlate: vf / MPH,
  };
}

// The highest point of a flight (for fitting the eephus in frame).
export function apex(f) {
  let top = 0;
  for (let i = 0; i <= 40; i++) top = Math.max(top, f.pos((f.T * i) / 40)[2]);
  return top;
}

// ---------------------------------------------------------------- cameras

// Behind the plate at a crouching umpire's eye height, looking out at the mound.
export function catcherCamera(W, H, { lift = 0 } = {}) {
  const eye = [0, -9.5, 4.3];
  const pitch = (4.6 - lift) * (Math.PI / 180);
  const fwd = [0, Math.cos(pitch), -Math.sin(pitch)];
  const up = [0, Math.sin(pitch), Math.cos(pitch)];
  const right = [1, 0, 0];
  const hfov = W / H > 1.2 ? 31 : 29;
  const F = W / 2 / Math.tan((hfov * Math.PI) / 360);
  const cy = H * 0.5;
  const toCam = P => { const d = [P[0] - eye[0], P[1] - eye[1], P[2] - eye[2]]; return [dot(d, right), dot(d, up), dot(d, fwd)]; };
  const fromCam = ([X, Y, Z]) => [W / 2 + (F * X) / Z, cy - (F * Y) / Z];
  return {
    kind: 'catcher', W, H, F, eye, toCam, fromCam,
    project(P) { const c = toCam(P); return { x: W / 2 + (F * c[0]) / c[2], y: cy - (F * c[1]) / c[2], depth: c[2], k: F / c[2] }; },
    // World direction -> view space (x right, y up, z toward the viewer), for turning the ball.
    view: v => [dot(v, right), dot(v, up), -dot(v, fwd)],
    ballR: depth => Math.max(1.2, (F * BALL_R) / depth),
  };
}

// From the third-base side: the pitcher on the left, the plate on the right.
// Heights are stretched so the drop shows; `stretch` says by how much.
export function sideCamera(W, H, { top = 7.5 } = {}) {
  const padL = W * 0.05, padR = W * 0.05;
  const y0 = 62.5, y1 = -3;
  const kx = (W - padL - padR) / (y0 - y1);
  const ground = H * 0.86;
  const usable = ground - H * 0.08;
  const stretch = Math.max(1, Math.min(6, usable / (top * kx)));
  const kz = kx * stretch;
  return {
    kind: 'side', W, H, kx, kz, ground, stretch,
    project(P) { return { x: padL + (y0 - P[1]) * kx, y: ground - P[2] * kz, depth: 10, k: kx }; },
    view: v => [-v[1], v[2], -v[0]],
    ballR: () => Math.max(4, W / 150),
  };
}

// From above: the pitcher on the left, the plate on the right, first base at the top.
export function topCamera(W, H) {
  const padL = W * 0.05, padR = W * 0.05;
  const y0 = 62.5, y1 = -3;
  const kx = (W - padL - padR) / (y0 - y1);
  // Stretch sideways so about 3.4 feet either side of centre fills the height.
  const stretch = Math.max(2.5, Math.min(8, H / 2 / (3.4 * kx)));
  const ky = kx * stretch;
  const mid = H * 0.5;
  return {
    kind: 'top', W, H, kx, ky, stretch,
    project(P) { return { x: padL + (y0 - P[1]) * kx, y: mid - P[0] * ky, depth: 10, k: kx }; },
    view: v => [-v[1], v[0], v[2]],
    ballR: () => Math.max(4, W / 150),
  };
}

// ---------------------------------------------------------------- scenery

export function palette(dark) {
  return dark
    ? { skyTop: '#0b1020', skyLow: '#1d2a44', stands: '#0e1422', wall: '#123326', grassFar: '#1c4a2b', grassNear: '#1f5530', dirt: '#6b4a32', dirtDark: '#5a3e2a', chalk: 'rgba(240,236,226,.85)', plate: '#f2eee4', zone: 'rgba(255,255,255,.55)', zoneFill: 'rgba(255,255,255,.06)', text: '#e9e5dc', ghost: 'rgba(235,235,235,.75)', lights: true }
    : { skyTop: '#8fbbe0', skyLow: '#d6e7f2', stands: '#7f8d9b', wall: '#1f5a3c', grassFar: '#5f9a4e', grassNear: '#3f8540', dirt: '#b98a5e', dirtDark: '#a77a51', chalk: 'rgba(255,255,255,.95)', plate: '#ffffff', zone: 'rgba(255,255,255,.85)', zoneFill: 'rgba(255,255,255,.09)', text: '#132018', ghost: 'rgba(255,255,255,.9)', lights: false };
}

// Clip a polygon of camera-space points against the near plane, then project it.
function poly(ctx, cam, pts, near = 0.4) {
  const c = pts.map(cam.toCam);
  const out = [];
  for (let i = 0; i < c.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length];
    const ain = a[2] >= near, bin = b[2] >= near;
    if (ain) out.push(a);
    if (ain !== bin) { const t = (near - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, near]); }
  }
  if (out.length < 3) return false;
  ctx.beginPath();
  out.forEach((p, i) => { const [x, y] = cam.fromCam(p); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
  ctx.closePath();
  return true;
}

const circle = (cx, cy, r, n = 48, z = 0) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI), z]);

function chalkLine(ctx, cam, a, b, w = 0.25) {
  const d = norm([b[0] - a[0], b[1] - a[1], 0]);
  const s = [-d[1] * (w / 2), d[0] * (w / 2), 0];
  if (poly(ctx, cam, [add(a, s), add(b, s), add(b, scale(s, -1)), add(a, scale(s, -1))])) ctx.fill();
}

export function drawCatcherField(ctx, cam, c) {
  const { W, H } = cam;
  const horizon = cam.project([0, 5000, cam.eye[2]]).y;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, c.skyTop); sky.addColorStop(1, c.skyLow);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, horizon + 1);
  // Stands and outfield wall, far away.
  const arc = (r, z, a0 = -50, a1 = 50, n = 30) => Array.from({ length: n + 1 }, (_, i) => { const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180; return [r * Math.sin(a), r * Math.cos(a), z]; });
  ctx.fillStyle = c.stands;
  if (poly(ctx, cam, [...arc(440, 8), ...arc(440, 24).reverse()])) ctx.fill();
  if (c.lights) {
    for (const a of [-38, -14, 14, 38]) {
      const r = (a * Math.PI) / 180;
      const p = cam.project([460 * Math.sin(r), 460 * Math.cos(r), 60]);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, W * 0.05);
      g.addColorStop(0, 'rgba(255,250,230,.95)'); g.addColorStop(0.15, 'rgba(255,245,215,.5)'); g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g; ctx.fillRect(p.x - W * 0.05, p.y - W * 0.05, W * 0.1, W * 0.1);
    }
  }
  ctx.fillStyle = c.wall;
  if (poly(ctx, cam, [...arc(400, 0), ...arc(400, 9).reverse()])) ctx.fill();
  // Grass.
  const grass = ctx.createLinearGradient(0, horizon, 0, H);
  grass.addColorStop(0, c.grassFar); grass.addColorStop(1, c.grassNear);
  ctx.fillStyle = grass;
  if (poly(ctx, cam, [...arc(400, 0, -50, 50).reverse(), [0, -40, 0]])) ctx.fill();
  else ctx.fillRect(0, horizon, W, H - horizon);
  // Infield dirt: the arc 95 feet from the rubber, inside the foul lines.
  const skin = [[0, 0, 0], [90.2, 90.2, 0]];
  for (let i = 0; i <= 40; i++) { const a = ((18.2 + (143.6 * i) / 40) * Math.PI) / 180; skin.push([95 * Math.cos(a), RUBBER_Y + 95 * Math.sin(a), 0]); }
  skin.push([-90.2, 90.2, 0]);
  ctx.fillStyle = c.dirt;
  if (poly(ctx, cam, skin)) ctx.fill();
  ctx.fillStyle = c.grassFar;
  if (poly(ctx, cam, [[0, 9, 0], [57.6, 63.6, 0], [0, 118, 0], [-57.6, 63.6, 0]])) ctx.fill();
  // Mound and home-plate circle.
  ctx.fillStyle = c.dirt;
  if (poly(ctx, cam, circle(0, 59, 9, 40, 0.15))) ctx.fill();
  if (poly(ctx, cam, circle(0, 0.7, 13, 64))) ctx.fill();
  ctx.fillStyle = c.chalk;
  if (poly(ctx, cam, [[-1, RUBBER_Y, 0.85], [1, RUBBER_Y, 0.85], [1, RUBBER_Y + 0.5, 0.85], [-1, RUBBER_Y + 0.5, 0.85]])) ctx.fill();
  // Chalk: foul lines and batter's boxes.
  chalkLine(ctx, cam, [0.7, 0.7, 0], [300, 300, 0]);
  chalkLine(ctx, cam, [-0.7, 0.7, 0], [-300, 300, 0]);
  for (const sx of [1, -1]) {
    const x0 = sx * 1.208, x1 = sx * 5.208, ya = -2.29, yb = 3.71;
    chalkLine(ctx, cam, [x0, ya, 0], [x0, yb, 0], 0.22);
    chalkLine(ctx, cam, [x1, ya, 0], [x1, yb, 0], 0.22);
    chalkLine(ctx, cam, [x0, yb, 0], [x1, yb, 0], 0.22);
    chalkLine(ctx, cam, [x0, ya, 0], [x1, ya, 0], 0.22);
  }
  // Home plate.
  ctx.fillStyle = c.plate;
  if (poly(ctx, cam, [[-0.708, PLATE_Y, 0.02], [0.708, PLATE_Y, 0.02], [0.708, 0.708, 0.02], [0, 0, 0.02], [-0.708, 0.708, 0.02]])) ctx.fill();
}

export function drawZone(ctx, cam, c) {
  const pts = [[ZONE.left, PLATE_Y, ZONE.bottom], [ZONE.right, PLATE_Y, ZONE.bottom], [ZONE.right, PLATE_Y, ZONE.top], [ZONE.left, PLATE_Y, ZONE.top]].map(p => cam.project(p));
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = c.zoneFill; ctx.fill();
  ctx.strokeStyle = c.zone; ctx.lineWidth = Math.max(1, cam.W / 600); ctx.stroke();
  // Thirds, faintly.
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  for (const k of [1 / 3, 2 / 3]) {
    const a = cam.project([ZONE.left + (ZONE.right - ZONE.left) * k, PLATE_Y, ZONE.bottom]), b = cam.project([ZONE.left + (ZONE.right - ZONE.left) * k, PLATE_Y, ZONE.top]);
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    const d = cam.project([ZONE.left, PLATE_Y, ZONE.bottom + (ZONE.top - ZONE.bottom) * k]), e = cam.project([ZONE.right, PLATE_Y, ZONE.bottom + (ZONE.top - ZONE.bottom) * k]);
    ctx.moveTo(d.x, d.y); ctx.lineTo(e.x, e.y);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawSideField(ctx, cam, c) {
  const { W, H } = cam;
  const g = ctx.createLinearGradient(0, 0, 0, cam.ground);
  g.addColorStop(0, c.skyTop); g.addColorStop(1, c.skyLow);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, cam.ground);
  ctx.fillStyle = c.grassNear; ctx.fillRect(0, cam.ground, W, H - cam.ground);
  // Mound: 10 inches high, flat on top, sloping toward the plate.
  ctx.fillStyle = c.dirt;
  const m = [[0, 69], [0, 64.5], [0.83, 62.5], [0.83, 60], [0, 53]].map(([z, y]) => cam.project([0, y, z]));
  ctx.beginPath(); m.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill();
  const rb = cam.project([0, RUBBER_Y, 0.85]), rb2 = cam.project([0, RUBBER_Y + 0.5, 0.85]);
  ctx.fillStyle = c.chalk; ctx.fillRect(rb.x, rb.y - 3, Math.max(3, rb2.x - rb.x), 3);
  // Dirt around the plate, the plate, and the zone as a bar.
  const d0 = cam.project([0, 13.7, 0]), d1 = cam.project([0, -12.3, 0]);
  ctx.fillStyle = c.dirt; ctx.fillRect(d0.x, cam.ground, d1.x - d0.x, Math.max(4, H * 0.02));
  const p0 = cam.project([0, PLATE_Y, 0]), p1 = cam.project([0, 0, 0]);
  ctx.fillStyle = c.plate; ctx.fillRect(p0.x, cam.ground - 2, Math.max(3, p1.x - p0.x), 3);
  const zb = cam.project([0, PLATE_Y, ZONE.bottom]), zt = cam.project([0, PLATE_Y, ZONE.top]);
  ctx.fillStyle = c.zoneFill; ctx.fillRect(zb.x - 3, zt.y, Math.max(6, p1.x - p0.x + 6), zb.y - zt.y);
  ctx.strokeStyle = c.zone; ctx.lineWidth = 1.5;
  ctx.strokeRect(zb.x - 3, zt.y, Math.max(6, p1.x - p0.x + 6), zb.y - zt.y);
  // Distance marks every 10 feet.
  ctx.fillStyle = c.text; ctx.globalAlpha = 0.7;
  ctx.font = `500 ${Math.round(Math.max(11 * (cam.dpr || 1), W / 70))}px Barlow, system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let y = 10; y <= 60; y += 10) {
    const p = cam.project([0, y, 0]);
    ctx.fillRect(p.x - 0.5, cam.ground, 1, 6);
    ctx.fillText(`${y} ft`, p.x, cam.ground + 8 * (cam.dpr || 1));
  }
  ctx.globalAlpha = 1;
}

export function drawTopField(ctx, cam, c, hand = 'R') {
  const { W, H } = cam;
  ctx.fillStyle = c.grassNear; ctx.fillRect(0, 0, W, H);
  const P = (x, y) => cam.project([x, y, 0]);
  // Mowing stripes every 10 feet.
  ctx.fillStyle = c.grassFar;
  for (let y = 0; y < 70; y += 20) { const a = P(0, y), b = P(0, y + 10); ctx.fillRect(Math.min(a.x, b.x), 0, Math.abs(b.x - a.x), H); }
  // Mound (stretched like everything sideways), rubber, batter's boxes, plate.
  const m = P(0, 59);
  ctx.fillStyle = c.dirt;
  ctx.beginPath(); ctx.ellipse(m.x, m.y, 9 * cam.kx, 9 * cam.ky, 0, 0, Math.PI * 2); ctx.fill();
  const d0 = P(0, 8), d1 = P(0, -3);
  ctx.fillRect(d0.x, 0, W - d0.x, H);
  ctx.fillStyle = c.chalk;
  const r0 = P(-1, RUBBER_Y), r1 = P(1, RUBBER_Y + 0.5);
  ctx.fillRect(Math.min(r0.x, r1.x), Math.min(r0.y, r1.y), Math.abs(r1.x - r0.x), Math.abs(r1.y - r0.y));
  ctx.strokeStyle = c.chalk; ctx.lineWidth = Math.max(1.5, W / 500);
  for (const sx of [1, -1]) {
    const a = P(sx * 1.208, -2.29), b = P(sx * 5.208, 3.71);
    ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  }
  ctx.fillStyle = c.plate;
  ctx.beginPath();
  [[-0.708, PLATE_Y], [0.708, PLATE_Y], [0.708, 0.708], [0, 0], [-0.708, 0.708]].forEach(([x, y], i) => { const p = P(x, y); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
  ctx.closePath(); ctx.fill();
  // Straight line from rubber to plate, for reference.
  ctx.save();
  ctx.setLineDash([4, 6]); ctx.strokeStyle = c.chalk; ctx.globalAlpha = 0.45; ctx.lineWidth = 1;
  const a = P(0, RUBBER_Y), b = P(0, 0);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.restore();
  // Which side is which. Up the screen is first base.
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.font = `600 ${Math.round(Math.max(12 * (cam.dpr || 1), W / 60))}px "Barlow Condensed", system-ui, sans-serif`;
  ctx.textAlign = 'left';
  const armUp = hand === 'L';
  ctx.textBaseline = 'top'; ctx.fillText(armUp ? '↑ ARM SIDE' : '↑ GLOVE SIDE', W * 0.05, 12 * (cam.dpr || 1));
  ctx.textBaseline = 'bottom'; ctx.fillText(armUp ? '↓ GLOVE SIDE' : '↓ ARM SIDE', W * 0.05, H - 10 * (cam.dpr || 1));
}

// ---------------------------------------------------------------- the ball in flight

export function ballMatrix(f, cam, t) {
  const axisView = cam.view(f.axis);
  const M0 = orient(f.seam, axisView, f.phase);
  const angle = f.rps * 2 * Math.PI * t;
  return { M0, axisView, angle };
}

export function drawPath(ctx, cam, f, upTo, color, { dashed = false, width = 2, ghost = false } = {}) {
  const n = 60;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  if (dashed) ctx.setLineDash([width * 2.5, width * 2.5]);
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const t = Math.min(upTo, (f.T * i) / n);
    const P = ghost ? f.ghost(t) : f.pos(t);
    const s = cam.project(P);
    if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y);
    if (t >= upTo) break;
  }
  ctx.stroke();
  ctx.restore();
}

export { drawBall, apply, BALL_R };
