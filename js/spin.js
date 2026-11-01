// The spin panel: the ball turning on its real axis, slowed down, with the axis and a tilt clock.
import { drawBall, orient, spun, FOUR, TWO, DOT } from './ball.js';
import { cross, norm, add, scale } from './math3.js';

export const SLOW = 40; // shown this many times slower than real
// The ball is the same cream on the light page and the dark one, so the axis is drawn over it in a fixed dark ink, and
// the end of the axis is ringed in the ball's cream to stand out from the seams.
const OVER_BALL = '#1b2230', CREAM = '#fbf7ee';
// The smallest the clock's numbers and "to the plate" are drawn, in CSS pixels.
const SMALLEST = 11;

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
    // It holds still where the device asks for less motion, and whenever it's stopped (toggle): then it's drawn only
    // when something has changed (dirty), in the pose it stopped in (`held`, seconds into its turning).
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.still = this.reduced;
    this.held = 0.15;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    const loop = () => {
      if (!this.still || this.dirty) { this.dirty = false; this.draw(); }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    // The clock's numbers are in Barlow Condensed, so draw again once the fonts are in.
    document.fonts?.ready.then(() => { this.dirty = true; });
    // Stop drawing while it's off screen.
    new IntersectionObserver(([e]) => {
      cancelAnimationFrame(this.raf);
      if (e.isIntersecting) this.raf = requestAnimationFrame(loop);
    }).observe(canvas);
  }

  // The page sets these from its palette, and again when the theme changes.
  get colors() { return this._colors; }
  set colors(c) { this._colors = c; this.dirty = true; }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.dirty = true; // setting the size clears the canvas
  }

  // Stop it where it is, or start it again from there. Returns whether it's still now.
  toggle() {
    if (this.still) this.start = performance.now() - this.held * 1000;
    else this.held = (performance.now() - this.start) / 1000;
    this.still = !this.still;
    this.dirty = true;
    return this.still;
  }

  set(o) {
    if (o.pitch && o.pitch !== this.pitch) { this.pitch = o.pitch; this.start = performance.now(); this.held = 0.15; }
    Object.assign(this, o);
    if (this.pitch) {
      this.spin = spinOf(this.pitch, this.hand);
      this.M0 = null;
    }
    this.dirty = true;
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
    const secs = this.still ? this.held : (performance.now() - this.start) / 1000;
    const angle = (this.spin.rps / SLOW) * 2 * Math.PI * secs;
    const lw = Math.max(1, W / 260);
    const c = this.colors;
    const px = size => Math.round(Math.max(size, SMALLEST * (this.dpr || 1)));
    const font = size => `600 ${px(size)}px "Barlow Condensed", system-ui, sans-serif`;

    // Clock face (behind view): where the spin pushes the ball.
    if (this.view === 'behind') {
      ctx.strokeStyle = c.ring; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.36, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = c.muted;
      ctx.font = font(R * 0.17);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // On a small panel the numbers are bigger than R would make them, so they come in a little to stay on it.
      const out = Math.min(R * 1.58, Math.min(W, H) / 2 - px(R * 0.17) * 0.5);
      for (let h = 1; h <= 12; h++) {
        const a = (h / 12) * Math.PI * 2;
        const x = cx + Math.sin(a) * R * 1.36, y = cy - Math.cos(a) * R * 1.36;
        if (h % 3 === 0) ctx.fillText(String(h), cx + Math.sin(a) * out, cy - Math.cos(a) * out);
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
      // Side view: an arrow for the direction of flight, a little lower where its words are bigger than R would make
      // them, so they stay clear of the ball.
      ctx.strokeStyle = c.muted; ctx.fillStyle = c.muted; ctx.lineWidth = lw * 1.5;
      const y = cy + R * 1.38 + (px(R * 0.16) - R * 0.16) * 0.5;
      ctx.beginPath(); ctx.moveTo(cx - R * 0.9, y); ctx.lineTo(cx + R * 0.9, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + R * 1.05, y); ctx.lineTo(cx + R * 0.82, y - R * 0.1); ctx.lineTo(cx + R * 0.82, y + R * 0.1); ctx.closePath(); ctx.fill();
      ctx.font = font(R * 0.16);
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText('to the plate', cx, y - R * 0.08);
    }

    // The axis: behind the ball first, then the ball, then the near half. A point t along the axis from the middle of
    // the ball is drawn at at(t): the near half comes out of the ball at t = R and ends at L, and is over the ball until
    // it reaches the ball's edge on screen, at t = edge. A pitch with bullet spin has its axis pointing at you, so its
    // near half is over the ball all the way to its end.
    const ax = axisV, L = R * 1.5;
    const near = ax[2] >= 0 ? 1 : -1;
    const at = t => [cx + ax[0] * t, cy - ax[1] * t];
    const along = Math.hypot(ax[0], ax[1]), edge = along > 0 ? R / along : Infinity;
    ctx.strokeStyle = c.ink; ctx.lineWidth = lw * 1.8; ctx.lineCap = 'round';
    ctx.setLineDash([lw * 3, lw * 3]);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(...at(-near * L)); ctx.stroke();
    ctx.setLineDash([]);
    drawBall(ctx, cx, cy, R, spun(M0, axisV, angle));
    const line = (from, to, color) => { ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(...at(near * from)); ctx.lineTo(...at(near * to)); ctx.stroke(); };
    line(R, Math.min(L, edge), OVER_BALL);
    if (edge < L) line(edge, L, c.ink);
    ctx.fillStyle = edge > L ? OVER_BALL : c.ink; ctx.strokeStyle = CREAM; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.arc(...at(near * L), lw * 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
}
