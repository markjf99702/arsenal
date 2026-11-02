// The at-bat's sounds: a low pop as the catcher's mitt takes the ball, the crack of the bat on contact and a softer tick
// for a foul tip. They're made here in the browser, from a few tones and a burst of noise, so there are no sound files
// to download or keep for offline. Off until Sound is turned on, and then only for a pitch thrown with a tap on Throw:
// a browser lets a page start sound only from a tap, and nobody should be surprised by noise.

// What each pitch sounds like as it gets to the plate: ball, called strike or swing and miss, the mitt; foul or ball in
// play, the bat; a foul tip, a tick off the bat and then the mitt. A pitch that hits the batter is a dull thud.
const KIND = { ball: 'pop', called: 'pop', whiff: 'pop', tip: 'tip', foul: 'crack', inplay: 'crack', hbp: 'thud' };
export const soundFor = result => KIND[result] || null;
// How loud, all told: rendered offline, the crack of the bat, the loudest, peaks at about 0.8 of full scale with this, a
// pop at 0.75, a thud at 0.6 and a foul tip at 0.35.
const VOLUME = 0.6;

export function makeSound() {
  let ctx = null, out = null, noise = null;
  const api = {
    on: false,
    // What was played last, and how many, for the tests.
    last: null, played: 0,
    // Called from the tap on Throw. Sound on, it starts (or wakes) the browser's audio, which a page may only do from a
    // tap; true if it's ready for the pitch's landing.
    wake() {
      if (!api.on) return false;
      try {
        if (!ctx) {
          const Audio = window.AudioContext || window.webkitAudioContext;
          if (!Audio) return false;
          ctx = new Audio();
          // Every sound goes out through one volume, set so the loudest stays under clipping.
          out = ctx.createGain();
          out.gain.value = VOLUME;
          out.connect(ctx.destination);
          // Half a second of white noise, the leather's slap and the wood's crack, filtered.
          noise = ctx.createBuffer(1, Math.round(ctx.sampleRate / 2), ctx.sampleRate);
          const data = noise.getChannelData(0);
          for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        }
        // Asleep since Sound was turned off, or (on an iPhone) interrupted by a call or another app's sound.
        if (ctx.state !== 'running') ctx.resume().catch(() => {});
        return true;
      } catch {
        ctx = null;
        return false;
      }
    },
    // Turned off, the audio sleeps until it's turned on and Throw is tapped again.
    set(on) {
      api.on = on;
      if (!on && ctx?.state === 'running') ctx.suspend().catch(() => {});
    },
    // The sound for a pitch's result, now.
    play(result) {
      const kind = soundFor(result);
      if (!api.on || !ctx || !kind) return;
      const t = ctx.currentTime + 0.005;
      if (kind === 'pop') pop(t, 1);
      else if (kind === 'crack') crack(t);
      else if (kind === 'tip') { tick(t); pop(t + 0.035, 0.45); }
      else thud(t);
      api.last = kind;
      api.played++;
    },
  };

  // A tone gliding from `from` to `to` Hz while it dies away from `level` over `long` seconds.
  function tone(t, { type = 'sine', from, to, level, long }) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + long);
    envelope(g, t, level, long);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + long + 0.02);
  }
  // A burst of noise through a filter, dying away from `level` over `long` seconds.
  function burst(t, { filter, hz, q = 0.7, level, long }) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise;
    f.type = filter;
    f.frequency.value = hz;
    f.Q.value = q;
    envelope(g, t, level, long);
    s.connect(f).connect(g).connect(out);
    s.start(t, Math.random() * 0.3);
    s.stop(t + long + 0.02);
  }
  // Up in 3 ms, then down to nothing.
  function envelope(g, t, level, long) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + long);
  }

  // The mitt: a low thump with the leather's slap on top. It starts high enough for a phone's small speaker, which
  // can't play much under a few hundred hertz.
  function pop(t, loud) {
    tone(t, { from: 420, to: 90, level: 1.2 * loud, long: 0.12 });
    burst(t, { filter: 'lowpass', hz: 2400, level: 0.8 * loud, long: 0.045 });
  }
  // The bat: a sharp crack, the wood ringing a moment, and a little body under it.
  function crack(t) {
    burst(t, { filter: 'bandpass', hz: 2300, q: 1.1, level: 2.4, long: 0.075 });
    tone(t, { type: 'triangle', from: 1080, to: 880, level: 0.4, long: 0.16 });
    tone(t, { from: 240, to: 120, level: 0.6, long: 0.07 });
  }
  // A foul tip: the ball only grazes the bat.
  function tick(t) {
    burst(t, { filter: 'highpass', hz: 3200, level: 0.2, long: 0.025 });
  }
  // A pitch that hits the batter: a duller, lower thump, with no leather in it.
  function thud(t) {
    tone(t, { from: 260, to: 70, level: 1.1, long: 0.13 });
    burst(t, { filter: 'lowpass', hz: 700, level: 0.6, long: 0.06 });
  }

  return api;
}
