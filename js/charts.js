// The whole arsenal at once: a movement chart and a table of share, speed and misses.
import { PITCHES, FAMILIES } from './pitches.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};
const fmt = (v, d = 1) => v.toFixed(d).replace(/\.0$/, '');
const famName = Object.fromEntries(FAMILIES.map(f => [f.id, f.name]));

// Where each name would rather sit beside its dot; the placer tries the others if that spot is taken.
const PREFER = { FF: 'n', SI: 'e', FC: 'e', SL: 'e', ST: 'w', CU: 's', KC: 'e', SV: 'w', CH: 'e', FS: 'w', FO: 'e', KN: 'e', EP: 'w' };
const ORDER = ['e', 'w', 'n', 's', 'ne', 'se', 'nw', 'sw'];

// Drawn at the size it's shown, so the text stays readable on a phone. Redrawn when that changes.
export function movementChart(host, opts) {
  let selected = null, width = 0, api = null;
  const draw = () => {
    const w = Math.round(Math.min(680, Math.max(300, host.clientWidth)));
    if (w === width) return;
    width = w;
    api = drawMovement(host, w, opts);
    if (selected) api.select(selected);
  };
  new ResizeObserver(draw).observe(host);
  draw();
  // Labels are placed by measuring them, so place them again once the fonts are in.
  document.fonts?.ready.then(() => { width = 0; draw(); });
  return { select(code) { selected = code; api?.select(code); } };
}

function drawMovement(host, W, { onPick, tooltip }) {
  const H = Math.round(Math.max(340, W * 0.8)), m = { l: 52, r: 12, t: 14, b: 42 };
  const k = Math.min(1, W / 560);
  const x = v => m.l + ((v + 18) / 36) * (W - m.l - m.r);
  const y = v => m.t + ((20 - v) / 34) * (H - m.t - m.b);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'move-chart', role: 'img', 'aria-labelledby': 'move-title move-desc' });
  host.replaceChildren(svg);
  const grid = el('g', { class: 'grid' }, svg);
  for (let v = -18; v <= 18; v += 6) {
    el('line', { x1: x(v), x2: x(v), y1: m.t, y2: H - m.b, class: v === 0 ? 'zero' : '' }, grid);
    el('text', { x: x(v), y: H - m.b + 16, class: 'tick', 'text-anchor': 'middle' }, grid).textContent = v === 0 ? '0' : `${Math.abs(v)}`;
  }
  for (let v = -12; v <= 18; v += 6) {
    el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: v === 0 ? 'zero' : '' }, grid);
    el('text', { x: m.l - 8, y: y(v) + 4, class: 'tick', 'text-anchor': 'end' }, grid).textContent = `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}`;
  }
  el('text', { x: W - m.r, y: H - 8, class: 'axis', 'text-anchor': 'end' }, svg).textContent = 'Arm side, inches →';
  el('text', { x: m.l, y: H - 8, class: 'axis', 'text-anchor': 'start' }, svg).textContent = '← Glove side';
  // The vertical axis, written up the left edge: drops below zero, holds up above it.
  const y0 = y(0);
  el('text', { x: 0, y: 0, class: 'axis', 'text-anchor': 'start', transform: `translate(14 ${y0 - 8}) rotate(-90)` }, svg).textContent = 'Holds up →';
  el('text', { x: 0, y: 0, class: 'axis', 'text-anchor': 'end', transform: `translate(14 ${y0 + 8}) rotate(-90)` }, svg).textContent = '← Drops';

  const dots = el('g', {}, svg);
  const items = [...PITCHES].sort((a, b) => b.n.share - a.n.share);
  const nodes = {};
  const taken = [];
  const placed = [];
  for (const p of items) {
    const r = Math.max(4.5, Math.min(24, Math.sqrt(p.n.share) * 4.3 * k));
    const g = el('g', { class: `dot fam-${p.fam}`, tabindex: '0', role: 'button', 'aria-label': `${p.name}: ${fmt(p.n.rise)} inches of rise, ${fmt(Math.abs(p.n.arm))} inches to the ${p.n.arm >= 0 ? 'arm' : 'glove'} side` }, dots);
    const cx = x(p.n.arm), cy = y(p.n.rise);
    el('circle', { cx, cy, r: r + 9, class: 'hit' }, g);
    el('circle', { cx, cy, r: r + 4, class: 'sel' }, g);
    el('circle', { cx, cy, r, class: 'mark' }, g);
    const label = el('text', { x: cx, y: cy, class: 'name' }, g);
    label.textContent = p.short;
    taken.push({ x: cx - r - 2, y: cy - r - 2, w: 2 * r + 4, h: 2 * r + 4 });
    placed.push({ p, label, cx, cy, r });
    const show = () => tooltip.show(g, `<b>${p.name}</b><br>${fmt(p.n.rise)} in ${p.n.rise >= 0 ? 'up' : 'down'}, ${fmt(Math.abs(p.n.arm))} in ${p.n.arm >= 0 ? 'arm side' : 'glove side'}<br>${fmt(p.n.mph)} mph · ${fmt(p.n.share, p.n.share < 1 ? 2 : 1)}% of pitches`);
    g.addEventListener('pointerenter', show);
    g.addEventListener('focus', show);
    g.addEventListener('pointerleave', () => tooltip.hide());
    g.addEventListener('blur', () => tooltip.hide());
    g.addEventListener('click', () => onPick(p));
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(p); } });
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
    select(code) { for (const [k, g] of Object.entries(nodes)) g.classList.toggle('on', k === code); },
  };
}

export function lineupTable(host, { onPick }) {
  const rows = [...PITCHES].sort((a, b) => b.n.share - a.n.share);
  const maxShare = rows[0].n.share;
  const lo = 35, hi = 105;
  const pos = v => ((v - lo) / (hi - lo)) * 100;
  const table = document.createElement('table');
  table.className = 'lineup';
  table.innerHTML = `<caption class="sr">Every pitch type in 2026: share of all pitches, speed, and misses per 100 swings</caption>
    <thead><tr><th scope="col">Pitch</th><th scope="col">Share of pitches</th><th scope="col">Speed, mph <span class="hint">(dot: average · bar: middle 80% of pitchers)</span></th><th scope="col" class="num">Misses per<br> 100 swings</th></tr></thead>`;
  const body = document.createElement('tbody');
  for (const p of rows) {
    const n = p.n;
    const tr = document.createElement('tr');
    tr.className = `fam-${p.fam}`;
    tr.dataset.code = p.code;
    const share = n.share < 1 ? fmt(n.share, 2) : fmt(n.share, 1);
    tr.innerHTML = `
      <th scope="row"><button type="button"><span class="key" aria-hidden="true"></span>${p.short}</button></th>
      <td><div class="cell"><span class="bar"><span style="width:${Math.max(0.6, (n.share / maxShare) * 100)}%"></span></span><span class="val">${share}%</span></div></td>
      <td><div class="cell"><span class="range" aria-label="${fmt(n.mph)} mph on average; most between ${fmt(n.low)} and ${fmt(n.high)}"><span class="span" style="left:${pos(n.low)}%;width:${Math.max(0.8, pos(n.high) - pos(n.low))}%"></span><span class="avg" style="left:${pos(n.mph)}%"></span></span><span class="val">${fmt(n.mph)}</span></div></td>
      <td class="num">${n.whiff == null ? '–' : Math.round(n.whiff)}</td>`;
    tr.querySelector('button').addEventListener('click', () => onPick(p));
    body.appendChild(tr);
  }
  table.appendChild(body);
  // Speed scale under the speed column.
  const foot = document.createElement('tfoot');
  foot.innerHTML = `<tr><td></td><td></td><td><div class="cell"><span class="scale">${[40, 60, 80, 100].map(v => `<span style="left:${pos(v)}%">${v}</span>`).join('')}</span><span class="val"></span></div></td><td></td></tr>`;
  table.appendChild(foot);
  host.replaceChildren(table);
  return {
    select(code) { for (const tr of body.rows) tr.classList.toggle('on', tr.dataset.code === code); },
  };
}

export { famName };
