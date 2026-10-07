// Refreshes js/numbers.js from Baseball Savant's Statcast search:  node tools/statcast.mjs [season]
// One request per pitch type, grouped by pitcher; the averages here weight each pitcher by how many they threw.
import { writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const season = Number(process.argv[2]) || 2026;
const TYPES = ['FF', 'SI', 'FC', 'SL', 'ST', 'CU', 'KC', 'SV', 'CS', 'CH', 'FS', 'FO', 'SC', 'KN', 'EP'];

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter(r => r.length === head.length).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

async function fetchType(code) {
  const url = 'https://baseballsavant.mlb.com/statcast_search/csv?all=true&hfGT=R%7C&player_type=pitcher'
    + `&hfPT=${code}%7C&hfSea=${season}%7C&min_pitches=0&min_results=0&min_pas=0&group_by=name`
    + '&sort_col=pitches&sort_order=desc';
  for (let tries = 0; ; tries++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status}`);
      return parseCSV(await res.text());
    } catch (e) {
      if (tries >= 3) throw e;
      await new Promise(r => setTimeout(r, 2000 * 2 ** tries));
    }
  }
}

const num = s => (s === '' || s == null || Number.isNaN(Number(s)) ? null : Number(s));
const round = (v, d = 1) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

// Active spin: the share of the spin that moves the ball (the rest is bullet spin). Per pitcher, from its own leaderboard.
const ACTIVE = { FF: 'fourseam', SI: 'sinker', FC: 'cutter', CH: 'changeup', FS: 'splitter', CU: 'curve', KC: 'curve', SL: 'slider', ST: 'sweeper', SV: 'slurve' };
const activeRows = parseCSV(await (await fetch(`https://baseballsavant.mlb.com/leaderboard/active-spin?year=${season}&min=1&hand=&csv=true`)).text());
const active = Object.fromEntries(activeRows.map(r => [String(r.entity_id), r]));

const all = {};
for (const code of TYPES) {
  all[code] = await fetchType(code);
  console.log(code, all[code].length, 'pitchers');
}
const total = Object.values(all).flat().reduce((s, r) => s + Number(r.pitches), 0);

const out = {};
for (const code of TYPES) {
  const rows = all[code];
  const n = rows.reduce((s, r) => s + Number(r.pitches), 0);
  if (!n) continue;
  const avg = (key, k = 1) => {
    let s = 0, w = 0;
    for (const r of rows) { const v = num(r[key]); if (v == null) continue; s += v * r.pitches; w += Number(r.pitches); }
    return w ? (s / w) * k : null;
  };
  // Middle 80% of pitches, by each pitcher's average speed.
  const speeds = rows.filter(r => num(r.velocity) != null).map(r => [num(r.velocity), Number(r.pitches)]).sort((a, b) => a[0] - b[0]);
  const pct = p => { let c = 0; for (const [v, k] of speeds) { c += k; if (c >= p * n) return v; } return speeds.at(-1)?.[0] ?? null; };
  let whiffs = 0, swings = 0;
  for (const r of rows) { whiffs += num(r.whiffs) || 0; swings += num(r.swings) || 0; }
  const most = rows.reduce((a, b) => (Number(b.pitches) > Number(a.pitches) ? b : a));
  const regulars = rows.filter(r => Number(r.pitches) >= 200);
  const hardest = regulars.length ? regulars.reduce((a, b) => (num(b.velocity) > num(a.velocity) ? b : a)) : null;
  let act = 0, actN = 0;
  for (const r of rows) {
    const v = ACTIVE[code] && num(active[r.player_id]?.['active_spin_' + ACTIVE[code]]);
    if (v != null) { act += v * r.pitches; actN += Number(r.pitches); }
  }
  const name = r => r.player_name.split(', ').reverse().join(' ');
  out[code] = {
    pitches: n,
    share: round((100 * n) / total, 2),
    pitchers: rows.length,
    mph: round(avg('velocity')),
    low: round(pct(0.1)),
    high: round(pct(0.9)),
    rpm: Math.round(avg('spin_rate') ?? 0) || null,
    active: actN ? Math.round(act / actN) : null, // percent of the spin that moves the ball
    rise: round(avg('api_break_z_induced', 12)), // inches, spin only (gravity taken out)
    arm: round(avg('api_break_x_arm', 12)), // inches toward the arm side; negative is glove side
    drop: round(avg('api_break_z_with_gravity', 12)), // inches, gravity included
    height: round(avg('release_pos_z'), 2), // feet
    extension: round(avg('release_extension'), 2), // feet in front of the rubber
    whiff: swings ? round((100 * whiffs) / swings) : null, // misses per 100 swings
    most: { name: name(most), pitches: Number(most.pitches) },
    hardest: hardest && { name: name(hardest), mph: num(hardest.velocity), pitches: Number(hardest.pitches) },
  };
}

const stamp = new Date().toISOString().slice(0, 10);
const js = `// Made by tools/statcast.mjs from Baseball Savant's Statcast search on ${stamp}.
// Every pitch of the ${season} regular season, by pitch type. Averages weight each pitcher by how many they threw.
// rise and arm are spin-induced movement in inches (arm < 0 means toward the glove side); drop includes gravity.
export const SEASON = ${season};
export const TOTAL = ${total};
export const NUMBERS = ${JSON.stringify(out, null, 2).replace(/"(\w+)":/g, '$1:')};
`;
await writeFile(join(root, 'js/numbers.js'), js);
console.log(`wrote js/numbers.js: ${total} pitches`);
