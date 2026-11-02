// Wires the page together: the picker, the stage, the card and the charts.
import { PITCHES, FAMILIES, BY_CODE, BY_SLUG } from './pitches.js';
import { TOTAL, SEASON } from './numbers.js';
import { Stage } from './stage.js';
import { SpinPanel, SLOW, tilt, spinTilt, seamsMove } from './spin.js';
import { drawGrip } from './grip.js';
import { movementChart, lineupTable, famName, shareText } from './charts.js';
import { DECIDE, throwPitch } from './flight.js';
import { setupAtBat } from './atbat-ui.js';
import { setupHit } from './hit-ui.js';
import { trimmed, PITCHERS as ARMS, pitchFor } from './atbat.js';

const $ = id => document.getElementById(id);
// Inches and mph keep their one decimal place ("↑ 1.0 in", "89.0 mph"), as the speed does; rpm (fmt(v, 0)) has none and
// a thousands comma.
const fmt = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const MAIN = '#ffd23f', PAIR = '#7fd3ff';
const FAM_SINGULAR = { fast: 'Fastball', break: 'Breaking ball', off: 'Off-speed pitch', odd: 'Oddity' };
// Pitches other than fastballs and changeups, which Pitch Smart, MLB and USA Baseball's guidelines for young pitchers, says to
// leave until 13 or 14: for ages 9-12, "Avoid throwing pitches other than fastballs and changeups"; for 13-14, "Players can
// begin using breaking pitches after developing consistent fastball and changeup" (mlb.com/pitch-smart).
const NOT_YET = new Set(['SL', 'ST', 'CU', 'KC', 'SV', 'FS', 'FO', 'KN', 'EP']);

const state = {
  pitch: PITCHES[0],
  pair: null,
  by: null, // the real pitcher it's thrown by (his key), or null for the league average
  hand: 'R',
  view: 'catcher',
  speed: 0.25,
  ghost: true,
};

// ---------------------------------------------------------------- thrown by
// The real pitchers in Pitch to a hitter (js/league.js), and who of them throws a pitch.
const REAL = ARMS.filter(a => a.key !== 'average');
const armByKey = key => REAL.find(a => a.key === key) || null;
const throwers = p => REAL.filter(a => a.pitches.some(e => e.code === p.code));
// A pitch as he threw it in 2026: his speed, spin, movement and release (pitchFor, js/atbat.js), aimed where the
// league's goes. The league's own when he didn't throw it, or there's no one. `league` is the league's, `entry` his line.
function his(p, key = state.by) {
  const arm = armByKey(key), entry = arm?.pitches.find(e => e.code === p.code);
  if (!entry) return p;
  return { ...pitchFor(arm, entry, [0, 0]), target: p.target, league: p, arm, entry };
}
// What's thrown: the pitch picked and the one with it, his if he's picked.
const thrown = () => his(state.pitch);
const pairThrown = () => state.pair && his(BY_CODE[state.pair]);

// ---------------------------------------------------------------- theme
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
const isDark = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : darkQuery.matches; };
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// ---------------------------------------------------------------- picker
const picker = $('picker');
for (const fam of FAMILIES) {
  const group = document.createElement('div');
  group.className = `group fam-${fam.id}`;
  group.innerHTML = `<span class="group-name"><span class="key" aria-hidden="true"></span>${fam.name}</span>`;
  for (const p of PITCHES.filter(q => q.fam === fam.id)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.code = p.code;
    b.textContent = p.short;
    b.addEventListener('click', () => pick(p));
    group.appendChild(b);
  }
  picker.appendChild(group);
}

// ---------------------------------------------------------------- stage
const stage = new Stage($('flight'), { onState: () => {} });
const spin = new SpinPanel($('spin'));

function throwNow() {
  stage.set({ color: MAIN, pairColor: PAIR, ghost: state.ghost, hand: state.hand, view: state.view, speed: state.speed, dark: isDark() });
  stage.throw(thrown(), pairThrown() || null);
  // The legend has this throw's times in it now, so the field's labels are placed clear of it as it will be.
  legendTimes();
  stage.set({});
  caption();
  readoutLoop();
}

// Two pitches thrown together, worked out from throws with no scatter (rng 0.5, no jitter) so every throw says the same:
// how far apart they are at their decision points, where the hitter has to decide, and at the plate (as he sees them:
// across and up and down, in inches), and how much later the second gets there, in seconds.
function apart() {
  const main = throwPitch(thrown(), { hand: state.hand, rng: () => 0.5 });
  const pair = throwPitch(pairThrown(), { hand: state.hand, rng: () => 0.5, release: main.release });
  const gap = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]) * 12;
  return { decide: Math.round(gap(main.decide, pair.decide)), plate: Math.round(gap(main.end, pair.end)), later: Math.round((pair.T - main.T) * 100) / 100 };
}
// "8 inches", "an inch", "1 ft 7 in" (or spelled out for a screen reader: "1 foot 7 inches").
function distance(n, spoken = false) {
  if (n < 12) return n === 0 ? 'less than an inch' : n === 1 ? 'an inch' : `${n} inches`;
  const ft = Math.floor(n / 12), inch = n % 12;
  if (!spoken) return inch ? `${ft} ft ${inch} in` : `${ft} ft`;
  return `${ft} ${ft === 1 ? 'foot' : 'feet'}${inch ? ` ${inch} inch${inch === 1 ? '' : 'es'}` : ''}`;
}
const lowerName = p => p.short.toLowerCase();

// Each frame the readout is worked out again, but it's written only when it changes: through the windup it says
// "Ready…" for a quarter of a second or more, and writing the same words again still costs the page a layout and a
// paint. Two pitches' times go under their speeds, and on a phone, where that line would run under the legend, beside
// each pitch's name in the legend instead (legendTimes), once they're in.
let roRaf = 0;
const shown = {};
function write(id, text, html = false) {
  if (shown[id] === text) return;
  shown[id] = text;
  if (html) $(id).innerHTML = text; else $(id).textContent = text;
}
function readoutLoop() {
  cancelAnimationFrame(roRaf);
  write('landed', '');
  const tick = () => {
    const s = stage.summary();
    if (s) {
      const main = s[0];
      const t = stage.gameTime();
      if (!main.arrived) {
        write('ro-time', t === 0 ? 'Ready…' : `${t.toFixed(2)} s`);
      } else if (s.length > 1) {
        write('ro-time', `<span class="both">${s.map(x => `${x.f.p.short} ${x.f.T.toFixed(2)} s`).join(' · ')}</span>`, true);
      } else write('ro-time', `${main.f.T.toFixed(2)} s to the plate`);
      const timed = main.arrived && s.length > 1;
      if ($('legend').classList.contains('timed') !== timed) $('legend').classList.toggle('timed', timed);
      const deciding = s.some(x => t >= x.f.T - DECIDE && t < x.f.T) && state.speed < 1;
      if ($('frame').classList.contains('deciding') !== deciding) $('frame').classList.toggle('deciding', deciding);
      if (!s.every(x => x.arrived) || t === 0) { roRaf = requestAnimationFrame(tick); return; }
      // Every ball is in: say it once to a screen reader, since the time above changes every frame. Two pitches: how far
      // apart they were where he has to decide, and at the plate.
      if (s.length > 1) {
        const a = apart();
        write('landed', `${s.map(x => `${x.f.p.short} ${x.f.T.toFixed(2)} seconds`).join(', ')}. When the hitter has to decide they’re ${distance(a.decide, true)} apart; at the plate, ${distance(a.plate, true)}.`);
      } else write('landed', `${main.f.p.short}, ${main.f.T.toFixed(2)} seconds to the plate`);
    }
  };
  roRaf = requestAnimationFrame(tick);
}
$('flight').parentElement.id = 'frame';
const cue = document.createElement('div');
cue.className = 'cue';
cue.textContent = 'Swing or take? Decide now.';
// It flashes up for the eye at the decision point; read out of context, it would only puzzle.
cue.setAttribute('aria-hidden', 'true');
$('frame').appendChild(cue);

// ---------------------------------------------------------------- the card
function stat(label, value, sub = '') {
  return `<div><dt>${label}</dt><dd><b>${value}</b>${sub ? `<span>${sub}</span>` : ''}</dd></div>`;
}
const inches = v => `${fmt(Math.abs(v))} in`;
function feetInches(inchesTotal) {
  const ft = Math.floor(inchesTotal / 12), inch = Math.round(inchesTotal - ft * 12);
  if (inch === 12) return `${ft + 1} ft`;
  return ft ? `${ft} ft ${inch} in` : `${inch} in`;
}
function direction(n) {
  const up = n.rise >= 0 ? 'up' : 'down', side = n.arm >= 0 ? 'toward the arm side' : 'toward the glove side';
  if (Math.abs(n.rise) < 0.35 * Math.abs(n.arm)) return side;
  if (Math.abs(n.arm) < 0.35 * Math.abs(n.rise)) return up;
  return `${up} and ${side}`;
}

// Which way spin moves it, for the eye and the ear: "↑ 15.6 in" and "15.6 inches up". The arrow is for the eye: a
// screen reader hears "15.6 inches up", not "upwards arrow 15.6 in". A no-break space keeps "in" with its number in the
// narrow box ("glove side 3.9 in", not "in" on a line alone).
const moves = n => `<span aria-hidden="true">${n.rise >= 0 ? '↑' : '↓'} ${inches(n.rise)}</span><span class="sr">${fmt(Math.abs(n.rise))} inches ${n.rise >= 0 ? 'up' : 'down'}</span>`;
const sideways = n => `${n.arm >= 0 ? 'arm side' : 'glove side'} ${fmt(Math.abs(n.arm))} in`;

function renderCard() {
  const p = thrown(), n = p.n, lg = p.league?.n;
  document.title = `${p.name} · Arsenal`;
  $('card').className = `card fam-${p.fam}`;
  $('c-fam').innerHTML = `<span class="key" aria-hidden="true"></span>${FAM_SINGULAR[p.fam]} <span class="code">${p.code}</span>`;
  $('c-name').innerHTML = `${p.name}${p.aka ? ` <small>or ${p.aka}</small>` : ''}`;
  $('c-line').textContent = p.arm ? `${p.arm.name}’s, from his ${SEASON} numbers, beside the league’s.` : p.line;
  const share = shareText(n.share);
  $('c-stats').innerHTML = (p.arm ? [
    // Thrown by a real pitcher: his numbers, each with the league's under it.
    stat('Speed', `${n.mph.toFixed(1)} mph`, `league ${lg.mph.toFixed(1)}`),
    stat('Spin', `${fmt(n.rpm, 0)} rpm`, `league ${fmt(lg.rpm, 0)}`),
    stat('Spin moves it', moves(n), `${sideways(n)}<br><span aria-hidden="true">league ${lg.rise >= 0 ? '↑' : '↓'} ${fmt(Math.abs(lg.rise))}, ${lg.arm >= 0 ? 'arm' : 'glove'} ${fmt(Math.abs(lg.arm))}</span><span class="sr">; league ${fmt(Math.abs(lg.rise))} inches ${lg.rise >= 0 ? 'up' : 'down'}, ${sideways(lg)}</span>`),
    stat('Release height', feetInches(n.height * 12), `league ${feetInches(lg.height * 12)}`),
    stat('Thrown', `${shareText(p.entry.share * 100)}%`, 'of his pitches'),
    stat('Misses', `${Math.round(p.entry.whiff * 100)}`, `per 100 swings; league ${Math.round(lg.whiff)}`),
  ] : [
    // The range is over pitchers' average speeds (tools/statcast.mjs), not single pitches.
    stat('Speed', `${n.mph.toFixed(1)} mph`, n.low ? `most pitchers ${Math.round(n.low)}–${Math.round(n.high)}` : ''),
    stat('Spin', `${fmt(n.rpm, 0)} rpm`, p.code === 'KN' ? 'barely turning' : `${Math.round(n.rpm / 60)} turns a second`),
    stat('Spin moves it', moves(n), sideways(n)),
    stat('Drops', feetInches(n.drop), 'counting gravity'),
    stat('Thrown', `${share}%`, `${n.pitches.toLocaleString('en-US')} pitches`),
    stat('Misses', n.whiff == null ? '–' : `${Math.round(n.whiff)}`, 'per 100 swings'),
  ]).join('');
  $('c-grip').textContent = p.grip;
  $('c-young').hidden = !NOT_YET.has(p.code);
  $('c-young').innerHTML = NOT_YET.has(p.code) ? '<a href="https://www.mlb.com/pitch-smart">Pitch Smart</a>, from MLB and USA Baseball, says to stick to fastballs and changeups through age 12 and to add breaking pitches once both are consistent.' : '';
  $('c-how').textContent = p.how;
  const t = tilt(p, state.hand);
  // Turns on the way in: the spin rate times the flight time the readout shows.
  const turns = (n.rpm / 60) * throwPitch(p, { hand: state.hand, rng: () => 0.5 }).T;
  let spinText = `${fmt(n.rpm, 0)} rpm, shown ${SLOW}× slower: about ${Math.round(turns)} turns on the way to the plate.`;
  if (p.code === 'KN') spinText = `About ${fmt(n.rpm, 0)} rpm, shown ${SLOW}× slower: two or three turns on the whole way in, so the seams drift instead of spinning.`;
  else {
    // The arrow is where it moves; the thin line, where its spin itself points, as Hawk-Eye measured it. Half an hour
    // or more apart, the seams have pushed it the rest of the way.
    spinText += ` The arrow on the clock points where it moves: ${t.text}, ${direction(n)}.`;
    const st = spinTilt(p, state.hand);
    if (st && seamsMove(p, state.hand)) spinText += ` The thin line is its spin: it points to ${st.text}, but the pitch moves toward ${t.text}, and the seams add the rest.`;
    else if (st) spinText += ` The thin line is its spin, pointing to ${st.text}.`;
    const act = n.active ?? null;
    if (act != null) spinText += ` ${act}% of the spin does the pushing; the rest is bullet spin around the line of flight.`;
  }
  $('c-spin').textContent = `${spinText} ${spinHint()}`;
  const facts = [];
  if (n.most) facts.push(`Thrown most by ${n.most.name}: ${n.most.pitches.toLocaleString('en-US')} of them.`);
  if (n.hardest && n.hardest.name !== n.most?.name && n.pitchers > 3) facts.push(`Hardest on average: ${n.hardest.name}, ${fmt(n.hardest.mph)} mph.`);
  if (p.note) facts.push(p.note);
  facts.push(`${n.pitchers.toLocaleString('en-US')} pitcher${n.pitchers === 1 ? '' : 's'} threw at least one in ${SEASON}.`);
  $('c-facts').innerHTML = facts.map(f => `<li>${f}</li>`).join('');
  const i = PITCHES.indexOf(p);
  const prev = PITCHES[(i + PITCHES.length - 1) % PITCHES.length], next = PITCHES[(i + 1) % PITCHES.length];
  $('prev').textContent = `← ${prev.short}`; $('prev').onclick = () => pick(prev, { scroll: true });
  $('next').textContent = `${next.short} →`; $('next').onclick = () => pick(next, { scroll: true });
  drawGripNow();
  spin.set({ pitch: p, hand: state.hand });
  chart.pitcher(p.arm || null);
  $('move-his').hidden = !p.arm;
  $('move-his').textContent = p.arm ? `Rings: ${p.arm.name}’s pitches, each joined to the league’s dot for its kind.` : '';
}

const gripCanvas = $('grip');
function drawGripNow() {
  const r = gripCanvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  gripCanvas.width = Math.max(1, Math.round(r.width * dpr));
  gripCanvas.height = Math.max(1, Math.round(r.height * dpr));
  drawGrip(gripCanvas.getContext('2d'), gripCanvas.width, gripCanvas.height, state.pitch.code, { lefty: state.hand === 'L' });
}
new ResizeObserver(drawGripNow).observe(gripCanvas);

// The spinning ball stops and starts again with a tap, a click, or Enter or Space on it: it turns for as long as it's on
// screen, so it can be stopped (WCAG 2.2, SC 2.2.2). Where the device asks for less motion it starts out still.
const spinCanvas = $('spin');
const spinHint = () => (spin.still ? 'Tap the ball to spin it.' : 'Tap the ball to stop it.');
function toggleSpin() {
  spinCanvas.setAttribute('aria-pressed', String(spin.toggle()));
  $('c-spin').textContent = $('c-spin').textContent.replace(/Tap the ball to (stop|spin) it\.$/, spinHint());
}
spinCanvas.setAttribute('aria-pressed', String(spin.still));
spinCanvas.addEventListener('click', toggleSpin);
spinCanvas.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSpin(); } });

// ---------------------------------------------------------------- controls
function seg(id, key, cast = v => v, after = () => {}) {
  const box = $(id);
  box.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    state[key] = cast(b.dataset.v);
    for (const x of box.querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
    after();
  });
}
seg('view', 'view', v => v, () => { stage.set({ view: state.view }); caption(); if (stage.summary()?.every(x => x.arrived)) return; });
seg('speed', 'speed', Number, throwNow);
// The other hand is the league average's: a real pitcher throws with his own, so picking his own leaves him be.
seg('hand', 'hand', v => v, () => {
  if (state.by && armByKey(state.by).hand === state.hand) return;
  state.by = null; byOptions(); pairOptions(); speedReadout(); renderCard(); legend(); throwNow(); address();
});
$('by').addEventListener('change', e => {
  state.by = e.target.value || null;
  if (state.by) setHand(armByKey(state.by).hand);
  pairOptions(); speedReadout(); renderCard(); legend(); throwNow(); address();
});
function setHand(hand) {
  state.hand = hand;
  for (const b of $('hand').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === hand));
}
// Who can throw the pitch picked: the league average, or one of the real pitchers who threw it in 2026. A pitch none of
// them threw has only the league's.
function byOptions() {
  const who = throwers(state.pitch);
  if (!who.some(a => a.key === state.by)) state.by = null;
  $('by').innerHTML = `<option value="">${who.length ? 'the league average' : 'the league average only'}</option>`
    + who.map(a => `<option value="${a.key}">${a.name}${a.hand === 'L' ? ' (lefty)' : ''}</option>`).join('');
  $('by').disabled = !who.length;
  $('by').value = state.by || '';
}
$('spinview').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  spin.set({ view: b.dataset.v });
  for (const x of $('spinview').querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
});
$('ghost').addEventListener('change', e => { state.ghost = e.target.checked; stage.set({ ghost: state.ghost }); legend(); caption(); });
$('throw').addEventListener('click', throwNow);
$('pair').addEventListener('change', e => { state.pair = e.target.value || null; legend(); speedReadout(); throwNow(); address(); });
// The speed over the picture: both pitches' when two are thrown together, "94.8 · 86.0 mph".
function speedReadout() {
  $('ro-mph').textContent = [thrown(), pairThrown()].filter(Boolean).map(p => p.n.mph.toFixed(1)).join(' · ');
}

// What can be thrown with it: any other pitch, the usual partner first; thrown by a real pitcher, his other pitches.
function pairOptions() {
  const p = state.pitch, arm = armByKey(state.by);
  if (arm) {
    const mine = arm.pitches.map(e => BY_CODE[e.code]).filter(q => q && q !== p);
    if (!mine.some(q => q.code === state.pair)) state.pair = null;
    $('pair').innerHTML = `<option value="">nothing else</option>` + mine.map(q => `<option value="${q.code}">${q.name}</option>`).join('');
  } else {
    const usual = BY_CODE[p.pair];
    const others = PITCHES.filter(q => q !== p && q !== usual);
    $('pair').innerHTML = `<option value="">nothing else</option>`
      + (usual ? `<option value="${usual.code}">${usual.name} (usual partner)</option>` : '')
      + others.map(q => `<option value="${q.code}">${q.name}</option>`).join('');
  }
  if (state.pair === p.code) state.pair = null;
  $('pair').value = state.pair || '';
}

function legend() {
  // Each pitch's time, beside its name on a phone (see readoutLoop), is filled in by legendTimes.
  const items = [`<span><i class="ln" style="--c:${MAIN}"></i>${state.pitch.short}<span class="narrow t"></span></span>`];
  if (state.pair) items.push(`<span><i class="ln" style="--c:${PAIR}"></i>${BY_CODE[state.pair].short}<span class="narrow t"></span></span>`);
  // With two pitches the ghost is the first one's, and says so; on a phone that's in the caption, so the legend stays
  // narrow, with the two pitches' times in it.
  if (state.ghost) items.push(`<span><i class="ln dash"></i>${state.pair ? `<span class="wide">${state.pitch.short}, no spin</span><span class="narrow">No spin</span>` : 'No spin'}</span>`);
  items.push(`<span><i class="ring"></i><span class="wide">Decision point</span><span class="narrow">Decide</span></span>`);
  $('legend').innerHTML = items.join('');
  legendTimes();
}
// Two pitches' times, in the legend from the throw, so it's as wide from the start as it will be (and the field's
// labels keep clear of it), but shown only once they're in (.timed).
function legendTimes() {
  const s = stage.summary(), two = state.pair && s?.length > 1;
  $('legend').querySelectorAll('.t').forEach((el, i) => { el.textContent = two ? `\u00a0${s[i].f.T.toFixed(2)} s` : ''; });
}

const stretch = () => { const c = stage.camera(); return c.stretch ? (Math.round(c.stretch * 2) / 2).toString() : '1'; };
// What's on the picture: the camera, the ghost, the decision ring (from DECIDE, in js/flight.js) and the dots along each
// path (js/stage.js draws the ball every 1/30 of a second), then what two pitches thrown together show.
function caption() {
  const ring = `The dashed ring marks the ball ${DECIDE} seconds from the plate, when the hitter has to decide.`;
  const dots = 'The dots along each path are the ball every 1/30 of a second: the farther apart, the faster.';
  const cap = {
    catcher: `From behind the plate, about where the umpire’s eyes are. The dashed ghost is the same throw with no spin: the gap at the plate is what the spin did. The dashed ring marks the ball ${DECIDE} seconds from the plate, about when a hitter has to decide whether to swing. ${dots}`,
    side: `From the third-base side, pitcher on the left. Heights are stretched ${stretch()}× so the drop is easier to see. The dashed ghost is the same throw with no spin. ${ring} ${dots}`,
    top: `From above, pitcher on the left. Distances sideways are stretched ${stretch()}× so the break is easier to see. The dashed ghost is the same throw with no spin. ${ring} ${dots}`,
  }[state.view];
  // With reduced motion every throw starts where it finishes (js/stage.js), so Throw it again and the speeds change only
  // its scatter: it says why the ball doesn't fly.
  const still = stage.reduced ? 'Your device asks for less motion, so each throw is shown where it finishes.' : '';
  const arm = thrown().arm;
  const by = arm ? `Thrown as ${arm.name} threw it in ${SEASON}: his speed, spin, movement and release, aimed where the league’s goes.` : '';
  $('caption').textContent = [cap, by, pairing(), still].filter(Boolean).join(' ');
}
// Two pitches thrown together: what throwing them together shows. "When the hitter has to decide, the four-seam and the
// changeup are 8 inches apart; at the plate, 1 ft 7 in. The changeup gets there 0.04 s later. The ghost is the
// four-seam's."
function pairing() {
  if (!state.pair) return '';
  const a = apart(), one = lowerName(state.pitch), two = lowerName(BY_CODE[state.pair]);
  const when = a.later === 0 ? 'at the same moment' : `${Math.abs(a.later).toFixed(2)}\u00a0s ${a.later > 0 ? 'later' : 'sooner'}`;
  return `When the hitter has to decide, the ${one} and the ${two} are ${distance(a.decide)} apart; at the plate, ${distance(a.plate)}. The ${two} gets there ${when}.${state.ghost ? ` The ghost is the ${one}’s.` : ''}`;
}

// ---------------------------------------------------------------- charts
// The movement chart's tooltip, for a dot under the pointer or with focus. As WCAG 2.2 asks of content that shows on
// hover or focus (SC 1.4.13), Escape hides it, and it waits a moment after the pointer leaves the dot, so the pointer
// can move onto it; it goes once the pointer has left both.
const tip = $('tip');
let tipWait = 0;
const tooltip = {
  show(target, html) {
    clearTimeout(tipWait);
    tip.innerHTML = html;
    tip.hidden = false;
    const r = target.getBoundingClientRect(), t = tip.getBoundingClientRect();
    let x = r.left + r.width / 2 - t.width / 2, y = r.top - t.height - 8;
    if (y < 8) y = r.bottom + 8;
    x = Math.max(8, Math.min(innerWidth - t.width - 8, x));
    tip.style.left = `${x + scrollX}px`; tip.style.top = `${y + scrollY}px`;
  },
  hide() { clearTimeout(tipWait); tip.hidden = true; },
  leave() { clearTimeout(tipWait); tipWait = setTimeout(() => { if (!tip.matches(':hover')) tooltip.hide(); }, 300); },
};
tip.addEventListener('pointerleave', () => tooltip.leave());
addEventListener('keydown', e => { if (e.key === 'Escape' && !tip.hidden) tooltip.hide(); });
const chart = movementChart($('move'), { onPick: p => pick(p, { scroll: true }), tooltip });
const table = lineupTable($('lineup'), { onPick: p => pick(p, { scroll: true }) });
$('total').textContent = `${TOTAL.toLocaleString('en-US')} pitches`;

// ---------------------------------------------------------------- picking
function pick(p, { scroll = false, push = true } = {}) {
  state.pitch = p;
  byOptions();
  for (const b of picker.querySelectorAll('.chip')) b.setAttribute('aria-pressed', String(b.dataset.code === p.code));
  const chip = picker.querySelector(`[data-code="${p.code}"]`);
  // Keep the chosen chip in view in the sideways-scrolling picker on phones, without moving the page.
  if (chip && picker.scrollWidth > picker.clientWidth) {
    const left = chip.offsetLeft - picker.offsetLeft, right = left + chip.offsetWidth;
    if (left < picker.scrollLeft + 8 || right > picker.scrollLeft + picker.clientWidth - 8) picker.scrollTo({ left: Math.max(0, left - 90) });
  }
  pairOptions();
  speedReadout();
  renderCard();
  legend();
  chart.select(p.code);
  table.select(p.code);
  if (push) address();
  // Picked further down the page (the chart, the table, or previous and next at the foot of the card), the page goes up
  // to the pitch, and so does focus: to its name, which a screen reader then reads, and the next Tab goes on into the card
  // rather than back down the table out of sight. A chip in the picker is already in view, and keeps focus.
  const glide = scroll && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (scroll) {
    $('pitch').scrollIntoView({ behavior: glide ? 'smooth' : 'auto', block: 'start' });
    $('c-name').focus({ preventScroll: true });
  }
  // Gliding up, the page takes half a second or more to bring the picture back, longer than a fastball's windup and
  // flight at real speed: the throw waits at the release until most of the picture is in view.
  if (glide) holdUntilSeen(); else letGo();
  throwNow();
}
let letGo = () => {};
function holdUntilSeen() {
  letGo();
  stage.hold();
  const seen = new IntersectionObserver(es => { if (es.some(e => e.intersectionRatio >= 0.6)) letGo(); }, { threshold: 0.6 });
  const wait = setTimeout(() => letGo(), 1200); // in case the page never gets there
  letGo = () => { seen.disconnect(); clearTimeout(wait); stage.release(); letGo = () => {}; };
  seen.observe($('flight'));
}

// ---------------------------------------------------------------- the address
// A link to what's showing: the pitch, then the one thrown with it after a +, and .lefty for a left-hander, like
// #sweeper+sinker.lefty. The address is replaced rather than added to, so Back still leaves the page. (A framed one-file
// copy may not be allowed to change its address; that's fine.) The tab's title is the pitch's again too, after an
// at-bat's.
// Thrown by a real pitcher, his key takes the hand's place, his own: #slider.sale is Chris Sale's slider.
const here = () => `${state.pitch.slug}${state.pair ? `+${BY_CODE[state.pair].slug}` : ''}${state.by ? `.${state.by}` : state.hand === 'L' ? '.lefty' : ''}`;
function address() {
  if (location.hash.slice(1) !== here()) { try { history.replaceState(null, '', `#${here()}`); } catch {} }
  document.title = `${state.pitch.name} · Arsenal`;
}
// Reads a link like that. It's one only if it starts with a pitch, so #at-bat, an at-bat's or an inning's link (#ab.…,
// #inning.…) or a word that isn't a pitch gives null and leaves things as they are. A part it doesn't know is left out: #sweeper+nothing is the
// sweeper alone. A plain #sweeper is a right-hander's, as it always was. It's read the way an at-bat link is (parseLink,
// js/atbat.js): in lower case, so #Sweeper is the sweeper too, and without a bracket or quote a message stuck on the end.
function readLink(h) {
  if (/^(ab|inning)\./i.test(h)) return null;
  try { h = decodeURIComponent(h); } catch {}
  const [pitches, ...more] = trimmed(h.toLowerCase()).split('.');
  const [first, second] = pitches.split('+');
  const pitch = BY_SLUG[first], pair = BY_SLUG[second];
  if (!pitch) return null;
  // A pitcher who didn't throw it is left out, as a part it doesn't know is.
  const arm = throwers(pitch).find(a => more.includes(a.key)) || null;
  return { pitch, pair: pair && pair !== pitch ? pair.code : null, hand: arm ? arm.hand : more.includes('lefty') ? 'L' : 'R', by: arm?.key || null };
}
// A link to a place on the page, like the lede's "pitch to a hitter", goes there itself, the way picking a pitch goes
// up to it (smoothly, unless the device asks for less motion), and the address follows the same way. Followed as a
// link, it would be read against the address of whatever page shows the one-file copy in a frame (written in with
// srcdoc), and the frame would leave the copy for that page. Focus goes there too, so the next Tab is inside it, as it
// would be after following the link.
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const to = document.getElementById(a.getAttribute('href').slice(1));
  if (!to) return;
  e.preventDefault();
  to.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  if (!to.hasAttribute('tabindex')) to.tabIndex = -1;
  to.focus({ preventScroll: true });
  try { history.replaceState(null, '', a.getAttribute('href')); } catch {}
});
function follow(link) {
  setHand(link.hand);
  state.by = link.by;
  state.pair = link.pair;
  pick(link.pitch, { push: false });
}

// Pitch to a hitter. A link like #ab.v3.skenes.R.k3x9a.FF6.SL23 replays one at-bat, #inning.v3.skenes.R.k3x9a.FF6... a
// whole inning, and one starting #ab. or #inning. that can't be read opens a new one that says so (load).
const atBat = setupAtBat({ dark: isDark() });
// Be the hitter: name a pitch from behind the plate, or step in against one.
const hit = setupHit({ dark: isDark() });
addEventListener('hashchange', () => {
  const h = location.hash.slice(1);
  if (atBat.load(h)) { $('at-bat').scrollIntoView(); return; }
  const link = readLink(h);
  if (link && (link.pitch !== state.pitch || link.pair !== state.pair || link.hand !== state.hand || link.by !== state.by)) follow(link);
});

function applyTheme() {
  stage.set({ dark: isDark() });
  atBat.setDark(isDark());
  hit.setDark(isDark());
  spin.colors = { ink: css('--ink'), muted: css('--muted'), accent: css('--accent'), ring: css('--line-strong') };
}
darkQuery.addEventListener('change', applyTheme);
new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
applyTheme();
caption();
const opened = readLink(location.hash.slice(1));
if (opened) follow(opened);
else pick(PITCHES[0], { push: false });
if (atBat.load(location.hash.slice(1))) $('at-bat').scrollIntoView();

// Hooks for the screenshot and test scripts.
window.arsenal = { state, stage, atBat, hit, pick: code => pick(BY_CODE[code]), set: o => { Object.assign(state, o); throwNow(); } };

// The one-file copy (data-single) has no service worker to register.
if ('serviceWorker' in navigator && isSecureContext && !('single' in document.documentElement.dataset)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
void famName;
