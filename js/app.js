// Wires the page together: the picker, the stage, the card and the charts.
import { PITCHES, FAMILIES, BY_CODE, BY_SLUG } from './pitches.js';
import { TOTAL, SEASON } from './numbers.js';
import { Stage } from './stage.js';
import { SpinPanel, SLOW, tilt } from './spin.js';
import { drawGrip } from './grip.js';
import { movementChart, lineupTable, famName, shareText } from './charts.js';
import { DECIDE, throwPitch } from './flight.js';
import { setupAtBat } from './atbat-ui.js';

const $ = id => document.getElementById(id);
// Inches and mph keep their one decimal place ("↑ 1.0 in", "89.0 mph"), as the speed does; rpm (fmt(v, 0)) has none and
// a thousands comma.
const fmt = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const MAIN = '#ffd23f', PAIR = '#7fd3ff';
const FAM_SINGULAR = { fast: 'Fastball', break: 'Breaking ball', off: 'Off-speed pitch', odd: 'Oddity' };

const state = {
  pitch: PITCHES[0],
  pair: null,
  hand: 'R',
  view: 'catcher',
  speed: 0.25,
  ghost: true,
};

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
  stage.throw(state.pitch, state.pair ? BY_CODE[state.pair] : null);
  caption();
  readoutLoop();
}

// Two pitches thrown together, worked out from throws with no scatter (rng 0.5, no jitter) so every throw says the same:
// how far apart they are at their decision points, where the hitter has to decide, and at the plate (as he sees them:
// across and up and down, in inches), and how much later the second gets there, in seconds.
function apart() {
  const main = throwPitch(state.pitch, { hand: state.hand, rng: () => 0.5 });
  const pair = throwPitch(BY_CODE[state.pair], { hand: state.hand, rng: () => 0.5, release: main.release });
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
// paint.
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
      } else {
        write('ro-time', s.length > 1
          ? s.map(x => `${x.f.p.short} ${x.f.T.toFixed(2)} s`).join(' · ')
          : `${main.f.T.toFixed(2)} s to the plate`);
      }
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

function renderCard() {
  const p = state.pitch, n = p.n;
  document.title = `${p.name} · Arsenal`;
  $('card').className = `card fam-${p.fam}`;
  $('c-fam').innerHTML = `<span class="key" aria-hidden="true"></span>${FAM_SINGULAR[p.fam]} <span class="code">${p.code}</span>`;
  $('c-name').innerHTML = `${p.name}${p.aka ? ` <small>or ${p.aka}</small>` : ''}`;
  $('c-line').textContent = p.line;
  const share = shareText(n.share);
  $('c-stats').innerHTML = [
    // The range is over pitchers' average speeds (tools/statcast.mjs), not single pitches.
    stat('Speed', `${n.mph.toFixed(1)} mph`, n.low ? `most pitchers ${Math.round(n.low)}–${Math.round(n.high)}` : ''),
    stat('Spin', `${fmt(n.rpm, 0)} rpm`, p.code === 'KN' ? 'barely turning' : `${Math.round(n.rpm / 60)} turns a second`),
    // The arrow is for the eye: a screen reader hears "15.6 inches up", not "upwards arrow 15.6 in".
    // A no-break space keeps "in" with its number in the narrow box ("glove side 3.9 in", not "in" on a line alone).
    stat('Spin moves it', `<span aria-hidden="true">${n.rise >= 0 ? '↑' : '↓'} ${inches(n.rise)}</span><span class="sr">${fmt(Math.abs(n.rise))} inches ${n.rise >= 0 ? 'up' : 'down'}</span>`, `${n.arm >= 0 ? 'arm side' : 'glove side'} ${fmt(Math.abs(n.arm))} in`),
    stat('Drops', feetInches(n.drop), 'counting gravity'),
    stat('Thrown', `${share}%`, `${n.pitches.toLocaleString('en-US')} pitches`),
    stat('Misses', n.whiff == null ? '–' : `${Math.round(n.whiff)}`, 'per 100 swings'),
  ].join('');
  $('c-grip').textContent = p.grip;
  $('c-how').textContent = p.how;
  const t = tilt(p, state.hand);
  // Turns on the way in: the spin rate times the flight time the readout shows.
  const turns = (n.rpm / 60) * throwPitch(p, { hand: state.hand, rng: () => 0.5 }).T;
  let spinText = `${fmt(n.rpm, 0)} rpm, shown ${SLOW}× slower: about ${Math.round(turns)} turns on the way to the plate.`;
  if (p.code === 'KN') spinText = `About ${fmt(n.rpm, 0)} rpm, shown ${SLOW}× slower: two or three turns on the whole way in, so the seams drift instead of spinning.`;
  else {
    spinText += ` The arrow on the clock points where the spin pushes it: ${t.text}, ${direction(n)}.`;
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
seg('hand', 'hand', v => v, () => { renderCard(); throwNow(); address(); });
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
  $('ro-mph').textContent = [state.pitch, state.pair && BY_CODE[state.pair]].filter(Boolean).map(p => p.n.mph.toFixed(1)).join(' · ');
}

function pairOptions() {
  const p = state.pitch;
  const usual = BY_CODE[p.pair];
  const others = PITCHES.filter(q => q !== p && q !== usual);
  $('pair').innerHTML = `<option value="">nothing else</option>`
    + (usual ? `<option value="${usual.code}">${usual.name} (usual partner)</option>` : '')
    + others.map(q => `<option value="${q.code}">${q.name}</option>`).join('');
  if (state.pair === p.code) state.pair = null;
  $('pair').value = state.pair || '';
}

function legend() {
  const items = [`<span><i class="ln" style="--c:${MAIN}"></i>${state.pitch.short}</span>`];
  if (state.pair) items.push(`<span><i class="ln" style="--c:${PAIR}"></i>${BY_CODE[state.pair].short}</span>`);
  // With two pitches the ghost is the first one's, and says so; on a phone that's in the caption, so the legend keeps
  // clear of the two pitches' times.
  if (state.ghost) items.push(`<span><i class="ln dash"></i>${state.pair ? `<span class="wide">${state.pitch.short}, no spin</span><span class="narrow">No spin</span>` : 'No spin'}</span>`);
  items.push(`<span><i class="ring"></i><span class="wide">Decision point</span><span class="narrow">Decide</span></span>`);
  $('legend').innerHTML = items.join('');
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
  $('caption').textContent = [cap, pairing(), still].filter(Boolean).join(' ');
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
  if (scroll) {
    $('pitch').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    $('c-name').focus({ preventScroll: true });
  }
  throwNow();
}

// ---------------------------------------------------------------- the address
// A link to what's showing: the pitch, then the one thrown with it after a +, and .lefty for a left-hander, like
// #sweeper+sinker.lefty. The address is replaced rather than added to, so Back still leaves the page. (A framed one-file
// copy may not be allowed to change its address; that's fine.) The tab's title is the pitch's again too, after an
// at-bat's.
const here = () => `${state.pitch.slug}${state.pair ? `+${BY_CODE[state.pair].slug}` : ''}${state.hand === 'L' ? '.lefty' : ''}`;
function address() {
  if (location.hash.slice(1) !== here()) { try { history.replaceState(null, '', `#${here()}`); } catch {} }
  document.title = `${state.pitch.name} · Arsenal`;
}
// Reads a link like that. It's one only if it starts with a pitch, so #at-bat, an at-bat's link (#ab.…) or a word that
// isn't a pitch gives null and leaves things as they are. A part it doesn't know is left out: #sweeper+nothing is the
// sweeper alone. A plain #sweeper is a right-hander's, as it always was. It's read the way an at-bat link is (parseLink,
// js/atbat.js): in lower case, so #Sweeper is the sweeper too, and without a bracket or quote a message stuck on the end.
function readLink(h) {
  if (/^ab\./i.test(h)) return null;
  try { h = decodeURIComponent(h); } catch {}
  const [pitches, ...more] = h.toLowerCase().replace(/[^0-9a-z]+$/, '').split('.');
  const [first, second] = pitches.split('+');
  const pitch = BY_SLUG[first], pair = BY_SLUG[second];
  if (!pitch) return null;
  return { pitch, pair: pair && pair !== pitch ? pair.code : null, hand: more.includes('lefty') ? 'L' : 'R' };
}
function follow(link) {
  state.hand = link.hand;
  for (const b of $('hand').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === state.hand));
  state.pair = link.pair;
  pick(link.pitch, { push: false });
}

// Pitch to a hitter. A link like #ab.skenes.R.k3x9a.FF6.SL23 replays one at-bat, and one starting #ab. that can't be
// read opens a new at-bat that says so (load).
const atBat = setupAtBat({ dark: isDark() });
addEventListener('hashchange', () => {
  const h = location.hash.slice(1);
  if (atBat.load(h)) { $('at-bat').scrollIntoView(); return; }
  const link = readLink(h);
  if (link && (link.pitch !== state.pitch || link.pair !== state.pair || link.hand !== state.hand)) follow(link);
});

function applyTheme() {
  stage.set({ dark: isDark() });
  atBat.setDark(isDark());
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
window.arsenal = { state, stage, atBat, pick: code => pick(BY_CODE[code]), set: o => { Object.assign(state, o); throwNow(); } };

// The one-file copy (data-single) has no service worker to register.
if ('serviceWorker' in navigator && isSecureContext && !('single' in document.documentElement.dataset)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
void famName;
