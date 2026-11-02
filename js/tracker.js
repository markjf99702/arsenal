// Drawn over the view from behind the plate during an at-bat: the batter in his box, and each pitch so far
// where it crossed the plate, numbered, the way a broadcast's pitch tracker shows them.
import { PLATE_Y, catcherCamera } from './flight.js';

// Result colours, as broadcasts use them: green for a ball, red for a strike, blue for a ball in play.
export const MARK = { ball: '#2f9e5f', strike: '#d6463e', play: '#3a78d4' };
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

// Each pitch where it crossed. One that crossed below the bottom edge (it bounced) sits on the edge with a notch
// under its number, pointing down: lower than this. `grow` is how many times its size the newest is drawn (growth).
export function drawMarks(ctx, cam, marks, { grow = 1 } = {}) {
  const r0 = markRadius(cam);
  const floor = cam.H - r0 - 2;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  marks.forEach((m, i) => {
    const p = cam.project([m.x, PLATE_Y, m.z]);
    const low = p.y > floor, y = Math.min(p.y, floor);
    const last = i === marks.length - 1, r = last ? r0 * grow : r0;
    ctx.globalAlpha = last ? 1 : 0.88;
    ctx.fillStyle = MARK[m.kind];
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(1.5, r * (last ? 0.26 : 0.16));
    ctx.beginPath(); ctx.arc(p.x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.round(r * 1.15)}px "Barlow Condensed", system-ui, sans-serif`;
    ctx.fillText(String(m.n), p.x, y + r * (low ? -0.18 : 0.06));
    if (low) {
      ctx.beginPath();
      ctx.moveTo(p.x - r * 0.34, y + r * 0.4); ctx.lineTo(p.x + r * 0.34, y + r * 0.4); ctx.lineTo(p.x, y + r * 0.76);
      ctx.closePath(); ctx.fill();
    }
  });
  ctx.restore();
}

// The batter's box he's standing in, shaded, so it's clear which side he hits from.
export function drawBatter(ctx, cam, batter, dark) {
  const sx = batter === 'R' ? -1 : 1; // a right-handed batter stands on the catcher's left
  const pts = [[1.208, -2.29], [5.208, -2.29], [5.208, 3.71], [1.208, 3.71]].map(([x, y]) => cam.project([sx * x, y, 0.01]));
  ctx.save();
  ctx.fillStyle = dark ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.28)';
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
