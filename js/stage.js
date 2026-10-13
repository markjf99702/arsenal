// The big canvas: throws the pitch and draws it from the chosen camera.
import {
  throwPitch, apex, catcherCamera, sideCamera, topCamera, palette,
  drawCatcherField, drawZone, drawSideField, drawTopField, drawPath, ballMatrix, DECIDE,
} from './flight.js';
import { drawBall, spun } from './ball.js';

const WINDUP = 0.45; // seconds (real time) the ball waits at the release point
const HOLD = 1.6;

export class Stage {
  constructor(canvas, { onState = () => {} } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onState = onState;
    this.opts = { view: 'catcher', speed: 0.25, ghost: true, hand: 'R', pair: null, dark: false };
    this.flights = [];
    this.clock = 0; // real seconds since the throw
    this.raf = 0;
    this.bg = null;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
    if (W === this.canvas.width && H === this.canvas.height) return;
    this.canvas.width = W; this.canvas.height = H;
    this.dpr = dpr;
    this.bg = null;
    this.draw();
  }

  set(opts) {
    const before = { ...this.opts };
    Object.assign(this.opts, opts);
    if (before.view !== this.opts.view || before.dark !== this.opts.dark) this.bg = null;
    this.draw();
  }

  // Throw `pitch` (and its pair, if one is set) from the start.
  throw(pitch, pairPitch = null) {
    const rng = Math.random;
    const j = () => (rng() + rng() + rng() - 1.5) * 0.28;
    const main = throwPitch(pitch, { hand: this.opts.hand, jitter: [j(), j()], rng });
    this.flights = [main];
    if (pairPitch && pairPitch !== pitch) {
      this.flights.push(throwPitch(pairPitch, { hand: this.opts.hand, jitter: [j(), j()], release: main.release, rng }));
    }
    this.bg = null; // the eephus may need the camera tilted up
    // Reduced motion starts at the end: 10 seconds of game time in, past every landing at any speed.
    this.clock = this.reduced ? WINDUP + 10 / this.opts.speed : 0;
    this.play();
  }

  play() {
    cancelAnimationFrame(this.raf);
    let last = performance.now();
    const tick = now => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.clock += dt;
      this.draw();
      const longest = Math.max(...this.flights.map(f => f.T));
      if (this.gameTime() < longest || this.clock < WINDUP + longest / this.opts.speed + HOLD) {
        this.raf = requestAnimationFrame(tick);
      } else this.onState({ done: true });
    };
    this.raf = requestAnimationFrame(tick);
  }

  gameTime() { return Math.max(0, (this.clock - WINDUP) * this.opts.speed); }

  camera() {
    const W = this.canvas.width, H = this.canvas.height;
    const top = Math.max(7.5, ...this.flights.map(f => apex(f) + 0.8));
    let cam;
    if (this.opts.view === 'side') cam = sideCamera(W, H, { top });
    else if (this.opts.view === 'top') cam = topCamera(W, H);
    // Tilt up for a high lob so it stays in frame.
    else cam = catcherCamera(W, H, { lift: Math.max(0, Math.min(10, (top - 8) * 1.6)) });
    cam.dpr = this.dpr || 1;
    return cam;
  }

  background(cam, colors) {
    const key = `${cam.kind}|${cam.W}|${cam.H}|${cam.dpr}|${this.opts.dark}|${cam.F || cam.stretch}|${this.opts.hand}`;
    if (this.bg && this.bgKey === key) return this.bg;
    const c = document.createElement('canvas');
    c.width = cam.W; c.height = cam.H;
    const x = c.getContext('2d');
    if (cam.kind === 'catcher') drawCatcherField(x, cam, colors);
    else if (cam.kind === 'side') drawSideField(x, cam, colors);
    else drawTopField(x, cam, colors, this.opts.hand);
    this.bg = c; this.bgKey = key;
    return c;
  }

  draw() {
    const { ctx } = this;
    const W = this.canvas.width, H = this.canvas.height;
    if (W < 2 || H < 2) return;
    const cam = this.camera();
    const colors = palette(this.opts.dark);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(this.background(cam, colors), 0, 0);
    if (cam.kind === 'catcher') drawZone(ctx, cam, colors);
    if (!this.flights.length) return;

    const t = this.gameTime();
    const lw = Math.max(1.5, W / 520);
    const colorsFor = i => (i === 0 ? this.opts.color || '#ffd166' : this.opts.pairColor || '#ffffff');

    // The no-spin ghost of the main pitch.
    const main = this.flights[0];
    if (this.opts.ghost) {
      drawPath(ctx, cam, main, Math.min(t, main.T), colors.ghost, { dashed: true, width: lw * 0.9, ghost: true });
    }
    this.flights.forEach((f, i) => drawPath(ctx, cam, f, Math.min(t, f.T), colorsFor(i), { width: lw * 1.2 }));

    // Strobe: the ball every 1/30 s, faint, so speed shows as spacing.
    this.flights.forEach((f, i) => {
      ctx.fillStyle = colorsFor(i);
      ctx.globalAlpha = 0.5;
      for (let s = 0; s < Math.min(t, f.T); s += 1 / 30) {
        const p = cam.project(f.pos(s));
        const r = Math.max(1.5, Math.min(cam.ballR(p.depth) * 0.5, lw * 1.8));
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    });

    // Decision point: where each pitch was 175 ms before the plate.
    this.flights.forEach((f, i) => {
      const td = f.T - DECIDE;
      if (t < td) return;
      const p = cam.project(f.pos(td));
      const r = Math.max(cam.ballR(p.depth) * 1.9, lw * 4.5);
      ctx.strokeStyle = colorsFor(i);
      ctx.lineWidth = lw;
      ctx.setLineDash([lw * 2, lw * 2]);
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    });

    // Ghost ball at the plate, once the real one gets there.
    if (this.opts.ghost && t >= main.T) {
      const g = cam.project(main.ghostEnd);
      const e = cam.project(main.end);
      const r = Math.max(cam.ballR(g.depth), lw * 3);
      ctx.strokeStyle = colors.ghost; ctx.lineWidth = lw;
      ctx.setLineDash([lw * 1.6, lw * 1.6]);
      ctx.beginPath(); ctx.arc(g.x, g.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(e.x, e.y); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // The balls themselves, farthest first, spinning at the true rate for the game clock.
    const balls = this.flights.map((f, i) => {
      const tt = Math.min(t, f.T);
      const p = cam.project(f.pos(tt));
      return { f, i, p, tt };
    }).sort((a, b) => b.p.depth - a.p.depth);
    for (const { f, p, tt } of balls) {
      const r = cam.ballR(p.depth);
      const { M0, axisView, angle } = ballMatrix(f, cam, tt);
      if (t === 0 && r < 4) {
        // Mark the release point while the ball is waiting there.
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, lw * 10);
        glow.addColorStop(0, 'rgba(255,255,255,.9)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = glow; ctx.fillRect(p.x - lw * 10, p.y - lw * 10, lw * 20, lw * 20);
      }
      drawBall(ctx, p.x, p.y, r, spun(M0, axisView, angle));
    }
  }

  // Facts about the current throw, for the readout.
  summary() {
    if (!this.flights.length) return null;
    const t = this.gameTime();
    return this.flights.map(f => ({ f, arrived: t >= f.T, t: Math.min(t, f.T) }));
  }
}
