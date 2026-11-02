// The big canvas: throws the pitch and draws it from the chosen camera.
import {
  throwPitch, apex, catcherCamera, sideCamera, topCamera, palette, lineWidth,
  drawCatcherField, drawZone, drawSideField, drawTopField, drawPath, ballMatrix, DECIDE,
} from './flight.js';
import { drawBall, spun } from './ball.js';
import { drawBatter, drawMarks, atBatCamera, growth } from './tracker.js';

const WINDUP = 0.45; // seconds (real time) the ball waits at the release point
const HOLD = 1.6;
const HALO = 'rgba(20, 30, 45, .65)';

export class Stage {
  constructor(canvas, { onState = () => {}, onArrive = () => {} } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onState = onState;
    this.onArrive = onArrive;
    this.opts = { view: 'catcher', speed: 0.25, ghost: true, hand: 'R', pair: null, dark: false };
    this.flights = [];
    this.clock = 0; // real seconds since the throw
    this.raf = 0;
    this.bg = null;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  // Where the page's words sit over the picture: the speed and the time in the top-left corner and the legend in the
  // top-right, in CSS pixels from its top left (the speed by its words, not its row). Measured whenever something is
  // set, a pitch is thrown or the picture changes size, so the field's labels can keep clear of them.
  measure() {
    const c = this.canvas.getBoundingClientRect(), frame = this.canvas.parentElement;
    const box = (el, words = false) => {
      if (!el) return null;
      let r = el.getBoundingClientRect();
      if (words) { const range = document.createRange(); range.selectNodeContents(el); r = range.getBoundingClientRect(); }
      return { left: Math.round(r.left - c.left), right: Math.round(r.right - c.left), top: Math.round(r.top - c.top), bottom: Math.round(r.bottom - c.top) };
    };
    this.overlays = { speed: box(frame?.querySelector('.readout .speed'), true), time: box(frame?.querySelector('.readout .time')), legend: box(frame?.querySelector('.legend')) };
  }

  // The canvas's size in device pixels, at up to twice its size in CSS pixels, and that ratio.
  size() {
    const r = this.canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    return { W: Math.max(1, Math.round(r.width * dpr)), H: Math.max(1, Math.round(r.height * dpr)), dpr };
  }

  resize() {
    this.measure();
    const { W, H, dpr } = this.size();
    if (W === this.canvas.width && H === this.canvas.height) return;
    this.canvas.width = W; this.canvas.height = H;
    this.dpr = dpr;
    this.bg = null;
    this.draw();
  }

  // `grow`, with marks: the newest has just landed, so it grows in (js/tracker.js), timed by the stage's own clock, which
  // runs on for HOLD after the pitch lands. Not with reduced motion.
  set({ grow = false, ...opts }) {
    const before = { ...this.opts };
    Object.assign(this.opts, opts);
    if (opts.marks) this.markAt = grow && !this.reduced ? this.clock : null;
    this.measure();
    if (before.view !== this.opts.view || before.dark !== this.opts.dark) this.bg = null;
    this.draw();
  }

  // Throw `pitch` (and its pair, if one is set) from the start.
  throw(pitch, pairPitch = null) {
    const rng = Math.random;
    const j = () => (rng() + rng() + rng() - 1.5) * 0.28;
    this.measure();
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

  // Play flights worked out elsewhere (the at-bat's), so what's drawn is exactly what happened.
  show(flights) {
    this.flights = flights;
    this.bg = null;
    this.clock = this.reduced ? WINDUP + 10 / this.opts.speed : 0;
    this.play();
  }

  // Stop whatever is flying and clear the field (a new at-bat).
  clear() {
    cancelAnimationFrame(this.raf);
    this.flights = [];
    this.draw();
  }

  // Held, the throw waits at the release, its clock stopped before the windup, until it's let go: while the page is
  // still scrolling up to the picture (js/app.js).
  hold() { this.held = true; }
  release() { this.held = false; }

  play() {
    cancelAnimationFrame(this.raf);
    let last = performance.now();
    let arrived = false;
    const tick = now => {
      const dt = this.held ? 0 : Math.min(0.05, (now - last) / 1000);
      last = now;
      this.clock += dt;
      this.draw();
      if (!arrived && this.gameTime() >= this.flights[0].T) { arrived = true; this.onArrive(); }
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
    if (this.opts.view === 'side') cam = sideCamera(W, H, { top, dpr: this.dpr || 1 });
    else if (this.opts.view === 'top') cam = topCamera(W, H);
    else {
      // Tilt up for a high lob so it stays in frame. The at-bat's view is fitted to the canvas, so its marks fit too.
      const lift = Math.max(0, Math.min(10, (top - 8) * 1.6));
      cam = this.opts.atBat ? atBatCamera(W, H, { dpr: this.dpr || 1, lift }) : catcherCamera(W, H, { lift });
    }
    cam.dpr = this.dpr || 1;
    return cam;
  }

  background(cam, colors) {
    const key = `${cam.kind}|${cam.W}|${cam.H}|${cam.dpr}|${this.opts.dark}|${cam.F || cam.stretch}|${this.opts.hand}|${this.opts.batter}|${cam.kind === 'top' ? JSON.stringify(this.overlays) : ''}`;
    if (this.bg && this.bgKey === key) return this.bg;
    const c = document.createElement('canvas');
    c.width = cam.W; c.height = cam.H;
    const x = c.getContext('2d');
    if (cam.kind === 'catcher') {
      drawCatcherField(x, cam, colors);
      if (this.opts.batter) drawBatter(x, cam, this.opts.batter, this.opts.dark);
    } else if (cam.kind === 'side') drawSideField(x, cam, colors);
    else drawTopField(x, cam, colors, this.opts.hand, this.overlays);
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
    if (!this.flights.length) { this.drawMarks(ctx, cam); return; }

    const t = this.gameTime();
    const lw = lineWidth(W, cam.dpr);
    const colorsFor = i => (i === 0 ? this.opts.color || '#ffd166' : this.opts.pairColor || '#ffffff');
    // On the light palette's pale sky the yellow, the pale blue and the white would all but vanish, so each path, its
    // dots and its decision ring get a thin dark halo, about 2 CSS pixels wider. The dark palette needs none.
    const halo = this.opts.dark ? null : HALO, hw = 2 * cam.dpr;

    // Strobe: the ball every 1/30 s, faint, so speed shows as spacing. Each dot's halo is a ring just outside it, drawn
    // first, so the paths go over it rather than it over them.
    const strobe = this.flights.map(f => {
      const dots = [];
      for (let s = 0; s < Math.min(t, f.T); s += 1 / 30) {
        const p = cam.project(f.pos(s));
        dots.push([p.x, p.y, Math.max(1.5, Math.min(cam.ballR(p.depth) * 0.5, lw * 1.8))]);
      }
      return dots;
    });
    if (halo) {
      ctx.strokeStyle = halo; ctx.lineWidth = hw / 2;
      for (const dots of strobe) for (const [x, y, r] of dots) { ctx.beginPath(); ctx.arc(x, y, r + hw / 4, 0, Math.PI * 2); ctx.stroke(); }
    }

    // The no-spin ghost of the main pitch.
    const main = this.flights[0];
    if (this.opts.ghost) {
      drawPath(ctx, cam, main, Math.min(t, main.T), colors.ghost, { dashed: true, width: lw * 0.9, ghost: true, halo, haloWidth: lw * 0.9 + hw });
    }
    this.flights.forEach((f, i) => drawPath(ctx, cam, f, Math.min(t, f.T), colorsFor(i), { width: lw * 1.2, halo, haloWidth: lw * 1.2 + hw }));

    strobe.forEach((dots, i) => {
      ctx.fillStyle = colorsFor(i);
      ctx.globalAlpha = 0.5;
      for (const [x, y, r] of dots) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
    });

    // Decision point: where each pitch was 175 ms before the plate.
    this.flights.forEach((f, i) => {
      const td = f.T - DECIDE;
      if (t < td) return;
      const p = cam.project(f.pos(td));
      const r = Math.max(cam.ballR(p.depth) * 1.9, lw * 4.5);
      ctx.setLineDash([lw * 2, lw * 2]);
      if (halo) { ctx.strokeStyle = halo; ctx.lineWidth = lw + hw; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke(); }
      ctx.strokeStyle = colorsFor(i);
      ctx.lineWidth = lw;
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
    this.drawMarks(ctx, cam);
  }

  // An at-bat's pitches so far, where they crossed the plate, over everything else.
  drawMarks(ctx, cam) {
    if (cam.kind !== 'catcher' || !this.opts.marks?.length) return;
    drawMarks(ctx, cam, this.opts.marks, { grow: this.markAt == null ? 1 : growth(this.clock - this.markAt) });
  }

  // Facts about the current throw, for the readout.
  summary() {
    if (!this.flights.length) return null;
    const t = this.gameTime();
    return this.flights.map(f => ({ f, arrived: t >= f.T, t: Math.min(t, f.T) }));
  }
}
