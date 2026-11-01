// Drawn over the view from behind the plate during an at-bat: the batter in his box, and each pitch so far
// where it crossed the plate, numbered, the way a broadcast's pitch tracker shows them.
import { PLATE_Y } from './flight.js';

// Result colours, as broadcasts use them: green for a ball, red for a strike, blue for a ball in play.
export const MARK = { ball: '#2f9e5f', strike: '#d6463e', play: '#3a78d4' };
export const markKind = result => (result === 'ball' || result === 'hbp' ? 'ball' : result === 'inplay' ? 'play' : 'strike');

export function drawMarks(ctx, cam, marks) {
  const r = Math.max(7 * (cam.dpr || 1), cam.project([0, PLATE_Y, 2.5]).k * 0.16);
  ctx.save();
  ctx.font = `700 ${Math.round(r * 1.15)}px "Barlow Condensed", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  marks.forEach((m, i) => {
    const p = cam.project([m.x, PLATE_Y, m.z]);
    const last = i === marks.length - 1;
    ctx.globalAlpha = last ? 1 : 0.88;
    ctx.fillStyle = MARK[m.kind];
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(1.5, r * (last ? 0.26 : 0.16));
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillText(String(m.n), p.x, p.y + r * 0.06);
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
