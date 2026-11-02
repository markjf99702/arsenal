// The whole arsenal at once: a movement chart and a table of share, speed and misses.
import { PITCHES, FAMILIES } from './pitches.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};
// Rounded like the card rounds. toFixed shows the sinker's 16.65% as 16.6, because of how 16.65 is stored, so it's
// rounded first. Speeds, shares and inches keep their places ("86.0", "8.0", "1.0 in"), as on the card; shares under 1%
// get two.
const fixed = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d);
export const shareText = share => fixed(share, share < 1 ? 2 : 1);
const mphText = mph => fixed(mph);
const famName = Object.fromEntries(FAMILIES.map(f => [f.id, f.name]));

// Where each name would rather sit beside its dot; the placer tries the others if that spot is taken.
const PREFER = { FF: 'n', SI: 'e', FC: 'e', SL: 'e', ST: 'w', CU: 's', KC: 'e', SV: 'w', CH: 'e', FS: 'w', FO: 'e', KN: 'e', EP: 'w' };
const ORDER = ['e', 'w', 'n', 's', 'ne', 'se', 'nw', 'sw'];

// Drawn at the size it's shown, so the text stays readable on a phone. Redrawn when that changes.
export function movementChart(host, opts) {
  let selected = null, arm = null, width = 0, api = null;
  const draw = () => {
    const w = Math.round(Math.min(680, Math.max(300, host.clientWidth)));
    if (w === width) return;
    width = w;
    api = drawMovement(host, w, opts);
    if (selected) api.select(selected);
    api.pitcher(arm);
  };
  new ResizeObserver(draw).observe(host);
  draw();
  // Labels are placed by measuring them, so place them again once the fonts are in.
  document.fonts?.ready.then(() => { width = 0; draw(); });
  return { select(code) { selected = code; api?.select(code); }, pitcher(a) { arm = a; api?.pitcher(a); } };
}

function drawMovement(host, W, { onPick, tooltip }) {
  const H = Math.round(Math.max(340, W * 0.8)), m = { l: 52, r: 12, t: 14, b: 42 };
  const k = Math.min(1, W / 560);
  const x = v => m.l + ((v + 18) / 36) * (W - m.l - m.r);
  const y = v => m.t + ((20 - v) / 34) * (H - m.t - m.b);
  // A group of the dots, each a button with its words, named by the chart's heading and described by the words under
  // it. (As an img, its dots would be presentational; and the grid's numbers and the axes' words, which the description
  // already explains, would be read out one by one, so they're hidden.)
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'move-chart', role: 'group', 'aria-labelledby': 'move-title', 'aria-describedby': 'move-desc' });
  host.replaceChildren(svg);
  const grid = el('g', { class: 'grid', 'aria-hidden': 'true' }, svg);
  for (let v = -18; v <= 18; v += 6) {
    el('line', { x1: x(v), x2: x(v), y1: m.t, y2: H - m.b, class: v === 0 ? 'zero' : '' }, grid);
    el('text', { x: x(v), y: H - m.b + 16, class: 'tick', 'text-anchor': 'middle' }, grid).textContent = v === 0 ? '0' : `${Math.abs(v)}`;
  }
  for (let v = -12; v <= 18; v += 6) {
    el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: v === 0 ? 'zero' : '' }, grid);
    el('text', { x: m.l - 8, y: y(v) + 4, class: 'tick', 'text-anchor': 'end' }, grid).textContent = `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}`;
  }
  const axes = el('g', { 'aria-hidden': 'true' }, svg);
  el('text', { x: W - m.r, y: H - 8, class: 'axis', 'text-anchor': 'end' }, axes).textContent = 'Arm side, inches →';
  el('text', { x: m.l, y: H - 8, class: 'axis', 'text-anchor': 'start' }, axes).textContent = '← Glove side';
  // The vertical axis, written up the left edge: drops below zero, holds up above it.
  const y0 = y(0);
  el('text', { x: 0, y: 0, class: 'axis', 'text-anchor': 'start', transform: `translate(14 ${y0 - 8}) rotate(-90)` }, axes).textContent = 'Holds up →';
  el('text', { x: 0, y: 0, class: 'axis', 'text-anchor': 'end', transform: `translate(14 ${y0 + 8}) rotate(-90)` }, axes).textContent = '← Drops';

  // Behind the dots, how far pitchers differ: a faint oval round each dot over the middle 80% of pitchers by rise and by
  // arm-side movement (spread, from tools/statcast.mjs). The chosen pitch's always shows; another's while its dot is
  // under the pointer or has focus.
  const clip = el('clipPath', { id: 'move-plot' }, svg);
  el('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b }, clip);
  const spreads = el('g', { class: 'spreads', 'aria-hidden': 'true', 'clip-path': 'url(#move-plot)' }, svg);
  const ovals = {};
  for (const p of PITCHES) {
    const sp = p.n.spread;
    if (!sp) continue;
    ovals[p.code] = el('ellipse', { class: `spread fam-${p.fam}`, cx: (x(sp.arm[0]) + x(sp.arm[1])) / 2, cy: (y(sp.rise[0]) + y(sp.rise[1])) / 2, rx: Math.abs(x(sp.arm[1]) - x(sp.arm[0])) / 2, ry: Math.abs(y(sp.rise[1]) - y(sp.rise[0])) / 2 }, spreads);
  }
  // A real pitcher's pitches, when the explorer's are thrown by one: a ring for each, joined to the league's dot.
  const his = el('g', { class: 'his-rings', 'aria-hidden': 'true' }, svg);
  const dots = el('g', {}, svg);
  const items = [...PITCHES].sort((a, b) => b.n.share - a.n.share);
  const nodes = {};
  const taken = [];
  const placed = [];
  for (const p of items) {
    const r = Math.max(4.5, Math.min(24, Math.sqrt(p.n.share) * 4.3 * k));
    // Which way spin moves it, in words: "10.3 in down" rather than "-10.3 in down".
    const rise = fixed(Math.abs(p.n.rise)), arm = fixed(Math.abs(p.n.arm));
    const up = p.n.rise >= 0 ? 'up' : 'down', side = p.n.arm >= 0 ? 'arm' : 'glove';
    const inches = s => `${s} inches`; // "1.0 inches", like any number with a decimal place
    // The middle 80% of pitchers, in words: "most pitchers 12.5 to 18.4 in up, 3.5 to 11.9 in arm side", the smaller
    // number first, and a range that crosses zero through it ("2.6 in down to 0.7 in up").
    const sp = p.n.spread;
    const span = ([lo, hi], unit, neg, pos) => (lo < 0 && hi > 0 ? `${fixed(-lo)} ${unit} ${neg} to ${fixed(hi)} ${unit} ${pos}`
      : lo < 0 ? `${fixed(-hi)} to ${fixed(-lo)} ${unit} ${neg}` : `${fixed(lo)} to ${fixed(hi)} ${unit} ${pos}`);
    const most = sp && `most pitchers ${span(sp.rise, 'in', 'down', 'up')}, ${span(sp.arm, 'in', 'glove side', 'arm side')}`;
    const said = sp && `Most pitchers ${span(sp.rise, 'inches', 'down', 'up')}, ${span(sp.arm, 'inches', 'to the glove side', 'to the arm side')}`;
    const g = el('g', { class: `dot fam-${p.fam}`, tabindex: '0', role: 'button', 'aria-label': `${p.name}: ${inches(rise)} ${up}, ${inches(arm)} to the ${side} side`, ...(said ? { 'aria-description': said } : {}) }, dots);
    const cx = x(p.n.arm), cy = y(p.n.rise);
    el('circle', { cx, cy, r: r + 9, class: 'hit' }, g);
    el('circle', { cx, cy, r: r + 4, class: 'sel' }, g);
    el('circle', { cx, cy, r, class: 'mark' }, g);
    const label = el('text', { x: cx, y: cy, class: 'name' }, g);
    label.textContent = p.short;
    taken.push({ x: cx - r - 2, y: cy - r - 2, w: 2 * r + 4, h: 2 * r + 4 });
    placed.push({ p, label, cx, cy, r });
    const show = () => { ovals[p.code]?.classList.add('near'); tooltip.show(g, `<b>${p.name}</b><br>${rise} in ${up}, ${arm} in ${side} side${most ? `<br>${most[0].toUpperCase()}${most.slice(1)}` : ''}<br>${mphText(p.n.mph)} mph · ${shareText(p.n.share)}% of pitches`); };
    const away = () => ovals[p.code]?.classList.remove('near');
    g.addEventListener('pointerenter', show);
    g.addEventListener('focus', show);
    g.addEventListener('pointerleave', () => { away(); tooltip.leave(); });
    g.addEventListener('blur', () => { away(); tooltip.hide(); });
    // Picking scrolls up to the pitch, and a tap leaves the dot focused, so hide the tooltip rather than leave it behind.
    const pickIt = () => { tooltip.hide(); onPick(p); };
    g.addEventListener('click', pickIt);
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickIt(); } });
    nodes[p.code] = g;
  }
  // Names: the biggest dots choose first; each takes its preferred side unless that's crowded.
  const hits = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const inside = a => a.x >= m.l + 2 && a.x + a.w <= W - m.r && a.y >= 0 && a.y + a.h <= H - m.b;
  for (const { p, label, cx, cy, r } of placed) {
    const w = label.getComputedTextLength?.() || p.short.length * 7, h = 14, gap = 5;
    const spots = {
      e: [cx + r + gap, cy - h / 2], w: [cx - r - gap - w, cy - h / 2],
      n: [cx - w / 2, cy - r - gap - h], s: [cx - w / 2, cy + r + gap],
      ne: [cx + r * 0.7, cy - r * 0.7 - h], se: [cx + r * 0.7, cy + r * 0.7],
      nw: [cx - r * 0.7 - w, cy - r * 0.7 - h], sw: [cx - r * 0.7 - w, cy + r * 0.7],
    };
    const tries = [PREFER[p.code] || 'e', ...ORDER];
    // First free spot in order of preference; failing that, the spot inside the chart that overlaps least.
    const overlap = b => taken.reduce((sum, t) => sum + (hits(t, b) ? (Math.min(t.x + t.w, b.x + b.w) - Math.max(t.x, b.x)) * (Math.min(t.y + t.h, b.y + b.h) - Math.max(t.y, b.y)) : 0), 0);
    const boxes = tries.map(d => ({ x: spots[d][0], y: spots[d][1], w, h })).filter(inside);
    let box = boxes.find(b => overlap(b) === 0) || boxes.sort((a, b) => overlap(a) - overlap(b))[0];
    if (!box) { const [bx, by] = spots[tries[0]]; box = { x: bx, y: by, w, h }; }
    taken.push(box);
    label.setAttribute('x', box.x);
    label.setAttribute('y', box.y + h - 3);
  }
  return {
    select(code) {
      for (const [k, g] of Object.entries(nodes)) g.classList.toggle('on', k === code);
      for (const [k, o] of Object.entries(ovals)) o.classList.toggle('on', k === code);
    },
    pitcher(arm) {
      his.replaceChildren();
      for (const e of arm?.pitches || []) {
        const q = PITCHES.find(p => p.code === e.code);
        if (!q) continue;
        const g = el('g', { class: `fam-${q.fam}`, 'data-code': e.code }, his);
        el('line', { x1: x(q.n.arm), y1: y(q.n.rise), x2: x(e.arm), y2: y(e.rise) }, g);
        el('circle', { cx: x(e.arm), cy: y(e.rise), r: 6.5 * Math.max(0.8, k) }, g);
      }
    },
  };
}

export function lineupTable(host, { onPick }) {
  const rows = [...PITCHES].sort((a, b) => b.n.share - a.n.share);
  const maxShare = rows[0].n.share;
  // The speeds run 70 to 100 mph, where every pitch but the eephus is, so the bars between 80 and 95 have room. The
  // eephus, at 45, sits off the scale at its left end, past a break in the line.
  const lo = 70, hi = 100;
  const pos = v => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
  const table = document.createElement('table');
  table.className = 'lineup';
  table.innerHTML = `<caption class="sr">Every pitch type in 2026: share of all pitches, speed, and misses per 100 swings</caption>
    <thead><tr><th scope="col">Pitch</th><th scope="col">Share of pitches</th><th scope="col">Speed, mph <span class="hint">(dot: average · bar: middle 80% of pitchers, by pitches thrown)</span></th><th scope="col" class="num">Misses per<br> 100 swings</th></tr></thead>`;
  const body = document.createElement('tbody');
  for (const p of rows) {
    const n = p.n;
    const tr = document.createElement('tr');
    tr.className = `fam-${p.fam}`;
    tr.dataset.code = p.code;
    const share = shareText(n.share);
    // No bar when the average is one pitcher's (the knuckleball's): there's no range of pitchers to show. The range is
    // over the pitchers' own average speeds, each counted as often as he threw it (tools/statcast.mjs). Off the scale
    // (the eephus), the dot sits at its left end past a break mark, with no bar.
    const off = n.mph < lo;
    const said = `${mphText(n.mph)} mph on average${n.low == null ? '' : `; most pitchers between ${mphText(n.low)} and ${mphText(n.high)}`}`;
    const bar = n.low == null || off ? '' : `<span class="span" style="left:${pos(n.low)}%;width:${Math.max(0.8, pos(n.high) - pos(n.low))}%"></span>`;
    const range = { said, bar: off ? '<span class="break"></span>' : bar };
    tr.innerHTML = `
      <th scope="row"><button type="button"><span class="key" aria-hidden="true"></span>${p.short}</button></th>
      <td><div class="cell"><span class="bar"><span style="width:${Math.max(0.6, (n.share / maxShare) * 100)}%"></span></span><span class="val">${share}%</span></div></td>
      <td><div class="cell"><span class="range${off ? ' off' : ''}" role="img" aria-label="${range.said}">${range.bar}<span class="avg" style="left:${pos(n.mph)}%"></span></span><span class="val">${mphText(n.mph)}</span></div></td>
      <td class="num">${n.whiff == null ? '–' : Math.round(n.whiff)}</td>`;
    tr.querySelector('button').addEventListener('click', () => onPick(p));
    body.appendChild(tr);
  }
  table.appendChild(body);
  // Speed scale under the speed column.
  const foot = document.createElement('tfoot');
  foot.innerHTML = `<tr><td></td><td></td><td><div class="cell"><span class="scale">${[70, 80, 90, 100].map(v => `<span style="left:${pos(v)}%">${v}</span>`).join('')}</span><span class="val"></span></div></td><td></td></tr>`;
  table.appendChild(foot);
  host.replaceChildren(table);
  return {
    select(code) { for (const tr of body.rows) tr.classList.toggle('on', tr.dataset.code === code); },
  };
}

export { famName };

// One pitcher's pitches on a small movement chart, as the whole arsenal's is drawn: how far spin moves each, up or down
// and to his arm or glove side, in inches. His are filled dots; each kind's league average is a hollow ring joined to
// his, unless they're the same place (the league-average righty's are the league's). `pitches` are { code, rise, arm }.
// Drawn at one size and scaled to fit, so it needs no redrawing.
export function pitcherChart(host, { pitches, label }) {
  const W = 320, H = 250, m = { l: 40, r: 8, t: 10, b: 26 };
  const x = v => m.l + ((v + 20) / 40) * (W - m.l - m.r);
  const y = v => m.t + ((20 - v) / 36) * (H - m.t - m.b);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'move-chart his-chart', role: 'img', 'aria-label': label });
  host.replaceChildren(svg);
  const grid = el('g', { class: 'grid', 'aria-hidden': 'true' }, svg);
  for (let v = -18; v <= 18; v += 6) {
    el('line', { x1: x(v), x2: x(v), y1: m.t, y2: H - m.b, class: v === 0 ? 'zero' : '' }, grid);
    el('text', { x: x(v), y: H - m.b + 12, class: 'tick', 'text-anchor': 'middle' }, grid).textContent = `${Math.abs(v)}`;
  }
  for (let v = -12; v <= 18; v += 6) {
    el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: v === 0 ? 'zero' : '' }, grid);
    el('text', { x: m.l - 5, y: y(v) + 3.5, class: 'tick', 'text-anchor': 'end' }, grid).textContent = `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}`;
  }
  el('text', { x: W - m.r, y: H - 3, class: 'axis', 'text-anchor': 'end' }, grid).textContent = 'Arm side →';
  el('text', { x: m.l, y: H - 3, class: 'axis', 'text-anchor': 'start' }, grid).textContent = '← Glove side';
  el('text', { x: 0, y: 0, class: 'axis', 'text-anchor': 'start', transform: `translate(9 ${y(0) - 6}) rotate(-90)` }, grid).textContent = 'Holds up →';
  el('text', { x: 0, y: 0, class: 'axis', 'text-anchor': 'end', transform: `translate(9 ${y(0) + 6}) rotate(-90)` }, grid).textContent = '← Drops';
  const marks = el('g', { 'aria-hidden': 'true' }, svg), names = [];
  // The rings and their lines first, so every dot is over every ring.
  for (const p of pitches) {
    const lg = PITCHES.find(q => q.code === p.code)?.n;
    if (!lg || Math.hypot(lg.arm - p.arm, lg.rise - p.rise) < 0.5) continue;
    const g = el('g', { class: `fam-${PITCHES.find(q => q.code === p.code).fam} his-league` }, marks);
    el('line', { x1: x(lg.arm), y1: y(lg.rise), x2: x(p.arm), y2: y(p.rise) }, g);
    el('circle', { cx: x(lg.arm), cy: y(lg.rise), r: 5.5 }, g);
  }
  const taken = [];
  for (const p of pitches) {
    const q = PITCHES.find(e => e.code === p.code), cx = x(p.arm), cy = y(p.rise);
    const g = el('g', { class: `fam-${q?.fam || 'odd'} his-own` }, marks);
    el('circle', { cx, cy, r: 6.5 }, g);
    const t = el('text', { x: cx, y: cy, class: 'name' }, g);
    t.textContent = q?.short || p.code;
    taken.push({ x: cx - 8, y: cy - 8, w: 16, h: 16 });
    names.push({ t, cx, cy, w: (q?.short || p.code).length * 6.6 });
  }
  // Each name beside its dot, on the first side that's free and inside the chart.
  const hits = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (const { t, cx, cy, w } of names) {
    const h = 12, sides = [[cx + 10, cy - h / 2], [cx - 10 - w, cy - h / 2], [cx - w / 2, cy - 10 - h], [cx - w / 2, cy + 10]];
    const boxes = sides.map(([bx, by]) => ({ x: bx, y: by, w, h })).filter(b => b.x >= m.l && b.x + b.w <= W - m.r && b.y >= 0 && b.y + b.h <= H - m.b);
    const box = boxes.find(b => !taken.some(o => hits(o, b))) || boxes[0] || { x: sides[0][0], y: sides[0][1], w, h };
    taken.push(box);
    t.setAttribute('x', box.x);
    t.setAttribute('y', box.y + h - 2);
  }
}
