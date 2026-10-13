// Wires the page together: the picker, the stage, the card and the charts.
import { PITCHES, FAMILIES, BY_CODE, BY_SLUG } from './pitches.js';
import { TOTAL, SEASON } from './numbers.js';
import { Stage } from './stage.js';
import { SpinPanel, SLOW, tilt } from './spin.js';
import { drawGrip } from './grip.js';
import { movementChart, lineupTable, famName } from './charts.js';
import { DECIDE, throwPitch } from './flight.js';

const $ = id => document.getElementById(id);
const fmt = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toLocaleString('en-US', { maximumFractionDigits: d });
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

let roRaf = 0;
function readoutLoop() {
  cancelAnimationFrame(roRaf);
  $('landed').textContent = '';
  const tick = () => {
    const s = stage.summary();
    if (s) {
      const main = s[0];
      const t = stage.gameTime();
      if (!main.arrived) {
        $('ro-time').textContent = t === 0 ? 'Ready…' : `${t.toFixed(2)} s`;
      } else {
        $('ro-time').textContent = s.length > 1
          ? s.map(x => `${x.f.p.short} ${x.f.T.toFixed(2)} s`).join(' · ')
          : `${main.f.T.toFixed(2)} s to the plate`;
      }
      const deciding = s.some(x => t >= x.f.T - DECIDE && t < x.f.T) && state.speed < 1;
      $('frame').classList.toggle('deciding', deciding);
      if (!s.every(x => x.arrived) || t === 0) { roRaf = requestAnimationFrame(tick); return; }
      // Every ball is in: say it once to a screen reader, since the time above changes every frame.
      $('landed').textContent = s.length > 1
        ? s.map(x => `${x.f.p.short} ${x.f.T.toFixed(2)} seconds`).join(', ')
        : `${main.f.p.short}, ${main.f.T.toFixed(2)} seconds to the plate`;
    }
  };
  roRaf = requestAnimationFrame(tick);
}
$('flight').parentElement.id = 'frame';
const cue = document.createElement('div');
cue.className = 'cue';
cue.textContent = 'Swing or take? Decide now.';
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
  const share = n.share < 1 ? fmt(n.share, 2) : fmt(n.share, 1);
  $('c-stats').innerHTML = [
    stat('Speed', `${n.mph.toFixed(1)} mph`, n.low ? `most ${Math.round(n.low)}–${Math.round(n.high)}` : ''),
    stat('Spin', `${fmt(n.rpm, 0)} rpm`, p.code === 'KN' ? 'barely turning' : `${Math.round(n.rpm / 60)} turns a second`),
    // A no-break space keeps "in" with its number in the narrow box ("glove side 3.9 in", not "in" on a line alone).
    stat('Spin moves it', `${n.rise >= 0 ? '↑' : '↓'} ${inches(n.rise)}`, `${n.arm >= 0 ? 'arm side' : 'glove side'} ${fmt(Math.abs(n.arm))} in`),
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
  $('c-spin').textContent = spinText;
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
seg('hand', 'hand', v => v, () => { renderCard(); throwNow(); });
$('spinview').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  spin.set({ view: b.dataset.v });
  for (const x of $('spinview').querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
});
$('ghost').addEventListener('change', e => { state.ghost = e.target.checked; stage.set({ ghost: state.ghost }); legend(); });
$('throw').addEventListener('click', throwNow);
$('pair').addEventListener('change', e => { state.pair = e.target.value || null; legend(); throwNow(); });

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
  if (state.ghost) items.push(`<span><i class="ln dash"></i>No spin</span>`);
  items.push(`<span><i class="ring"></i>Decision point</span>`);
  $('legend').innerHTML = items.join('');
}

const stretch = () => { const c = stage.camera(); return c.stretch ? (Math.round(c.stretch * 2) / 2).toString() : '1'; };
function caption() {
  const cap = {
    catcher: 'From behind the plate, about where the umpire’s eyes are. The dashed ghost is the same throw with no spin: the gap at the plate is what the spin did. The dashed ring marks the ball 0.175 seconds from the plate, about when a hitter has to decide whether to swing.',
    side: `From the third-base side, pitcher on the left. Heights are stretched ${stretch()}× so the drop is easier to see. The dashed ghost is the same throw with no spin.`,
    top: `From above, pitcher on the left. Distances sideways are stretched ${stretch()}× so the break is easier to see. The dashed ghost is the same throw with no spin.`,
  }[state.view];
  $('caption').textContent = cap;
}

// ---------------------------------------------------------------- charts
const tip = $('tip');
const tooltip = {
  show(target, html) {
    tip.innerHTML = html;
    tip.hidden = false;
    const r = target.getBoundingClientRect(), t = tip.getBoundingClientRect();
    let x = r.left + r.width / 2 - t.width / 2, y = r.top - t.height - 8;
    if (y < 8) y = r.bottom + 8;
    x = Math.max(8, Math.min(innerWidth - t.width - 8, x));
    tip.style.left = `${x + scrollX}px`; tip.style.top = `${y + scrollY}px`;
  },
  hide() { tip.hidden = true; },
};
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
  $('ro-mph').textContent = p.n.mph.toFixed(1);
  pairOptions();
  renderCard();
  legend();
  chart.select(p.code);
  table.select(p.code);
  // A framed one-file copy may not be allowed to change its address; that's fine.
  if (push && location.hash.slice(1) !== p.slug) { try { history.replaceState(null, '', `#${p.slug}`); } catch {} }
  if (scroll) $('pitch').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  throwNow();
}

addEventListener('hashchange', () => { const p = BY_SLUG[location.hash.slice(1)]; if (p && p !== state.pitch) pick(p, { push: false }); });

function applyTheme() {
  stage.set({ dark: isDark() });
  spin.colors = { ink: css('--ink'), muted: css('--muted'), accent: css('--accent'), ring: css('--line-strong') };
}
darkQuery.addEventListener('change', applyTheme);
new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
applyTheme();
caption();
pick(BY_SLUG[location.hash.slice(1)] || PITCHES[0], { push: false });

// Hooks for the screenshot and test scripts.
window.arsenal = { state, stage, pick: code => pick(BY_CODE[code]), set: o => { Object.assign(state, o); throwNow(); } };

// The one-file copy (data-single) has no service worker to register.
if ('serviceWorker' in navigator && isSecureContext && !('single' in document.documentElement.dataset)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
void famName;
