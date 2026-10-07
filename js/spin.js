// The spin panel: the ball turning on its real axis, slowed down, with the axis and a tilt clock.
import { drawBall, orient, spun, FOUR, TWO, DOT } from './ball.js';
import { cross, norm, add, scale } from './math3.js';

export const SLOW = 40; // shown this many times slower than real

const LOCAL = { four: FOUR, two: TWO, dot: DOT };
// Views of a world direction: x right, y up, z toward the viewer.
const VIEWS = {
  behind: v => [-v[0], v[2], v[1]], // standing behind the pitcher, looking at the plate
  side: v => [-v[1], v[2], -v[0]], // from the third-base side, ball flying left to right
};

// The spin axis and movement direction of a pitch, in world space (see flight.js).
export function spinOf(p, hand = 'R') {
  const n = p.n, sgn = hand === 'R' ? 1 : -1;
  const fwd = [0, -1, 0];
  let move = norm([(-sgn * n.arm) / 12, 0, n.rise / 12]);
  if (p.code === 'KN') move = norm([0.3, 0, 1]);
  const active = (n.active ?? p.active ?? 65) / 100;
  const axis = norm(add(scale(cross(fwd, move), active), scale(fwd, Math.sqrt(Math.max(0, 1 - active * active)) * sgn)));
  return { axis, move, active, rps: (n.rpm || 0) / 60 };
}

// Tilt as a clock reading, seen from behind the pitcher: where the spin pushes the ball.
export function tilt(p, hand = 'R') {
  const { move } = spinOf(p, hand);
  const v = VIEWS.behind(move);
  let a = Math.atan2(v[0], v[1]);
  if (a < 0) a += Math.PI * 2;
  let minutes = Math.round(((a / (Math.PI * 2)) * 720) / 15) * 15;
  let h = Math.floor(minutes / 60) % 12, m = minutes % 60;
  if (h === 0) h = 12;
  return { text: `${h}:${String(m).padStart(2, '0')}`, angle: a };
}

export class SpinPanel {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.view = 'behind';
    this.hand = 'R';
    this.start = performance.now();
    this.colors = { ink: '#1b2230', muted: '#6b7282', accent: '#c8202f', ring: '#d9d0bf' };
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    const loop = () => { this.draw(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
    // Stop drawing while it's off screen.
    new IntersectionObserver(([e]) => {
      cancelAnimationFrame(this.raf);
      if (e.isIntersecting) this.raf = requestAnimationFrame(loop);
    }).observe(canvas);
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
  }

  set(o) {
    if (o.pitch && o.pitch !== this.pitch) { this.pitch = o.pitch; this.start = performance.now(); }
    Object.assign(this, o);
    if (this.pitch) {
      this.spin = spinOf(this.pitch, this.hand);
      this.M0 = null;
    }
  }

  draw() {
    const { ctx, canvas, pitch } = this;
    if (!pitch) return;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const view = VIEWS[this.view];
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.3;
    const axisV = view(this.spin.axis);
    const M0 = orient(LOCAL[pitch.seam] || FOUR, axisV, 0.6);
    const secs = this.reduced ? 0.15 : (performance.now() - this.start) / 1000;
    const angle = (this.spin.rps / SLOW) * 2 * Math.PI * secs;
    const lw = Math.max(1, W / 260);
    const c = this.colors;

    // Clock face (behind view): where the spin pushes the ball.
    if (this.view === 'behind') {
      ctx.strokeStyle = c.ring; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.36, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = c.muted;
      ctx.font = `600 ${Math.round(R * 0.17)}px "Barlow Condensed", system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let h = 1; h <= 12; h++) {
        const a = (h / 12) * Math.PI * 2;
        const x = cx + Math.sin(a) * R * 1.36, y = cy - Math.cos(a) * R * 1.36;
        if (h % 3 === 0) ctx.fillText(String(h), cx + Math.sin(a) * R * 1.58, cy - Math.cos(a) * R * 1.58);
        ctx.beginPath(); ctx.arc(x, y, lw * (h % 3 === 0 ? 2 : 1.2), 0, Math.PI * 2); ctx.fill();
      }
      const t = tilt(pitch, this.hand);
      if (pitch.code !== 'KN') {
        const a = t.angle;
        const x1 = cx + Math.sin(a) * R * 1.32, y1 = cy - Math.cos(a) * R * 1.32;
        const x0 = cx + Math.sin(a) * R * 1.04, y0 = cy - Math.cos(a) * R * 1.04;
        ctx.strokeStyle = c.accent; ctx.fillStyle = c.accent; ctx.lineWidth = lw * 2.4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        const hx = Math.sin(a), hy = -Math.cos(a), s = R * 0.13;
        ctx.beginPath();
        ctx.moveTo(x1 + hx * s, y1 + hy * s);
        ctx.lineTo(x1 - hy * s * 0.6, y1 + hx * s * 0.6);
        ctx.lineTo(x1 + hy * s * 0.6, y1 - hx * s * 0.6);
        ctx.closePath(); ctx.fill();
      }
    } else {
      // Side view: an arrow for the direction of flight.
      ctx.strokeStyle = c.muted; ctx.fillStyle = c.muted; ctx.lineWidth = lw * 1.5;
      const y = cy + R * 1.38;
      ctx.beginPath(); ctx.moveTo(cx - R * 0.9, y); ctx.lineTo(cx + R * 0.9, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + R * 1.05, y); ctx.lineTo(cx + R * 0.82, y - R * 0.1); ctx.lineTo(cx + R * 0.82, y + R * 0.1); ctx.closePath(); ctx.fill();
      ctx.font = `600 ${Math.round(R * 0.16)}px "Barlow Condensed", system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText('to the plate', cx, y - R * 0.08);
    }

    // The axis: behind the ball first, then the ball, then the near half.
    const ax = axisV, L = R * 1.5;
    const end = s => [cx + ax[0] * L * s, cy - ax[1] * L * s];
    const far = ax[2] >= 0 ? -1 : 1;
    ctx.strokeStyle = c.ink; ctx.lineWidth = lw * 1.8; ctx.lineCap = "round";
    ctx.setLineDash([lw * 3, lw * 3]);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(...end(far)); ctx.stroke();
    ctx.setLineDash([]);
    drawBall(ctx, cx, cy, R, spun(M0, axisV, angle));
    ctx.beginPath(); ctx.moveTo(cx + ax[0] * R * -far, cy - ax[1] * R * -far); ctx.lineTo(...end(-far)); ctx.stroke();
    ctx.fillStyle = c.ink;
    ctx.beginPath(); ctx.arc(...end(-far), lw * 2.6, 0, Math.PI * 2); ctx.fill();
  }
}
